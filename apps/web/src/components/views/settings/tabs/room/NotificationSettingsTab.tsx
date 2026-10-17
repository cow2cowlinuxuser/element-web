/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, createRef } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { _t } from "../../../../../languageHandler";
import AccessibleButton, { type ButtonEvent } from "../../../elements/AccessibleButton";
import SettingsStore from "../../../../../settings/SettingsStore";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import { type RoomEchoChamber } from "../../../../../stores/local-echo/RoomEchoChamber";
import { EchoChamber } from "../../../../../stores/local-echo/EchoChamber";
import MatrixClientContext from "../../../../../contexts/MatrixClientContext";
import StyledRadioGroup from "../../../elements/StyledRadioGroup";
import { RoomNotifState } from "../../../../../RoomNotifs";
import defaultDispatcher from "../../../../../dispatcher/dispatcher";
import { Action } from "../../../../../dispatcher/actions";
import { UserTab } from "../../../dialogs/UserTab";
import { chromeFileInputFix } from "../../../../../utils/BrowserWorkarounds";
import SettingsTab from "../SettingsTab";
import { SettingsSection } from "../../shared/SettingsSection";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import { SDKContextClass } from "../../../../../contexts/SDKContextClass.ts";
import { extractErrorMessageFromError } from "../../../dialogs/ErrorDialog";
import StyledCheckbox from "../../../elements/StyledCheckbox";
import {
    deleteLocalSound,
    isLocalSoundUrl,
    newLocalSoundUrl,
    saveLocalSound,
} from "../../../../../audio/LocalNotificationSounds";

interface IProps {
    roomId: string;
    closeSettingsFn(): void;
}

interface IState {
    currentSound: string;
    uploadedFile: File | null;
    /** True while the chosen sound is being uploaded and saved. */
    saving: boolean;
    /** Why the last save or preview failed, shown under the buttons. */
    soundError: string | null;
    /** Save the chosen sound on this device only, instead of uploading it to the homeserver. */
    keepSoundLocal: boolean;
}

export default class NotificationsSettingsTab extends React.Component<IProps, IState> {
    private readonly roomProps: RoomEchoChamber;
    private soundUpload = createRef<HTMLInputElement>();

    public static contextType = MatrixClientContext;
    declare public context: React.ContextType<typeof MatrixClientContext>;

    public constructor(props: IProps, context: React.ContextType<typeof MatrixClientContext>) {
        super(props, context);

        this.roomProps = EchoChamber.forRoom(context.getRoom(this.props.roomId)!);

        let currentSound = "default";
        const soundData = SDKContextClass.instance.notifier.getSoundForRoom(this.props.roomId);
        if (soundData) {
            currentSound = soundData.name || soundData.url;
        }

        this.state = {
            currentSound,
            uploadedFile: null,
            saving: false,
            soundError: null,
            keepSoundLocal: true,
        };
    }

    private triggerUploader = async (e: ButtonEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();

        this.soundUpload.current?.click();
    };

    private onSoundUploadChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
        if (!e.target.files || !e.target.files.length) {
            this.setState({
                uploadedFile: null,
            });
            return;
        }

        const file = e.target.files[0];
        this.setState({
            uploadedFile: file,
            soundError: null,
        });
    };

    private onClickSaveSound = async (e: ButtonEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();

        this.setState({ saving: true, soundError: null });
        try {
            await this.saveSound();
        } catch (ex) {
            logger.error(`Unable to save notification sound for ${this.props.roomId}`);
            logger.error(ex);
            this.setState({
                soundError: _t("room_settings|notifications|save_sound_failed", {
                    error: extractErrorMessageFromError(ex, String(ex)),
                }),
            });
        } finally {
            this.setState({ saving: false });
        }
    };

    private onClickPreviewSound = async (e: ButtonEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();

        this.setState({ soundError: null });
        try {
            await SDKContextClass.instance.notifier.previewSoundForRoom(this.props.roomId);
        } catch (ex) {
            logger.error(`Unable to play notification sound for ${this.props.roomId}`, ex);
            this.setState({ soundError: _t("room_settings|notifications|preview_sound_failed") });
        }
    };

    private async saveSound(): Promise<void> {
        if (!this.state.uploadedFile) {
            return;
        }

        let type = this.state.uploadedFile.type;
        if (type === "video/ogg") {
            // XXX: I've observed browsers allowing users to pick a audio/ogg files,
            // and then calling it a video/ogg. This is a lame hack, but man browsers
            // suck at detecting mimetypes.
            type = "audio/ogg";
        }

        const previousLocalUrl = this.getLocalSoundUrl();
        if (this.state.keepSoundLocal) {
            const url = newLocalSoundUrl(this.props.roomId);
            await saveLocalSound(url, this.state.uploadedFile);
            await SettingsStore.setValue("notificationSound", this.props.roomId, SettingLevel.ROOM_DEVICE, {
                name: this.state.uploadedFile.name,
                type: type,
                size: this.state.uploadedFile.size,
                url,
            });
        } else {
            const { content_uri: url } = await this.context.uploadContent(this.state.uploadedFile, {
                type,
            });

            await SettingsStore.setValue("notificationSound", this.props.roomId, SettingLevel.ROOM_ACCOUNT, {
                name: this.state.uploadedFile.name,
                type: type,
                size: this.state.uploadedFile.size,
                url,
            });
            // A sound kept on this device would otherwise keep overriding the uploaded one.
            await SettingsStore.setValue("notificationSound", this.props.roomId, SettingLevel.ROOM_DEVICE, null);
        }
        if (previousLocalUrl) {
            await deleteLocalSound(previousLocalUrl);
        }

        this.setState({
            uploadedFile: null,
            currentSound: this.state.uploadedFile.name,
        });
        // Otherwise picking the same file again would not fire a change event.
        if (this.soundUpload.current) {
            this.soundUpload.current.value = "";
        }
    }

    /**
     * The local sound URL of the sound kept on this device for this room, if there is one.
     */
    private getLocalSoundUrl(): string | undefined {
        const local = SettingsStore.getValueAt(SettingLevel.ROOM_DEVICE, "notificationSound", this.props.roomId, true);
        return local && isLocalSoundUrl(local.url) ? local.url : undefined;
    }

    private onKeepSoundLocalChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ keepSoundLocal: e.target.checked });
    };

    private clearSound = (e: ButtonEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        const localUrl = this.getLocalSoundUrl();
        void SettingsStore.setValue("notificationSound", this.props.roomId, SettingLevel.ROOM_DEVICE, null);
        void SettingsStore.setValue("notificationSound", this.props.roomId, SettingLevel.ROOM_ACCOUNT, null);
        if (localUrl) {
            void deleteLocalSound(localUrl);
        }

        this.setState({
            currentSound: "default",
        });
    };

    private onRoomNotificationChange = (value: RoomNotifState): void => {
        this.roomProps.notificationVolume = value;
        this.forceUpdate();
    };

    private onOpenSettingsClick = (event: ButtonEvent): void => {
        // avoid selecting the radio button
        event.preventDefault();
        this.props.closeSettingsFn();
        defaultDispatcher.dispatch({
            action: Action.ViewUserSettings,
            initialTabId: UserTab.Notifications,
        });
    };

    public render(): React.ReactNode {
        let currentUploadedFile: JSX.Element | undefined;
        if (this.state.uploadedFile) {
            currentUploadedFile = (
                <div>
                    <span>
                        {_t("room_settings|notifications|uploaded_sound")}: <code>{this.state.uploadedFile.name}</code>
                    </span>
                </div>
            );
        }

        return (
            <SettingsTab>
                <SettingsSection heading={_t("notifications|enable_prompt_toast_title")}>
                    <div className="mx_NotificationSettingsTab_notificationsSection">
                        <StyledRadioGroup
                            name="roomNotificationSetting"
                            definitions={[
                                {
                                    value: RoomNotifState.AllMessages,
                                    label: (
                                        <>
                                            {_t("notifications|default")}
                                            <div className="mx_NotificationSettingsTab_microCopy">
                                                {_t(
                                                    "room_settings|notifications|settings_link",
                                                    {},
                                                    {
                                                        a: (sub) => (
                                                            <AccessibleButton
                                                                kind="link_inline"
                                                                onClick={this.onOpenSettingsClick}
                                                            >
                                                                {sub}
                                                            </AccessibleButton>
                                                        ),
                                                    },
                                                )}
                                            </div>
                                        </>
                                    ),
                                },
                                {
                                    value: RoomNotifState.AllMessagesLoud,
                                    label: (
                                        <>
                                            {_t("notifications|all_messages")}
                                            <div className="mx_NotificationSettingsTab_microCopy">
                                                {_t("notifications|all_messages_description")}
                                            </div>
                                        </>
                                    ),
                                },
                                {
                                    value: RoomNotifState.MentionsOnly,
                                    label: (
                                        <>
                                            {_t("notifications|mentions_and_keywords")}
                                            <div className="mx_NotificationSettingsTab_microCopy">
                                                {_t(
                                                    "notifications|mentions_and_keywords_description",
                                                    {},
                                                    {
                                                        a: (sub) => (
                                                            <AccessibleButton
                                                                kind="link_inline"
                                                                onClick={this.onOpenSettingsClick}
                                                            >
                                                                {sub}
                                                            </AccessibleButton>
                                                        ),
                                                    },
                                                )}
                                            </div>
                                        </>
                                    ),
                                },
                                {
                                    value: RoomNotifState.Mute,
                                    label: (
                                        <>
                                            {_t("common|mute")}
                                            <div className="mx_NotificationSettingsTab_microCopy">
                                                {_t("notifications|mute_description")}
                                            </div>
                                        </>
                                    ),
                                },
                            ]}
                            onChange={this.onRoomNotificationChange}
                            value={this.roomProps.notificationVolume}
                        />
                    </div>

                    <SettingsSubsection heading={_t("room_settings|notifications|sounds_section")}>
                        <div>
                            <div className="mx_SettingsTab_subsectionText">
                                <span>
                                    {_t("room_settings|notifications|notification_sound")}:{" "}
                                    <code>{this.state.currentSound}</code>
                                    {this.state.currentSound !== "default" && this.getLocalSoundUrl() && (
                                        <> {_t("room_settings|notifications|sound_on_this_device")}</>
                                    )}
                                </span>
                            </div>
                            <AccessibleButton
                                className="mx_NotificationSound_preview"
                                onClick={this.onClickPreviewSound}
                                kind="primary"
                            >
                                {_t("room_settings|notifications|preview_sound")}
                            </AccessibleButton>
                            <AccessibleButton
                                className="mx_NotificationSound_resetSound"
                                disabled={this.state.currentSound == "default"}
                                onClick={this.clearSound}
                                kind="primary"
                            >
                                {_t("action|reset")}
                            </AccessibleButton>
                        </div>
                        <div>
                            <h4 className="mx_Heading_h4">{_t("room_settings|notifications|custom_sound_prompt")}</h4>
                            <div className="mx_SettingsFlag">
                                <form autoComplete="off" noValidate={true}>
                                    <input
                                        ref={this.soundUpload}
                                        className="mx_NotificationSound_soundUpload"
                                        type="file"
                                        onClick={chromeFileInputFix}
                                        onChange={this.onSoundUploadChanged}
                                        accept="audio/*"
                                        aria-label={_t("room_settings|notifications|upload_sound_label")}
                                    />
                                </form>

                                {currentUploadedFile}
                            </div>

                            <StyledCheckbox
                                className="mx_NotificationSound_keepLocal"
                                checked={this.state.keepSoundLocal}
                                onChange={this.onKeepSoundLocalChange}
                                description={_t("room_settings|notifications|keep_sound_local_description")}
                            >
                                {_t("room_settings|notifications|keep_sound_local")}
                            </StyledCheckbox>

                            <AccessibleButton
                                className="mx_NotificationSound_browse"
                                onClick={this.triggerUploader}
                                kind="primary"
                            >
                                {_t("room_settings|notifications|browse_button")}
                            </AccessibleButton>

                            <AccessibleButton
                                className="mx_NotificationSound_save"
                                disabled={this.state.uploadedFile == null || this.state.saving}
                                onClick={this.onClickSaveSound}
                                kind="primary"
                            >
                                {this.state.saving ? _t("common|saving") : _t("action|save")}
                            </AccessibleButton>
                            {this.state.soundError && (
                                <div className="mx_NotificationSound_error" role="alert">
                                    {this.state.soundError}
                                </div>
                            )}
                            <br />
                        </div>
                    </SettingsSubsection>
                </SettingsSection>
            </SettingsTab>
        );
    }
}
