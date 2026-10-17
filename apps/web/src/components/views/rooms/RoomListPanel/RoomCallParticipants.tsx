/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useMemo, useState } from "react";
import { type Room, type RoomMember } from "matrix-js-sdk/src/matrix";
import ShareScreenIcon from "@vector-im/compound-design-tokens/assets/web/icons/share-screen-solid";
import MicOffIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-off-solid";
import classNames from "classnames";

import { CallEvent, type ElementCallParticipant } from "../../../../models/Call";
import { useCall, useLiveParticipants, useParticipatingMembers } from "../../../../hooks/useCall";
import { useTypedEventEmitterState } from "../../../../hooks/useEventEmitter";
import MemberAvatar from "../../avatars/MemberAvatar";
import ContextMenu, { ChevronFace } from "../../../structures/ContextMenu";
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { Action } from "../../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../../dispatcher/payloads/ViewRoomPayload";
import { _t } from "../../../../languageHandler";

export interface CallParticipantRow {
    userId: string;
    displayName: string;
    member: RoomMember | null;
    local: boolean;
    speaking: boolean;
    /** Null when we don't know, because the user isn't in the call to hear about it. */
    audioEnabled: boolean | null;
    screenSharing: boolean;
    playbackMuted?: boolean;
}

interface StoredPeerAudio {
    volume: number;
    pan: number;
    bass: number;
    mid: number;
    treble: number;
}

const PEER_AUDIO_STORAGE_KEY = "matrix-setting-peer-audio";
const DEFAULT_PEER_AUDIO: StoredPeerAudio = {
    volume: 1,
    pan: 0,
    bass: 0,
    mid: 0,
    treble: 0,
};

function readPeerAudio(userId: string): StoredPeerAudio {
    try {
        const all = JSON.parse(localStorage.getItem(PEER_AUDIO_STORAGE_KEY) ?? "{}") as Record<
            string,
            Partial<StoredPeerAudio>
        >;
        const entry = all[userId] ?? {};
        return {
            volume: typeof entry.volume === "number" ? entry.volume : 1,
            pan: typeof entry.pan === "number" ? entry.pan : 0,
            bass: typeof entry.bass === "number" ? entry.bass : 0,
            mid: typeof entry.mid === "number" ? entry.mid : 0,
            treble: typeof entry.treble === "number" ? entry.treble : 0,
        };
    } catch {
        return { ...DEFAULT_PEER_AUDIO };
    }
}

function writePeerAudio(userId: string, next: StoredPeerAudio): void {
    try {
        const all = JSON.parse(localStorage.getItem(PEER_AUDIO_STORAGE_KEY) ?? "{}") as Record<
            string,
            Partial<StoredPeerAudio>
        >;
        const isDefault = next.volume === 1 && next.pan === 0 && next.bass === 0 && next.mid === 0 && next.treble === 0;
        if (isDefault) {
            delete all[userId];
        } else {
            all[userId] = next;
        }
        localStorage.setItem(PEER_AUDIO_STORAGE_KEY, JSON.stringify(all));
    } catch {
        // Ignore storage errors
    }
}

function formatPanLabel(pan: number): string {
    const pct = Math.round(Math.abs(pan) * 100);
    if (pct === 0) return "C";
    return pan < 0 ? `L ${pct}%` : `R ${pct}%`;
}

function formatDbLabel(db: number): string {
    const rounded = Math.round(db);
    return `${rounded > 0 ? "+" : ""}${rounded} dB`;
}

/**
 * Combines who the room state says is in the call with what the call itself reports (available
 * only while connected), giving one row per user.
 */
export function buildCallParticipantRows(members: RoomMember[], live: ElementCallParticipant[]): CallParticipantRow[] {
    const rows = new Map<string, CallParticipantRow>();
    for (const p of live) {
        const existing = rows.get(p.userId);
        if (existing) {
            // The same user on several devices counts as speaking or sharing if any device is
            existing.speaking ||= p.speaking;
            existing.screenSharing ||= p.screenSharing;
            existing.audioEnabled = (existing.audioEnabled ?? false) || p.audioEnabled;
            existing.local ||= p.local;
            if (p.playbackMuted) existing.playbackMuted = true;
        } else {
            rows.set(p.userId, {
                userId: p.userId,
                displayName: p.displayName,
                member: members.find((m) => m.userId === p.userId) ?? null,
                local: p.local,
                speaking: p.speaking,
                audioEnabled: p.audioEnabled,
                screenSharing: p.screenSharing,
                ...(p.playbackMuted ? { playbackMuted: true } : {}),
            });
        }
    }
    // Before Element Call has reported anything (or when not connected), fall back to the room state
    if (live.length === 0) {
        for (const member of members) {
            rows.set(member.userId, {
                userId: member.userId,
                displayName: member.name,
                member,
                local: false,
                speaking: false,
                audioEnabled: null,
                screenSharing: false,
            });
        }
    }
    return [...rows.values()];
}

interface Props {
    room: Room;
    /** Avatars and icons only, for narrow places like the space bar. Names stay available as tooltips. */
    compact?: boolean;
}

/**
 * Lists who is in a room's call underneath the room in the room list. Clicking someone opens the call
 * focused on them, showing their screen share if they have one. Right-clicking opens their audio and
 * mute context menu.
 */
export function RoomCallParticipants({ room, compact }: Props): JSX.Element | null {
    const call = useCall(room.roomId);
    const members = useParticipatingMembers(call);
    const live = useLiveParticipants(call);
    const rows = useMemo(() => buildCallParticipantRows(members, live), [members, live]);

    const [menuState, setMenuState] = useState<{
        userId: string;
        x: number;
        y: number;
    } | null>(null);
    const [peerAudio, setPeerAudio] = useState<StoredPeerAudio>(DEFAULT_PEER_AUDIO);

    const deviceMute = useTypedEventEmitterState(
        call ?? undefined,
        CallEvent.DeviceMute,
        useCallback(
            () => ({
                audioMuted: call?.audioMuted ?? false,
                deafened: call?.deafened ?? false,
            }),
            [call],
        ),
    );

    if (call === null || rows.length === 0) return null;

    const onClick = (userId: string): void => {
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: room.roomId,
            view_call: true,
            metricsTrigger: "RoomList",
        });
        void call.focusParticipant(userId);
    };

    const onContextMenu = (e: React.MouseEvent, row: CallParticipantRow): void => {
        e.preventDefault();
        e.stopPropagation();
        setPeerAudio(readPeerAudio(row.userId));
        setMenuState({ userId: row.userId, x: e.clientX, y: e.clientY });
    };

    const activeRow = menuState ? (rows.find((r) => r.userId === menuState.userId) ?? null) : null;

    const updateAudioField = (userId: string, patch: Partial<StoredPeerAudio>): void => {
        const next: StoredPeerAudio = { ...peerAudio, ...patch };
        setPeerAudio(next);
        writePeerAudio(userId, next);
        void call.setParticipantAudio({
            user_id: userId,
            ...patch,
        });
    };

    const onResetAudio = (userId: string): void => {
        setPeerAudio({ ...DEFAULT_PEER_AUDIO });
        writePeerAudio(userId, { ...DEFAULT_PEER_AUDIO });
        void call.setParticipantAudio({
            user_id: userId,
            reset: true,
        });
    };

    const isMuted = activeRow ? (activeRow.local ? deviceMute.audioMuted : Boolean(activeRow.playbackMuted)) : false;

    return (
        <>
            <ul
                className={classNames("mx_RoomCallParticipants", { mx_RoomCallParticipants_compact: compact })}
                aria-label={_t("voip|call_participants_label", { roomName: room.name })}
            >
                {rows.map((row) => (
                    <li key={row.userId}>
                        <button
                            type="button"
                            className={classNames("mx_RoomCallParticipants_participant", {
                                mx_RoomCallParticipants_speaking: row.speaking,
                            })}
                            onClick={() => onClick(row.userId)}
                            onContextMenu={(e) => onContextMenu(e, row)}
                            title={
                                row.screenSharing
                                    ? _t("voip|view_participant_screen", { name: row.displayName })
                                    : _t("voip|view_participant", { name: row.displayName })
                            }
                            data-speaking={row.speaking}
                        >
                            <span className="mx_RoomCallParticipants_avatar">
                                {row.member ? (
                                    <MemberAvatar member={row.member} size="20px" hideTitle />
                                ) : (
                                    <span className="mx_RoomCallParticipants_avatarFallback" aria-hidden="true">
                                        {row.displayName.replace(/^@/, "").charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </span>
                            <span className="mx_RoomCallParticipants_name">
                                {row.local ? _t("voip|participant_you", { name: row.displayName }) : row.displayName}
                            </span>
                            {(row.audioEnabled === false || row.playbackMuted) && (
                                <MicOffIcon
                                    className="mx_RoomCallParticipants_icon"
                                    width="14px"
                                    height="14px"
                                    aria-label={_t("voip|participant_muted")}
                                />
                            )}
                            {row.screenSharing && (
                                <ShareScreenIcon
                                    className="mx_RoomCallParticipants_icon mx_RoomCallParticipants_sharing"
                                    width="14px"
                                    height="14px"
                                    aria-label={_t("voip|participant_sharing_screen")}
                                />
                            )}
                        </button>
                    </li>
                ))}
            </ul>
            {menuState && activeRow && (
                <ContextMenu
                    left={menuState.x}
                    top={menuState.y}
                    chevronFace={ChevronFace.None}
                    onFinished={() => setMenuState(null)}
                >
                    <div
                        role="menu"
                        className="mx_RoomCallParticipants_contextMenu"
                        data-testid="participant-audio-menu"
                    >
                        <div className="mx_RoomCallParticipants_menuHeader">{activeRow.displayName}</div>
                        <button
                            type="button"
                            role="menuitem"
                            className="mx_RoomCallParticipants_menuItem"
                            onClick={() => {
                                defaultDispatcher.dispatch<ViewRoomPayload>({
                                    action: Action.ViewRoom,
                                    room_id: room.roomId,
                                    metricsTrigger: "RoomList",
                                });
                                defaultDispatcher.dispatch({
                                    action: Action.ViewUser,
                                    member: activeRow.member ?? undefined,
                                });
                                setMenuState(null);
                            }}
                        >
                            <span>{_t("voip|participant_profile")}</span>
                        </button>
                        <div className="mx_RoomCallParticipants_menuDivider" />
                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={isMuted}
                            className="mx_RoomCallParticipants_menuItem"
                            onClick={() => {
                                if (activeRow.local) {
                                    void call.setDeviceMute({ audio_enabled: deviceMute.audioMuted });
                                } else {
                                    void call.setParticipantAudio({
                                        user_id: activeRow.userId,
                                        muted: !activeRow.playbackMuted,
                                    });
                                }
                            }}
                        >
                            <span>{_t("voip|mute_participant")}</span>
                            <span
                                className={classNames("mx_RoomCallParticipants_checkbox", {
                                    mx_RoomCallParticipants_checkbox_checked: isMuted,
                                })}
                                aria-hidden="true"
                            >
                                {isMuted ? "✓" : ""}
                            </span>
                        </button>
                        {activeRow.local && (
                            <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={deviceMute.deafened}
                                className="mx_RoomCallParticipants_menuItem"
                                onClick={() => {
                                    void call.setDeviceMute({ deafened: !deviceMute.deafened });
                                }}
                            >
                                <span>{_t("voip|deafen")}</span>
                                <span
                                    className={classNames("mx_RoomCallParticipants_checkbox", {
                                        mx_RoomCallParticipants_checkbox_checked: deviceMute.deafened,
                                    })}
                                    aria-hidden="true"
                                >
                                    {deviceMute.deafened ? "✓" : ""}
                                </span>
                            </button>
                        )}
                        <div className="mx_RoomCallParticipants_menuDivider" />
                        <div className="mx_RoomCallParticipants_sliderGroup">
                            <div className="mx_RoomCallParticipants_sliderHeader">
                                <span>{_t("voip|audio_volume")}</span>
                                <span>{Math.round(peerAudio.volume * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                className="mx_RoomCallParticipants_slider"
                                min={0}
                                max={100}
                                step={1}
                                value={Math.round(peerAudio.volume * 100)}
                                aria-label={_t("voip|audio_volume")}
                                onChange={(e) =>
                                    updateAudioField(activeRow.userId, { volume: Number(e.target.value) / 100 })
                                }
                            />
                        </div>
                        <div className="mx_RoomCallParticipants_sliderGroup">
                            <div className="mx_RoomCallParticipants_sliderHeader">
                                <span>{_t("voip|audio_balance")}</span>
                                <span>{formatPanLabel(peerAudio.pan)}</span>
                            </div>
                            <input
                                type="range"
                                className="mx_RoomCallParticipants_slider"
                                min={-1}
                                max={1}
                                step={0.05}
                                value={peerAudio.pan}
                                aria-label={_t("voip|audio_balance")}
                                onChange={(e) => updateAudioField(activeRow.userId, { pan: Number(e.target.value) })}
                            />
                        </div>
                        <div className="mx_RoomCallParticipants_sliderGroup">
                            <div className="mx_RoomCallParticipants_sliderHeader">
                                <span>{_t("voip|audio_bass")}</span>
                                <span>{formatDbLabel(peerAudio.bass)}</span>
                            </div>
                            <input
                                type="range"
                                className="mx_RoomCallParticipants_slider"
                                min={-24}
                                max={24}
                                step={1}
                                value={peerAudio.bass}
                                aria-label={_t("voip|audio_bass")}
                                onChange={(e) => updateAudioField(activeRow.userId, { bass: Number(e.target.value) })}
                            />
                        </div>
                        <div className="mx_RoomCallParticipants_sliderGroup">
                            <div className="mx_RoomCallParticipants_sliderHeader">
                                <span>{_t("voip|audio_mid")}</span>
                                <span>{formatDbLabel(peerAudio.mid)}</span>
                            </div>
                            <input
                                type="range"
                                className="mx_RoomCallParticipants_slider"
                                min={-24}
                                max={24}
                                step={1}
                                value={peerAudio.mid}
                                aria-label={_t("voip|audio_mid")}
                                onChange={(e) => updateAudioField(activeRow.userId, { mid: Number(e.target.value) })}
                            />
                        </div>
                        <div className="mx_RoomCallParticipants_sliderGroup">
                            <div className="mx_RoomCallParticipants_sliderHeader">
                                <span>{_t("voip|audio_treble")}</span>
                                <span>{formatDbLabel(peerAudio.treble)}</span>
                            </div>
                            <input
                                type="range"
                                className="mx_RoomCallParticipants_slider"
                                min={-24}
                                max={24}
                                step={1}
                                value={peerAudio.treble}
                                aria-label={_t("voip|audio_treble")}
                                onChange={(e) => updateAudioField(activeRow.userId, { treble: Number(e.target.value) })}
                            />
                        </div>
                        <button
                            type="button"
                            role="menuitem"
                            className="mx_RoomCallParticipants_menuItem mx_RoomCallParticipants_resetButton"
                            onClick={() => onResetAudio(activeRow.userId)}
                        >
                            <span>{_t("voip|audio_reset")}</span>
                        </button>
                    </div>
                </ContextMenu>
            )}
        </>
    );
}
