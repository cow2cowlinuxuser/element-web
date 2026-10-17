/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { MinimisedCallPipStore, MinimisedCallPipStoreEvent } from "./MinimisedCallPipStore";

describe("MinimisedCallPipStore", () => {
    it("tracks whether the call window is minimised, only announcing changes", () => {
        const store = new MinimisedCallPipStore();
        const onUpdate = vi.fn();
        store.on(MinimisedCallPipStoreEvent.Update, onUpdate);

        expect(store.getState().minimised).toBe(false);
        store.setMinimised(true);
        expect(store.getState().minimised).toBe(true);
        store.setMinimised(true);
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it("uses the most recently registered slot", () => {
        const store = new MinimisedCallPipStore();
        const first = document.createElement("div");
        const second = document.createElement("div");

        store.setSlot(first);
        store.setSlot(second);
        expect(store.getState().slot).toBe(second);

        // The first slot going away doesn't take the second with it
        store.setSlot(null, first);
        expect(store.getState().slot).toBe(second);

        store.setSlot(null, second);
        expect(store.getState().slot).toBeNull();
    });
});
