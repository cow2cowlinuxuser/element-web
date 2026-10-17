/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useContext, useEffect, useMemo, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";
import { Tooltip } from "@vector-im/compound-web";
import { useViewModel } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import RoomAvatar from "../avatars/RoomAvatar";
import { NotificationBadge } from "../rooms/NotificationBadge/NotificationBadge";
import { RoomCallParticipants } from "../rooms/RoomListPanel/RoomCallParticipants";
import RoomListStoreV3, { LISTS_LOADED_EVENT, LISTS_UPDATE_EVENT } from "../../../stores/room-list-v3/RoomListStoreV3";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { useEventEmitterState } from "../../../hooks/useEventEmitter";
import { useRoomName } from "../../../hooks/useRoomName";
import { SDKContext } from "../../../contexts/SDKContext";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { type ResizerViewModel } from "../../../viewmodels/structures/ResizerViewModel";

function roomsInActiveSpace(): Room[] {
    return RoomListStoreV3.instance.getSortedRoomsInActiveSpace().sections.flatMap((section) => section.rooms);
}

function useRoomsInActiveSpace(): Room[] {
    const [rooms, setRooms] = useState(roomsInActiveSpace);
    useEffect(() => {
        const store = RoomListStoreV3.instance;
        const update = (): void => setRooms(roomsInActiveSpace());
        store.on(LISTS_UPDATE_EVENT, update);
        store.on(LISTS_LOADED_EVENT, update);
        update();
        return () => {
            store.off(LISTS_UPDATE_EVENT, update);
            store.off(LISTS_LOADED_EVENT, update);
        };
    }, []);
    return rooms;
}

interface RoomProps {
    room: Room;
    selected: boolean;
    narrow: boolean;
}

function SpacePanelRoom({ room, selected, narrow }: RoomProps): JSX.Element {
    const name = useRoomName(room);
    const notification = useMemo(() => RoomNotificationStateStore.instance.getRoomState(room), [room]);

    const onClick = (): void => {
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: room.roomId,
            metricsTrigger: "RoomList",
        });
    };

    return (
        <li className="mx_SpacePanelRooms_item">
            <Tooltip description={name} placement="right" isTriggerInteractive disabled={!narrow}>
                <button
                    type="button"
                    className={classNames("mx_SpacePanelRooms_room", { mx_SpacePanelRooms_selected: selected })}
                    aria-label={name}
                    aria-current={selected ? "page" : undefined}
                    onClick={onClick}
                >
                    <span className="mx_SpacePanelRooms_avatar">
                        <RoomAvatar room={room} size="32px" />
                        <NotificationBadge notification={notification} className="mx_SpacePanelRooms_badge" />
                    </span>
                    {!narrow && <span className="mx_SpacePanelRooms_name">{name}</span>}
                </button>
            </Tooltip>
            <RoomCallParticipants room={room} compact={narrow} />
        </li>
    );
}

interface ListProps {
    /** Whether the space bar is at its narrow width, showing avatars only. */
    isPanelCollapsed: boolean;
}

/**
 * The rooms of the active space, with anyone in a call listed underneath, for when the room list is
 * hidden.
 */
export function SpacePanelRoomList({ isPanelCollapsed }: ListProps): JSX.Element | null {
    const { roomViewStore } = useContext(SDKContext);
    const rooms = useRoomsInActiveSpace();
    const selectedRoomId = useEventEmitterState(roomViewStore, UPDATE_EVENT, () => roomViewStore.getRoomId());

    if (rooms.length === 0) return null;

    return (
        <ul
            className={classNames("mx_SpacePanelRooms", { mx_SpacePanelRooms_narrow: isPanelCollapsed })}
            aria-label={_t("common|rooms")}
        >
            {rooms.map((room) => (
                <SpacePanelRoom
                    key={room.roomId}
                    room={room}
                    selected={room.roomId === selectedRoomId}
                    narrow={isPanelCollapsed}
                />
            ))}
        </ul>
    );
}

interface Props extends ListProps {
    resizer: ResizerViewModel;
}

/** Shows {@link SpacePanelRoomList} only while the room list beside the space bar is collapsed. */
export function SpacePanelRooms({ resizer, isPanelCollapsed }: Props): JSX.Element | null {
    const { isCollapsed } = useViewModel(resizer);
    if (!isCollapsed) return null;
    return <SpacePanelRoomList isPanelCollapsed={isPanelCollapsed} />;
}
