/*
Copyright 2026 zigmaster

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "test-utils-rtl";

import { NotificationSoundVolume } from "./NotificationSoundVolume";
import SettingsStore from "../../../../settings/SettingsStore";
import { SettingLevel } from "../../../../settings/SettingLevel";

describe("NotificationSoundVolume", () => {
    afterEach(() => {
        SettingsStore.reset();
    });

    it("shows the current volume", async () => {
        await SettingsStore.setValue("notificationSoundVolume", null, SettingLevel.DEVICE, 35);
        render(<NotificationSoundVolume />);

        expect(screen.getByLabelText("Notification sound volume")).toHaveValue("35");
        expect(screen.getByText("35%", { normalizer: (s) => s.replace(/\s/g, "") })).toBeInTheDocument();
    });

    it("saves the volume for this device when moved", () => {
        render(<NotificationSoundVolume />);

        fireEvent.change(screen.getByLabelText("Notification sound volume"), { target: { value: "20" } });

        expect(SettingsStore.getValueAt(SettingLevel.DEVICE, "notificationSoundVolume")).toBe(20);
    });
});
