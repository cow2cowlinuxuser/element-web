/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { PendingEventOrdering, Room, type RoomMember, TypedEventEmitter } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import { MinimisedCallPill, MinimisedCallSlot } from "./MinimisedCallPill";
import { type Call, CallEvent, type ElementCallParticipant } from "../../../models/Call";
import { MinimisedCallPipStore } from "../../../stores/MinimisedCallPipStore";

class FakeCall extends TypedEventEmitter<CallEvent, any> {
    public liveParticipants: ElementCallParticipant[] = [];
    public participants = new Map<RoomMember, Set<string>>();

    public setLive(participants: ElementCallParticipant[]): void {
        this.liveParticipants = participants;
        this.emit(CallEvent.LiveParticipants, participants);
    }
}

const participant = (overrides: Partial<ElementCallParticipant>): ElementCallParticipant => ({
    id: "id",
    userId: "@alice:example.org",
    displayName: "Alice",
    local: false,
    speaking: false,
    audioEnabled: true,
    videoEnabled: false,
    screenSharing: false,
    ...overrides,
});

function setUp(): { call: FakeCall; room: Room } {
    const client = stubClient();
    const room = new Room("!call:example.org", client, "@me:example.org", {
        pendingEventOrdering: PendingEventOrdering.Detached,
    });
    room.name = "Hangout";
    return { call: new FakeCall(), room };
}

describe("MinimisedCallPill", () => {
    it("shows the room and how many people are in the call", () => {
        const { call, room } = setUp();
        call.participants = new Map([[{} as RoomMember, new Set(["A", "B"])]]);
        render(<MinimisedCallPill call={call as unknown as Call} room={room} onRestore={() => {}} />);

        const pill = screen.getByTestId("minimised-call-pill");
        expect(pill).toHaveTextContent("Hangout");
        expect(pill).toHaveTextContent("2");
        expect(pill).toHaveAccessibleName("Return to call in Hangout, 2 people");
    });

    it("lights up while the local user is speaking", () => {
        const { call, room } = setUp();
        const { container } = render(
            <MinimisedCallPill call={call as unknown as Call} room={room} onRestore={() => {}} />,
        );
        const dot = container.querySelector(".mx_MinimisedCallPill_speaking")!;
        expect(dot).toHaveAttribute("data-speaking", "false");

        act(() =>
            call.setLive([
                participant({ id: "me", userId: "@me:example.org", local: true, speaking: true }),
                participant({}),
            ]),
        );
        expect(dot).toHaveAttribute("data-speaking", "true");
        // Element Call's report is preferred over the room state for the count
        expect(screen.getByTestId("minimised-call-pill")).toHaveTextContent("2");

        // Someone else speaking doesn't count
        act(() =>
            call.setLive([
                participant({ id: "me", userId: "@me:example.org", local: true }),
                participant({ speaking: true }),
            ]),
        );
        expect(dot).toHaveAttribute("data-speaking", "false");
    });

    it("restores the call window when clicked", async () => {
        const { call, room } = setUp();
        const onRestore = vi.fn();
        render(<MinimisedCallPill call={call as unknown as Call} room={room} onRestore={onRestore} />);
        await userEvent.click(screen.getByTestId("minimised-call-pill"));
        expect(onRestore).toHaveBeenCalled();
    });
});

describe("MinimisedCallSlot", () => {
    it("registers itself as the place to dock the pill while mounted", () => {
        const { container, unmount } = render(<MinimisedCallSlot />);
        expect(MinimisedCallPipStore.instance.getState().slot).toBe(container.firstChild);
        unmount();
        expect(MinimisedCallPipStore.instance.getState().slot).toBeNull();
    });
});
