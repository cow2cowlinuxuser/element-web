/*
Copyright 2026 zigmaster

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, useId } from "react";

import { _t } from "../../../../languageHandler";
import { useSettingValue } from "../../../../hooks/useSettings";
import SettingsStore from "../../../../settings/SettingsStore";
import { SettingLevel } from "../../../../settings/SettingLevel";

/**
 * A slider for the volume of notification sounds on this device, as a percentage of each sound file's own level.
 */
export function NotificationSoundVolume(): JSX.Element {
    const id = useId();
    const volume = useSettingValue("notificationSoundVolume");

    const onChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        void SettingsStore.setValue("notificationSoundVolume", null, SettingLevel.DEVICE, Number(e.target.value));
    };

    return (
        <div className="mx_NotificationSoundVolume">
            <label htmlFor={id}>{_t("settings|notifications|notification_sound_volume")}</label>
            <input id={id} type="range" min={0} max={100} step={5} value={volume} onChange={onChange} />
            <output htmlFor={id}>{volume}%</output>
        </div>
    );
}
