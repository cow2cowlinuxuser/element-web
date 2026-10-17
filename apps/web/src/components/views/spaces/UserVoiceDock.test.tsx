/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { PendingEventOrdering, Room } from "matrix-js-sdk/src/matrix";
import { stubClient, TestSDKContext, wrapInSdkContext } from "test-utils";

import { UserVoiceDock as UnwrappedUserVoiceDock } from "./UserVoiceDock";
import { CallStore, CallStoreEvent } from "../../../stores/CallStore";
import { type Call, CallEvent } from "../../../models/Call";
import { OwnProfileStore } from "../../../stores/OwnProfileStore";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";

describe("UserVoiceDock", () => {
    let sdkContext: TestSDKContext;
    let room: Room;

    beforeEach(() => {
        localStorage.clear();
        const client = stubClient();
        sdkContext = new TestSDKContext();
        sdkContext._client = client;

        room = new Room("!voice:example.org", client, "@me:example.org", {
            pendingEventOrdering: PendingEventOrdering.Detached,
        });
        room.name = "Mic";
        vi.mocked(client.getRoom).mockImplementation((id) => (id === room.roomId ? room : null));
        vi.spyOn(OwnProfileStore.instance, "displayName", "get").mockReturnValue("nipah virus carrier");
        vi.spyOn(OwnProfileStore.instance, "getHttpAvatarUrl").mockReturnValue("https://example.org/avatar.png");
        vi.spyOn(CallStore.instance, "connectedCalls", "get").mockReturnValue(new Set());
    });

    it("renders the bottom-left user profile bar and dispatches user menu and settings actions", async () => {
        const dispatchSpy = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        const UserVoiceDock = wrapInSdkContext(UnwrappedUserVoiceDock, sdkContext);
        render(<UserVoiceDock />);

        expect(screen.getByTestId("user-voice-dock-profile")).toBeInTheDocument();
        expect(screen.queryByTestId("user-voice-dock-connected")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "nipah virus carrier" }));
        expect(dispatchSpy).toHaveBeenCalledWith({ action: Action.ToggleUserMenu });

        await userEvent.click(screen.getByRole("button", { name: "Settings" }));
        expect(dispatchSpy).toHaveBeenCalledWith({ action: Action.ViewUserSettings });
        dispatchSpy.mockRestore();
    });

    it("auto-populates the Voice Connected bar and controls when connected to a call", async () => {
        const dispatchSpy = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        const mockCall = {
            roomId: room.roomId,
            audioMuted: false,
            videoMuted: true,
            deafened: false,
            liveParticipants: [
                {
                    id: "me:0",
                    userId: "@me:example.org",
                    displayName: "nipah virus carrier",
                    local: true,
                    speaking: true,
                    audioEnabled: true,
                    videoEnabled: false,
                    screenSharing: false,
                },
            ],
            setDeviceMute: vi.fn(async () => {}),
            toggleScreenSharing: vi.fn(async () => {}),
            disconnect: vi.fn(async () => {}),
            on: vi.fn(),
            off: vi.fn(),
        } as unknown as Call;

        vi.spyOn(CallStore.instance, "connectedCalls", "get").mockReturnValue(new Set([mockCall]));
        const UserVoiceDock = wrapInSdkContext(UnwrappedUserVoiceDock, sdkContext);
        render(<UserVoiceDock />);

        act(() => {
            CallStore.instance.emit(CallStoreEvent.ConnectedCalls, new Set([mockCall]), new Set());
            mockCall.emit?.(CallEvent.LiveParticipants, mockCall.liveParticipants);
        });

        expect(screen.getByTestId("user-voice-dock-connected")).toBeInTheDocument();
        expect(screen.getByText("Voice Connected")).toBeInTheDocument();
        expect(screen.getByText("In voice")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Turn on camera" }));
        expect(mockCall.setDeviceMute).toHaveBeenCalledWith({ video_enabled: true });

        await userEvent.click(screen.getByRole("button", { name: "Start sharing your screen" }));
        expect(mockCall.toggleScreenSharing).toHaveBeenCalledOnce();

        await userEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
        expect(mockCall.setDeviceMute).toHaveBeenCalledWith({ audio_enabled: false });

        await userEvent.click(screen.getByRole("button", { name: "Deafen" }));
        expect(mockCall.setDeviceMute).toHaveBeenCalledWith({ deafened: true });

        await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
        expect(mockCall.disconnect).toHaveBeenCalledOnce();
        dispatchSpy.mockRestore();
    });
});
