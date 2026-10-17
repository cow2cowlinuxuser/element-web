/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { memo, type JSX, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/react";
import { Feedback } from "@dnd-kit/dom";
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import { useMergeRefs } from "react-merge-refs";

import { RoomListItemView, type Room, type RoomListItemViewProps } from "./RoomListItemView";
import { getItemAccessibleProps } from "../../../core/VirtualizedList";
import { useViewModel } from "../../../core/viewmodel";
import { type RoomDragData } from "../dragAndDrop";

export interface RoomListItemWrapperProps extends RoomListItemViewProps {
    /** Index of this room in the list */
    roomIndex: number;
    /** Index of this room in its section */
    roomIndexInSection: number;
    /** Total number of rooms in the list */
    roomCount: number;
    /** Whether the room list is displayed as a flat list */
    isInFlatList: boolean;
    /** Optional render function for content shown below the room, such as who is in its call */
    renderRoomFooter?: (room: Room) => ReactNode;
}

/**
 * Wraps RoomListItemView with the correct accessibility and drag-and-drop props
 * based on whether the list is flat (listbox) or grouped (treegrid).
 */
export const RoomListItemWrapper = memo(function RoomListItemWrapper({
    roomIndex,
    roomCount,
    roomIndexInSection,
    isInFlatList,
    renderRoomFooter,
    ...rest
}: RoomListItemWrapperProps): JSX.Element {
    if (isInFlatList) {
        return (
            <>
                <RoomListItemView {...rest} {...getItemAccessibleProps("listbox", roomIndex, roomCount)} />
                <RoomFooter vm={rest.vm} renderRoomFooter={renderRoomFooter} />
            </>
        );
    }

    const isFirstInSection = roomIndexInSection === 0;
    return (
        <div {...getItemAccessibleProps("treegrid", roomIndex, roomIndexInSection)}>
            <div role="gridcell" aria-selected={rest.isSelected}>
                <DraggableWrapper
                    {...rest}
                    onKeyDown={(e) => {
                        if (e.code === "ArrowLeft" && isFirstInSection) {
                            // Move focus to the section header
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.dispatchEvent(
                                new KeyboardEvent("keydown", {
                                    code: "ArrowUp",
                                    key: "ArrowUp",
                                    bubbles: true,
                                }),
                            );
                        }
                    }}
                />
                <RoomFooter vm={rest.vm} renderRoomFooter={renderRoomFooter} />
            </div>
        </div>
    );
});

/**
 * Renders whatever the client wants to show below a room. Kept outside the room's button, since the
 * footer may contain buttons of its own.
 */
function RoomFooter({
    vm,
    renderRoomFooter,
}: Pick<RoomListItemViewProps, "vm"> & Pick<RoomListItemWrapperProps, "renderRoomFooter">): ReactNode {
    const item = useViewModel(vm);
    return renderRoomFooter?.(item.room) ?? null;
}

/**
 * Wraps RoomListItemView with the drag-and-drop functionality. This is only used for treegrid mode, as flat list items are not draggable.
 */
function DraggableWrapper(props: RoomListItemViewProps): JSX.Element {
    const item = useViewModel(props.vm);
    const {
        ref: draggableRef,
        handleRef,
        isDragSource,
    } = useDraggable<RoomDragData>({
        id: item.id,
        data: { type: "room", isDm: item.isDm },
        // We clone the item in the dnd overlay to avoid putting a hole in the list
        plugins: [Feedback.configure({ feedback: "clone" })],
        modifiers: [RestrictToVerticalAxis],
        disabled: !item.canChangeSection,
    });
    const dndRef = useMergeRefs([draggableRef, handleRef]);
    // Only wire up the draggable refs when the room can be dragged, otherwise dndkit puts incorrect
    // and misleading a11y attributes on the item (aria-disabled=true and aria-draggable=false)
    return <RoomListItemView {...props} ref={item.canChangeSection ? dndRef : undefined} isDragSource={isDragSource} />;
}
