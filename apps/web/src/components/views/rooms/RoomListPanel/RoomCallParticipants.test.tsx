/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { PendingEventOrdering, Room, type RoomMember } from "matrix-js-sdk/src/matrix";
import { mkRoomMember, stubClient } from "test-utils";

import { buildCallParticipantRows, RoomCallParticipants } from "./RoomCallParticipants";
import { type Call, type ElementCallParticipant } from "../../../../models/Call";
import { useCall, useLiveParticipants, useParticipatingMembers } from "../../../../hooks/useCall";
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { Action } from "../../../../dispatcher/actions";

vi.mock("../../../../hooks/useCall", () => ({
    useCall: vi.fn(),
    useLiveParticipants: vi.fn(),
    useParticipatingMembers: vi.fn(),
}));

const roomId = "!call:example.org";

const participant = (overrides: Partial<ElementCallParticipant>): ElementCallParticipant => ({
    id: "alice:0",
    userId: "@alice:example.org",
    displayName: "Alice",
    local: false,
    speaking: false,
    audioEnabled: true,
    videoEnabled: false,
    screenSharing: false,
    ...overrides,
});

describe("buildCallParticipantRows", () => {
    const alice = mkRoomMember(roomId, "@alice:example.org");
    const bob = mkRoomMember(roomId, "@bob:example.org");

    it("falls back to the room state when the call hasn't reported anyone", () => {
        expect(buildCallParticipantRows([alice, bob], [])).toEqual([
            expect.objectContaining({ userId: alice.userId, member: alice, speaking: false, audioEnabled: null }),
            expect.objectContaining({ userId: bob.userId, member: bob, speaking: false, audioEnabled: null }),
        ]);
    });

    it("prefers what the call reports, merging a user's devices", () => {
        const rows = buildCallParticipantRows(
            [alice],
            [
                participant({ id: "alice:0", audioEnabled: false }),
                participant({ id: "alice:1", speaking: true, screenSharing: true, audioEnabled: true }),
                participant({ id: "bob:0", userId: bob.userId, displayName: "Bob" }),
            ],
        );
        expect(rows).toEqual([
            expect.objectContaining({
                userId: alice.userId,
                member: alice,
                speaking: true,
                screenSharing: true,
                audioEnabled: true,
            }),
            expect.objectContaining({ userId: bob.userId, displayName: "Bob", member: null }),
        ]);
    });
});

describe("RoomCallParticipants", () => {
    let room: Room;
    let call: {
        focusParticipant: ReturnType<typeof vi.fn>;
        setParticipantAudio: ReturnType<typeof vi.fn>;
        setDeviceMute: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        off: ReturnType<typeof vi.fn>;
        audioMuted: boolean;
        deafened: boolean;
    };

    beforeEach(() => {
        localStorage.clear();
        const client = stubClient();
        room = new Room(roomId, client, "@me:example.org", { pendingEventOrdering: PendingEventOrdering.Detached });
        room.name = "Hangout";
        call = {
            focusParticipant: vi.fn(async () => {}),
            setParticipantAudio: vi.fn(async () => {}),
            setDeviceMute: vi.fn(async () => {}),
            on: vi.fn(),
            off: vi.fn(),
            audioMuted: false,
            deafened: false,
        };
        vi.mocked(useCall).mockReturnValue(call as unknown as Call);
        vi.mocked(useParticipatingMembers).mockReturnValue([] as RoomMember[]);
        vi.mocked(useLiveParticipants).mockReturnValue([]);
    });

    it("renders nothing without a call", () => {
        vi.mocked(useCall).mockReturnValue(null);
        const { container } = render(<RoomCallParticipants room={room} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when nobody is in the call", () => {
        const { container } = render(<RoomCallParticipants room={room} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("lists everyone, showing who is speaking, muted or sharing their screen", () => {
        vi.mocked(useLiveParticipants).mockReturnValue([
            participant({ id: "me:0", userId: "@me:example.org", displayName: "Me", local: true, speaking: true }),
            participant({ audioEnabled: false, screenSharing: true }),
        ]);
        render(<RoomCallParticipants room={room} />);

        const list = screen.getByRole("list", { name: "People in the call in Hangout" });
        expect(list.children).toHaveLength(2);

        const me = screen.getByRole("button", { name: /Me \(you\)/ });
        expect(me).toHaveAttribute("data-speaking", "true");

        const alice = screen.getByRole("button", { name: /Alice/ });
        expect(alice).toHaveAttribute("data-speaking", "false");
        expect(alice).toHaveAttribute("title", "Show Alice's screen in the call");
        expect(screen.getByLabelText("Muted")).toBeInTheDocument();
        expect(screen.getByLabelText("Sharing their screen")).toBeInTheDocument();
    });

    it("can show avatars only, keeping names for screen readers", () => {
        vi.mocked(useLiveParticipants).mockReturnValue([participant({ audioEnabled: false })]);
        render(<RoomCallParticipants room={room} compact />);

        expect(screen.getByRole("list")).toHaveClass("mx_RoomCallParticipants_compact");
        expect(screen.getByRole("button", { name: /Alice/ })).toHaveAttribute("title", "Show Alice in the call");
        expect(screen.getByLabelText("Muted")).toBeInTheDocument();
    });

    it("opens the call focused on someone when they're clicked", async () => {
        vi.mocked(useLiveParticipants).mockReturnValue([participant({})]);
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        render(<RoomCallParticipants room={room} />);

        await userEvent.click(screen.getByRole("button", { name: /Alice/ }));

        expect(dispatch).toHaveBeenCalledWith({
            action: Action.ViewRoom,
            room_id: roomId,
            view_call: true,
            metricsTrigger: "RoomList",
        });
        expect(call.focusParticipant).toHaveBeenCalledWith("@alice:example.org");
        dispatch.mockRestore();
    });

    it("opens the participant audio context menu on right-click with mute, volume, pan, and EQ controls", async () => {
        const aliceMember = mkRoomMember(roomId, "@alice:example.org");
        vi.mocked(useParticipatingMembers).mockReturnValue([aliceMember]);
        vi.mocked(useLiveParticipants).mockReturnValue([participant({})]);
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        const { fireEvent } = await import("test-utils-rtl");
        render(<RoomCallParticipants room={room} />);

        fireEvent.contextMenu(screen.getByRole("button", { name: /Alice/ }));

        const menu = screen.getByTestId("participant-audio-menu");
        expect(menu).toBeInTheDocument();

        // Toggle mute
        await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Mute" }));
        expect(call.setParticipantAudio).toHaveBeenCalledWith({
            user_id: "@alice:example.org",
            muted: true,
        });

        // Adjust volume slider
        const volumeSlider = screen.getByRole("slider", { name: "User Volume" });
        fireEvent.change(volumeSlider, { target: { value: "65" } });
        expect(call.setParticipantAudio).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: "@alice:example.org",
                volume: 0.65,
            }),
        );

        // Reset audio
        await userEvent.click(screen.getByRole("menuitem", { name: "Reset audio" }));
        expect(call.setParticipantAudio).toHaveBeenCalledWith({
            user_id: "@alice:example.org",
            reset: true,
        });

        // Open Profile
        await userEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
        expect(dispatch).toHaveBeenCalledWith({
            action: Action.ViewUser,
            member: aliceMember,
        });
        dispatch.mockRestore();
    });
});
