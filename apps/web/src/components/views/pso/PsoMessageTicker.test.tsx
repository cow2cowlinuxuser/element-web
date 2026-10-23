/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import { mkMessage, stubClient } from "test-utils";
import { type MatrixEvent, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { PsoMessageTicker } from "./PsoMessageTicker";

const ROOM_ID = "!lobby:example.org";

function emitLive(client: ReturnType<typeof stubClient>, ev: MatrixEvent, roomId = ROOM_ID): void {
    act(() => {
        client.emit(RoomEvent.Timeline, ev, { roomId } as Room, false, false, { liveEvent: true, timeline: {} as any });
    });
}

describe("PsoMessageTicker", () => {
    it("shows new messages from other people in every room, prefixed with the room name", () => {
        const client = stubClient();
        const names: Record<string, string> = { [ROOM_ID]: "Lobby", "!dm:example.org": "@bob:example.org" };
        vi.mocked(client.getRoom).mockImplementation((id) => ({ roomId: id, name: names[id!] }) as unknown as Room);
        render(<PsoMessageTicker client={client} />);
        expect(screen.queryByTestId("pso-message-ticker")).toBeNull();

        emitLive(client, mkMessage({ event: true, room: ROOM_ID, user: "@alice:example.org", msg: "Rappy spotted" }));
        expect(screen.getByTestId("pso-message-ticker")).toHaveTextContent("(Lobby) @alice:example.org: Rappy spotted");

        emitLive(client, mkMessage({ event: true, room: "!dm:example.org", user: "@bob:example.org", msg: "hi" }), "!dm:example.org");
        expect(screen.getByTestId("pso-message-ticker")).toHaveTextContent("@bob:example.org: hi");
        expect(screen.getByTestId("pso-message-ticker")).not.toHaveTextContent("(@bob:example.org)");

        emitLive(client, mkMessage({ event: true, room: ROOM_ID, user: client.getUserId()!, msg: "my own" }));
        expect(screen.getByTestId("pso-message-ticker")).not.toHaveTextContent("my own");
    });
});
