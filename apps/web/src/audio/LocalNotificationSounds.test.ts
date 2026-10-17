/*
Copyright 2026 zigmaster

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import "fake-indexeddb/auto";

import { describe, it, expect } from "vitest";

import {
    deleteLocalSound,
    isLocalSoundUrl,
    loadLocalSound,
    newLocalSoundUrl,
    saveLocalSound,
} from "./LocalNotificationSounds";

describe("LocalNotificationSounds", () => {
    it("mints distinct local sound URLs that are recognised as local", () => {
        const first = newLocalSoundUrl("!room:server");
        const second = `${first}-other`;

        expect(isLocalSoundUrl(first)).toBe(true);
        expect(first).not.toEqual(second);
        expect(isLocalSoundUrl("mxc://server/sound")).toBe(false);
    });

    it("saves, loads and deletes a sound", async () => {
        const url = newLocalSoundUrl("!room:server");

        await saveLocalSound(url, new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));
        const loaded = await loadLocalSound(url);
        expect(new Uint8Array(loaded!)).toEqual(new Uint8Array([1, 2, 3]));

        await deleteLocalSound(url);
        await expect(loadLocalSound(url)).resolves.toBeUndefined();
    });

    it("returns undefined for a sound that was never saved", async () => {
        await expect(loadLocalSound("element-local-sound:!nothing:here")).resolves.toBeUndefined();
    });
});
