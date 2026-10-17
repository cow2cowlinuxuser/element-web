/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, type RenderResult, screen, within } from "test-utils-rtl";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import userEvent from "@testing-library/user-event";
import { mkStubRoom, stubClient } from "test-utils";

import NotificationSettingsTab from "./NotificationSettingsTab";
import { MatrixClientPeg } from "../../../../../MatrixClientPeg";
import { EchoChamber } from "../../../../../stores/local-echo/EchoChamber";
import { type RoomEchoChamber } from "../../../../../stores/local-echo/RoomEchoChamber";
import SettingsStore from "../../../../../settings/SettingsStore";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import { SDKContextClass } from "../../../../../contexts/SDKContextClass.ts";
import { deleteLocalSound, saveLocalSound } from "../../../../../audio/LocalNotificationSounds";

vi.mock("../../../../../audio/LocalNotificationSounds", async (importActual) => ({
    ...(await importActual<typeof import("../../../../../audio/LocalNotificationSounds")>()),
    saveLocalSound: vi.fn().mockResolvedValue(undefined),
    deleteLocalSound: vi.fn().mockResolvedValue(undefined),
}));

describe("NotificationSettingsTab", () => {
    const roomId = "!room:example.com";
    let cli: MatrixClient;
    let roomProps: RoomEchoChamber;

    const renderTab = (): RenderResult => {
        return render(<NotificationSettingsTab roomId={roomId} closeSettingsFn={() => {}} />);
    };

    beforeEach(() => {
        stubClient();
        cli = MatrixClientPeg.safeGet();
        const room = mkStubRoom(roomId, "test room", cli);
        roomProps = EchoChamber.forRoom(room);

        NotificationSettingsTab.contextType = React.createContext<MatrixClient>(cli);
    });

    afterEach(() => {
        SettingsStore.reset();
    });

    it("should prevent »Settings« link click from bubbling up to radio buttons", async () => {
        const tab = renderTab();

        // settings link of mentions_only volume
        const settingsLink = within(tab.getByText("@mentions and replies only")).getByRole("button", {
            name: "settings",
        });
        if (!settingsLink) throw new Error("settings link does not exist.");

        await userEvent.click(settingsLink);

        expect(roomProps.notificationVolume).not.toBe("mentions_only");
    });

    it("should show the currently chosen custom notification sound", async () => {
        void SettingsStore.setValue("notificationSound", roomId, SettingLevel.ACCOUNT, {
            url: "mxc://server/custom-sound-123",
            name: "custom-sound-123",
        });
        renderTab();

        await expect(screen.findByText("custom-sound-123")).resolves.toBeVisible();
    });

    it("should show the currently chosen custom notification sound url if no name", async () => {
        void SettingsStore.setValue("notificationSound", roomId, SettingLevel.ACCOUNT, {
            url: "mxc://server/custom-sound-123",
        });
        renderTab();

        await expect(screen.findByText("http://this.is.a.url/server/custom-sound-123")).resolves.toBeVisible();
    });

    describe("custom sound upload", () => {
        const soundFile = new File(["sound"], "chime.mp3", { type: "audio/mpeg" });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("keeps the chosen sound on this device by default, without uploading it", async () => {
            const setValueSpy = vi.spyOn(SettingsStore, "setValue").mockResolvedValue();
            renderTab();

            await userEvent.upload(screen.getByLabelText("Upload custom sound"), soundFile);
            await userEvent.click(screen.getByRole("button", { name: "Save" }));

            expect(cli.uploadContent).not.toHaveBeenCalled();
            const localUrl = vi.mocked(saveLocalSound).mock.calls[0][0];
            expect(localUrl).toMatch(/^element-local-sound:!room:example\.com:/);
            expect(vi.mocked(saveLocalSound).mock.calls[0][1]).toBe(soundFile);
            expect(setValueSpy).toHaveBeenCalledWith("notificationSound", roomId, SettingLevel.ROOM_DEVICE, {
                name: "chime.mp3",
                type: "audio/mpeg",
                size: soundFile.size,
                url: localUrl,
            });
            await expect(screen.findByText("chime.mp3")).resolves.toBeVisible();
        });

        it("deletes the previous local file when replacing or resetting a local sound", async () => {
            const oldUrl = "element-local-sound:!room:example.com:1";
            await SettingsStore.setValue("notificationSound", roomId, SettingLevel.ROOM_DEVICE, {
                url: oldUrl,
                name: "old.mp3",
            });
            renderTab();
            expect(screen.getByText("(this device only)", { exact: false })).toBeVisible();

            await userEvent.click(screen.getByRole("button", { name: "Reset" }));

            expect(deleteLocalSound).toHaveBeenCalledWith(oldUrl);
            expect(SettingsStore.getValueAt(SettingLevel.ROOM_DEVICE, "notificationSound", roomId, true)).toBeFalsy();
        });

        it("uploads and saves the chosen sound when not kept on this device", async () => {
            vi.mocked(cli.uploadContent).mockResolvedValue({ content_uri: "mxc://server/chime" });
            const setValueSpy = vi.spyOn(SettingsStore, "setValue").mockResolvedValue();
            renderTab();

            await userEvent.click(screen.getByRole("checkbox", { name: "Keep this sound on this device only" }));
            await userEvent.upload(screen.getByLabelText("Upload custom sound"), soundFile);
            await userEvent.click(screen.getByRole("button", { name: "Save" }));

            expect(setValueSpy).toHaveBeenCalledWith("notificationSound", roomId, SettingLevel.ROOM_DEVICE, null);

            expect(setValueSpy).toHaveBeenCalledWith("notificationSound", roomId, SettingLevel.ROOM_ACCOUNT, {
                name: "chime.mp3",
                type: "audio/mpeg",
                size: soundFile.size,
                url: "mxc://server/chime",
            });
            await expect(screen.findByText("chime.mp3")).resolves.toBeVisible();
            expect(screen.queryByText(/Uploaded sound/)).toBeNull();
        });

        it("shows why saving failed instead of failing silently", async () => {
            vi.mocked(cli.uploadContent).mockRejectedValue(new Error("File too large"));
            renderTab();

            await userEvent.click(screen.getByRole("checkbox", { name: "Keep this sound on this device only" }));
            await userEvent.upload(screen.getByLabelText("Upload custom sound"), soundFile);
            await userEvent.click(screen.getByRole("button", { name: "Save" }));

            await expect(screen.findByText("Could not save this sound: File too large")).resolves.toBeVisible();
            expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-disabled", "true");
        });

        it("plays the current sound when Play is clicked", async () => {
            const previewSpy = vi
                .spyOn(SDKContextClass.instance.notifier, "previewSoundForRoom")
                .mockResolvedValue(undefined);
            renderTab();

            await userEvent.click(screen.getByRole("button", { name: "Play" }));

            expect(previewSpy).toHaveBeenCalledWith(roomId);
        });

        it("says so when the current sound cannot be played", async () => {
            vi.spyOn(SDKContextClass.instance.notifier, "previewSoundForRoom").mockRejectedValue(new Error("HTTP 404"));
            renderTab();

            await userEvent.click(screen.getByRole("button", { name: "Play" }));

            await expect(
                screen.findByText("Could not play this sound. Check the console for details."),
            ).resolves.toBeVisible();
        });
    });
});
