/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { PendingEventOrdering, Room, TypedEventEmitter } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";
import { type ResizerViewSnapshot } from "@element-hq/web-shared-components";

import { SpacePanelRoomList, SpacePanelRooms } from "./SpacePanelRooms";
import RoomListStoreV3, {
    LISTS_UPDATE_EVENT,
    type RoomListStoreV3Class,
} from "../../../stores/room-list-v3/RoomListStoreV3";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { SDKContext } from "../../../contexts/SDKContext";
import { type SDKContextClass } from "../../../contexts/SDKContextClass";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ResizerViewModel } from "../../../viewmodels/structures/ResizerViewModel";
import DMRoomMap from "../../../utils/DMRoomMap";

vi.mock("../rooms/RoomListPanel/RoomCallParticipants", () => ({
    RoomCallParticipants: ({ room, compact }: { room: Room; compact?: boolean }) => (
        <div data-testid={`participants-${room.roomId}`} data-compact={String(!!compact)} />
    ),
}));
vi.mock("../rooms/NotificationBadge/NotificationBadge", () => ({
    NotificationBadge: () => null,
}));

class EventEmitter extends TypedEventEmitter<string, Record<string, () => void>> {}

class FakeRoomList extends EventEmitter {
    public rooms: Room[] = [];
    public getSortedRoomsInActiveSpace = (): { spaceId: string; sections: { tag: string; rooms: Room[] }[] } => ({
        spaceId: "home",
        sections: [
            { tag: "favourites", rooms: this.rooms.slice(0, 1) },
            { tag: "chats", rooms: this.rooms.slice(1) },
        ],
    });
}

class FakeRoomViewStore extends EventEmitter {
    public roomId: string | null = null;
    public getRoomId = (): string | null => this.roomId;
}

class FakeResizer extends EventEmitter {
    public snapshot: ResizerViewSnapshot = { isCollapsed: false };
    public getSnapshot = (): ResizerViewSnapshot => this.snapshot;
    public subscribe = (listener: () => void): (() => void) => {
        this.on("change", listener);
        return () => this.off("change", listener);
    };
    public setCollapsed(isCollapsed: boolean): void {
        this.snapshot = { isCollapsed };
        this.emit("change");
    }
}

describe("SpacePanelRooms", () => {
    let roomList: FakeRoomList;
    let roomViewStore: FakeRoomViewStore;
    let general: Room;
    let games: Room;

    beforeEach(() => {
        const client = stubClient();
        DMRoomMap.makeShared(client);
        const makeRoom = (roomId: string, name: string): Room => {
            const room = new Room(roomId, client, "@me:example.org", {
                pendingEventOrdering: PendingEventOrdering.Detached,
            });
            room.name = name;
            return room;
        };
        general = makeRoom("!general:example.org", "General");
        games = makeRoom("!games:example.org", "Games");
        roomList = new FakeRoomList();
        roomList.rooms = [general, games];
        vi.spyOn(RoomListStoreV3, "instance", "get").mockReturnValue(roomList as unknown as RoomListStoreV3Class);
        roomViewStore = new FakeRoomViewStore();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function renderWithContext(ui: React.ReactElement): ReturnType<typeof render> {
        return render(
            <SDKContext.Provider value={{ roomViewStore } as unknown as SDKContextClass}>{ui}</SDKContext.Provider>,
        );
    }

    it("lists every room of the active space, marking the open one", () => {
        roomViewStore.roomId = games.roomId;
        renderWithContext(<SpacePanelRoomList isPanelCollapsed={true} />);

        const list = screen.getByRole("list", { name: "Rooms" });
        expect(list.children).toHaveLength(2);
        expect(screen.getByRole("button", { name: "General" })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("button", { name: "Games" })).toHaveAttribute("aria-current", "page");
    });

    it("follows the room list and the open room", () => {
        renderWithContext(<SpacePanelRoomList isPanelCollapsed={true} />);

        act(() => {
            roomList.rooms = [general];
            roomList.emit(LISTS_UPDATE_EVENT);
        });
        expect(screen.queryByRole("button", { name: "Games" })).toBeNull();

        act(() => {
            roomViewStore.roomId = general.roomId;
            roomViewStore.emit(UPDATE_EVENT);
        });
        expect(screen.getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    });

    it("opens a room when clicked", async () => {
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        renderWithContext(<SpacePanelRoomList isPanelCollapsed={true} />);

        await userEvent.click(screen.getByRole("button", { name: "Games" }));
        expect(dispatch).toHaveBeenCalledWith({
            action: Action.ViewRoom,
            room_id: games.roomId,
            metricsTrigger: "RoomList",
        });
    });

    it("shows avatars and compact call participants while the space bar is narrow", () => {
        renderWithContext(<SpacePanelRoomList isPanelCollapsed={true} />);
        expect(screen.queryByText("General")).toBeNull();
        expect(screen.getByTestId(`participants-${general.roomId}`)).toHaveAttribute("data-compact", "true");
    });

    it("shows names and full call participants while the space bar is expanded", () => {
        renderWithContext(<SpacePanelRoomList isPanelCollapsed={false} />);
        expect(screen.getByText("General")).toBeInTheDocument();
        expect(screen.getByTestId(`participants-${general.roomId}`)).toHaveAttribute("data-compact", "false");
    });

    it("renders nothing for a space without rooms", () => {
        roomList.rooms = [];
        const { container } = renderWithContext(<SpacePanelRoomList isPanelCollapsed={true} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("appears only while the room list is collapsed", () => {
        const resizer = new FakeResizer();
        renderWithContext(<SpacePanelRooms resizer={resizer as unknown as ResizerViewModel} isPanelCollapsed={true} />);
        expect(screen.queryByRole("list", { name: "Rooms" })).toBeNull();

        act(() => resizer.setCollapsed(true));
        expect(screen.getByRole("list", { name: "Rooms" })).toBeInTheDocument();

        act(() => resizer.setCollapsed(false));
        expect(screen.queryByRole("list", { name: "Rooms" })).toBeNull();
    });
});
