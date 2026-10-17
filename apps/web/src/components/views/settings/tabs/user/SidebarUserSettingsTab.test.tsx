/*
Copyright 2024 New Vector Ltd.
Copyright 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "test-utils-rtl";
import { flushPromises } from "test-utils";

import SidebarUserSettingsTab from "./SidebarUserSettingsTab";
import PosthogTrackers from "../../../../../PosthogTrackers";
import SettingsStore from "../../../../../settings/SettingsStore";
import { MetaSpace } from "../../../../../stores/spaces";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import SdkConfig from "../../../../../SdkConfig";

describe("<SidebarUserSettingsTab />", () => {
    beforeEach(() => {
        vi.spyOn(PosthogTrackers, "trackInteraction").mockClear();
        vi.spyOn(SettingsStore, "getValue").mockRestore();
        vi.spyOn(SettingsStore, "setValue").mockResolvedValue(undefined);
    });

    it("renders sidebar settings with guest spa url", () => {
        const spy = vi.spyOn(SdkConfig, "get").mockReturnValue({ guest_spa_url: "https://somewhere.org" });
        const originalGetValue = SettingsStore.getValue;
        const spySettingsStore = vi.spyOn(SettingsStore, "getValue").mockImplementation((setting) => {
            return setting === "feature_video_rooms" ? true : originalGetValue(setting);
        });
        const { container } = render(<SidebarUserSettingsTab />);
        expect(container).toMatchSnapshot();
        spySettingsStore.mockRestore();
        spy.mockRestore();
    });
    it("renders sidebar settings without guest spa url", () => {
        const originalGetValue = SettingsStore.getValue;
        const spySettingsStore = vi.spyOn(SettingsStore, "getValue").mockImplementation((setting) => {
            return setting === "feature_video_rooms" ? true : originalGetValue(setting);
        });
        const { container } = render(<SidebarUserSettingsTab />);
        expect(container).toMatchSnapshot();
        spySettingsStore.mockRestore();
    });

    it("always shows direct messages and other rooms as enabled, even if the setting disables them", () => {
        vi.spyOn(SettingsStore, "getValue").mockImplementation((settingName) => {
            if (settingName === "Spaces.enabledMetaSpaces") {
                return {
                    [MetaSpace.Home]: false,
                    [MetaSpace.Orphans]: false,
                };
            }
            return false;
        });
        render(<SidebarUserSettingsTab />);

        for (const name of [/Direct Messages/, /Rooms outside of a space/]) {
            const checkbox = screen.getByRole("checkbox", { name });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        }
        expect(screen.queryByText("Show all rooms")).toBeNull();
    });

    it("toggles video rooms", async () => {
        vi.spyOn(SettingsStore, "getValue").mockImplementation((settingName) => {
            if (settingName === "Spaces.enabledMetaSpaces") return {};
            return settingName === "feature_video_rooms";
        });
        render(<SidebarUserSettingsTab />);

        fireEvent.click(screen.getByRole("checkbox", { name: /Video rooms and conferences/ }));

        await flushPromises();
        expect(SettingsStore.setValue).toHaveBeenCalledWith("Spaces.enabledMetaSpaces", null, SettingLevel.ACCOUNT, {
            [MetaSpace.VideoRooms]: true,
        });
        expect(PosthogTrackers.trackInteraction).toHaveBeenCalledWith(
            "WebSettingsSidebarTabSpacesCheckbox",
            expect.objectContaining({ type: "change" }),
            3,
        );
    });
});
