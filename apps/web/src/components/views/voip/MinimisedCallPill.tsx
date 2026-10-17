/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type FC, useCallback, useRef } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Tooltip } from "@vector-im/compound-web";
import VideoCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/video-call-solid";
import UserIcon from "@vector-im/compound-design-tokens/assets/web/icons/user-solid";

import { type Call } from "../../../models/Call";
import { useLiveParticipants, useParticipantCount } from "../../../hooks/useCall";
import { useRoomName } from "../../../hooks/useRoomName";
import { _t } from "../../../languageHandler";
import { MinimisedCallPipStore } from "../../../stores/MinimisedCallPipStore";

/**
 * A place in the page (the room header) where a minimised call's pill can dock.
 */
export const MinimisedCallSlot: FC = () => {
    const current = useRef<HTMLElement | null>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
        if (element !== null) {
            current.current = element;
            MinimisedCallPipStore.instance.setSlot(element);
        } else {
            MinimisedCallPipStore.instance.setSlot(null, current.current);
            current.current = null;
        }
    }, []);
    return <div ref={ref} className="mx_MinimisedCallSlot" />;
};

interface Props {
    call: Call;
    room: Room;
    /** Brings the floating call window back. */
    onRestore: () => void;
}

/**
 * What the floating call window collapses into when minimised: the room, how many people are in
 * the call, and whether the user is currently being heard.
 */
export const MinimisedCallPill: FC<Props> = ({ call, room, onRestore }) => {
    const roomName = useRoomName(room);
    const liveParticipants = useLiveParticipants(call);
    const memberCount = useParticipantCount(call);
    // Element Call's own report is more current than the room state, when we have it
    const count = liveParticipants.length > 0 ? liveParticipants.length : memberCount;
    const speaking = liveParticipants.some((p) => p.local && p.speaking);

    return (
        <Tooltip description={_t("voip|expand")}>
            <button
                type="button"
                className="mx_MinimisedCallPill"
                data-testid="minimised-call-pill"
                onClick={onRestore}
                aria-label={_t("voip|minimised_call_label", { roomName, count })}
            >
                <span
                    className="mx_MinimisedCallPill_speaking"
                    data-speaking={speaking}
                    title={speaking ? _t("voip|you_are_speaking") : undefined}
                />
                <VideoCallIcon className="mx_MinimisedCallPill_icon" width="16px" height="16px" />
                <span className="mx_MinimisedCallPill_name">{roomName}</span>
                <span className="mx_MinimisedCallPill_count">
                    <UserIcon width="14px" height="14px" />
                    {count}
                </span>
            </button>
        </Tooltip>
    );
};
