/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useContext, useState } from "react";
import classNames from "classnames";
import {
    EndCallIcon,
    HeadphonesOffSolidIcon,
    HeadphonesSolidIcon,
    MicOffSolidIcon,
    MicOnSolidIcon,
    PopOutIcon,
    SettingsSolidIcon,
    ShareScreenSolidIcon,
    VideoCallOffSolidIcon,
    VideoCallSolidIcon,
    VoiceCallSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import BaseAvatar from "../avatars/BaseAvatar";

import { SDKContext } from "../../../contexts/SDKContext.ts";
import { CallStore, CallStoreEvent } from "../../../stores/CallStore";
import { type Call, CallEvent } from "../../../models/Call";
import { useEventEmitterState, useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import { useLiveParticipants } from "../../../hooks/useCall";
import { OwnProfileStore } from "../../../stores/OwnProfileStore";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { _t } from "../../../languageHandler";

const DEAFEN_STORAGE_KEY = "matrix-setting-mute-all-audio";

function readInitialDeafened(): boolean {
    try {
        return JSON.parse(localStorage.getItem(DEAFEN_STORAGE_KEY) ?? "false") === true;
    } catch {
        return false;
    }
}

interface Props {
    isMinimized?: boolean;
}

/**
 * Discord-style bottom-left dock displaying the active voice call connection + quick actions
 * above the user's profile, microphone mute, deafen, and settings controls.
 */
export function UserVoiceDock({ isMinimized = false }: Props): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const client = sdkContext.client;

    const activeCall = useEventEmitterState(
        CallStore.instance,
        CallStoreEvent.ConnectedCalls,
        useCallback((): Call | null => {
            const calls = [...CallStore.instance.connectedCalls];
            return calls[0] ?? null;
        }, []),
    );

    const liveParticipants = useLiveParticipants(activeCall);
    const localParticipant = liveParticipants.find((p) => p.local);

    const callMuteState = useTypedEventEmitterState(
        activeCall ?? undefined,
        CallEvent.DeviceMute,
        useCallback(
            () => ({
                audioMuted: activeCall?.audioMuted ?? false,
                videoMuted: activeCall?.videoMuted ?? true,
                deafened: activeCall?.deafened ?? readInitialDeafened(),
            }),
            [activeCall],
        ),
    );

    const [idleAudioMuted, setIdleAudioMuted] = useState(false);
    const [idleDeafened, setIdleDeafened] = useState<boolean>(() => readInitialDeafened());

    const profile = useEventEmitterState(
        OwnProfileStore.instance,
        UPDATE_EVENT,
        useCallback(() => {
            const userId = client?.getUserId() ?? "";
            const displayName = OwnProfileStore.instance.displayName || userId || "User";
            const avatarUrl = OwnProfileStore.instance.getHttpAvatarUrl(32) ?? undefined;
            return { userId, displayName, avatarUrl };
        }, [client]),
    );

    const isAudioMuted = activeCall
        ? localParticipant
            ? !localParticipant.audioEnabled
            : callMuteState.audioMuted
        : idleAudioMuted;
    const isVideoMuted = activeCall
        ? localParticipant
            ? !localParticipant.videoEnabled
            : callMuteState.videoMuted
        : true;
    const isDeafened = activeCall ? callMuteState.deafened : idleDeafened;
    const isLocalSpeaking = Boolean(localParticipant?.speaking);
    const isLocalSharing = Boolean(localParticipant?.screenSharing);

    const callRoom = activeCall ? (client?.getRoom(activeCall.roomId) ?? null) : null;
    const activeSpaceRoom = sdkContext.spaceStore.activeSpaceRoom;
    const roomName = callRoom?.name ?? activeCall?.roomId ?? "";
    const roomSubtitle =
        activeSpaceRoom && callRoom && activeSpaceRoom.roomId !== callRoom.roomId
            ? `${roomName} / ${activeSpaceRoom.name}`
            : roomName;

    const onOpenCallView = (): void => {
        if (!activeCall) return;
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: activeCall.roomId,
            view_call: true,
            metricsTrigger: "RoomList",
        });
    };

    const onToggleMute = (): void => {
        if (activeCall) {
            void activeCall.setDeviceMute({ audio_enabled: isAudioMuted });
        } else {
            setIdleAudioMuted((prev) => !prev);
        }
    };

    const onToggleDeafen = (): void => {
        const nextDeafened = !isDeafened;
        setIdleDeafened(nextDeafened);
        try {
            localStorage.setItem(DEAFEN_STORAGE_KEY, JSON.stringify(nextDeafened));
        } catch {
            // Ignore storage errors
        }
        if (activeCall) {
            void activeCall.setDeviceMute({ deafened: nextDeafened });
        }
    };

    return (
        <section
            className={classNames("mx_UserVoiceDock", {
                mx_UserVoiceDock_minimized: isMinimized,
            })}
            data-testid="user-voice-dock"
        >
            {activeCall && (
                <div className="mx_UserVoiceDock_connected" data-testid="user-voice-dock-connected">
                    <div className="mx_UserVoiceDock_connectedHeader">
                        <button
                            type="button"
                            className="mx_UserVoiceDock_connectedInfo"
                            onClick={onOpenCallView}
                            title={roomSubtitle}
                        >
                            <VoiceCallSolidIcon
                                className="mx_UserVoiceDock_signalIcon"
                                width="18px"
                                height="18px"
                                aria-hidden="true"
                            />
                            <span className="mx_UserVoiceDock_connectedText">
                                <span className="mx_UserVoiceDock_statusTitle">{_t("voip|voice_connected")}</span>
                                <span className="mx_UserVoiceDock_roomSubtitle">{roomSubtitle}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="mx_UserVoiceDock_iconButton mx_UserVoiceDock_disconnectButton"
                            onClick={() => void activeCall.disconnect()}
                            aria-label={_t("voip|disconnect")}
                            title={_t("voip|disconnect")}
                        >
                            <EndCallIcon width="18px" height="18px" />
                        </button>
                    </div>
                    <div className="mx_UserVoiceDock_actionRow">
                        <button
                            type="button"
                            className={classNames("mx_UserVoiceDock_actionButton", {
                                mx_UserVoiceDock_actionButton_active: !isVideoMuted,
                            })}
                            onClick={() => void activeCall.setDeviceMute({ video_enabled: isVideoMuted })}
                            aria-label={isVideoMuted ? _t("voip|enable_camera") : _t("voip|disable_camera")}
                            aria-pressed={!isVideoMuted}
                            title={isVideoMuted ? _t("voip|enable_camera") : _t("voip|disable_camera")}
                        >
                            {isVideoMuted ? (
                                <VideoCallOffSolidIcon width="18px" height="18px" />
                            ) : (
                                <VideoCallSolidIcon width="18px" height="18px" />
                            )}
                        </button>
                        <button
                            type="button"
                            className={classNames("mx_UserVoiceDock_actionButton", {
                                mx_UserVoiceDock_actionButton_active: isLocalSharing,
                            })}
                            onClick={() => void activeCall.toggleScreenSharing()}
                            aria-label={isLocalSharing ? _t("voip|stop_screenshare") : _t("voip|start_screenshare")}
                            aria-pressed={isLocalSharing}
                            title={isLocalSharing ? _t("voip|stop_screenshare") : _t("voip|start_screenshare")}
                        >
                            <ShareScreenSolidIcon width="18px" height="18px" />
                        </button>
                        <button
                            type="button"
                            className="mx_UserVoiceDock_actionButton"
                            onClick={onOpenCallView}
                            aria-label={_t("voip|open_call_view")}
                            title={_t("voip|open_call_view")}
                        >
                            <PopOutIcon width="18px" height="18px" />
                        </button>
                    </div>
                </div>
            )}
            <div className="mx_UserVoiceDock_profileBar" data-testid="user-voice-dock-profile">
                <button
                    type="button"
                    className="mx_UserVoiceDock_profileButton"
                    onClick={() => defaultDispatcher.dispatch({ action: Action.ToggleUserMenu })}
                    aria-label={profile.displayName}
                >
                    <span
                        className={classNames("mx_UserVoiceDock_avatarWrapper", {
                            mx_UserVoiceDock_speaking: isLocalSpeaking,
                        })}
                    >
                        <BaseAvatar url={profile.avatarUrl} name={profile.displayName} size="32px" />
                        <span
                            className={classNames("mx_UserVoiceDock_statusDot", {
                                mx_UserVoiceDock_statusDot_inVoice: Boolean(activeCall),
                            })}
                        />
                    </span>
                    <span className="mx_UserVoiceDock_userMeta">
                        <span className="mx_UserVoiceDock_displayName">{profile.displayName}</span>
                        <span
                            className={classNames("mx_UserVoiceDock_subtext", {
                                mx_UserVoiceDock_subtext_inVoice: Boolean(activeCall),
                            })}
                        >
                            {activeCall ? _t("voip|in_voice") : profile.userId}
                        </span>
                    </span>
                </button>
                <div className="mx_UserVoiceDock_controls">
                    <button
                        type="button"
                        className={classNames("mx_UserVoiceDock_iconButton", {
                            mx_UserVoiceDock_iconButton_danger: isAudioMuted,
                        })}
                        onClick={onToggleMute}
                        aria-label={isAudioMuted ? _t("voip|enable_microphone") : _t("voip|disable_microphone")}
                        aria-pressed={isAudioMuted}
                        title={isAudioMuted ? _t("voip|enable_microphone") : _t("voip|disable_microphone")}
                    >
                        {isAudioMuted ? (
                            <MicOffSolidIcon width="18px" height="18px" />
                        ) : (
                            <MicOnSolidIcon width="18px" height="18px" />
                        )}
                    </button>
                    <button
                        type="button"
                        className={classNames("mx_UserVoiceDock_iconButton", {
                            mx_UserVoiceDock_iconButton_danger: isDeafened,
                        })}
                        onClick={onToggleDeafen}
                        aria-label={isDeafened ? _t("voip|undeafen") : _t("voip|deafen")}
                        aria-pressed={isDeafened}
                        title={isDeafened ? _t("voip|undeafen") : _t("voip|deafen")}
                    >
                        {isDeafened ? (
                            <HeadphonesOffSolidIcon width="18px" height="18px" />
                        ) : (
                            <HeadphonesSolidIcon width="18px" height="18px" />
                        )}
                    </button>
                    <button
                        type="button"
                        className="mx_UserVoiceDock_iconButton"
                        onClick={() => defaultDispatcher.dispatch({ action: Action.ViewUserSettings })}
                        aria-label={_t("common|settings")}
                        title={_t("common|settings")}
                    >
                        <SettingsSolidIcon width="18px" height="18px" />
                    </button>
                </div>
            </div>
        </section>
    );
}
