/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { playPsoSfx } from "./PsoSfx";

describe("playPsoSfx", () => {
    it("reports the clip as unavailable when WebAudio is missing, so callers fall back to a chime", async () => {
        await expect(playPsoSfx("cursor")).resolves.toBe(false);
    });
});
