/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useSyncExternalStore } from "react";
import { TypedEventEmitter } from "matrix-js-sdk/src/matrix";

export enum MinimisedCallPipStoreEvent {
    Update = "update",
}

type EventHandlerMap = {
    [MinimisedCallPipStoreEvent.Update]: () => void;
};

export interface MinimisedCallPipState {
    /** Whether the user has collapsed the floating call window into a pill. */
    minimised: boolean;
    /** Where the pill should go: a spot in the visible room header, if there is one. */
    slot: HTMLElement | null;
}

/**
 * Remembers whether the floating call window is minimised, and where in the page the pill that
 * replaces it should be docked.
 */
export class MinimisedCallPipStore extends TypedEventEmitter<MinimisedCallPipStoreEvent, EventHandlerMap> {
    private static internalInstance: MinimisedCallPipStore | undefined;

    public static get instance(): MinimisedCallPipStore {
        MinimisedCallPipStore.internalInstance ??= new MinimisedCallPipStore();
        return MinimisedCallPipStore.internalInstance;
    }

    private state: MinimisedCallPipState = { minimised: false, slot: null };

    public getState(): MinimisedCallPipState {
        return this.state;
    }

    public setMinimised(minimised: boolean): void {
        if (minimised === this.state.minimised) return;
        this.state = { ...this.state, minimised };
        this.emit(MinimisedCallPipStoreEvent.Update);
    }

    /**
     * Registers (or with null, forgets) the element the pill should be rendered into. Only the most
     * recently registered slot is used, and forgetting a slot that has since been replaced is a no-op.
     */
    public setSlot(slot: HTMLElement | null, previous?: HTMLElement | null): void {
        if (slot === null && previous !== undefined && previous !== this.state.slot) return;
        if (slot === this.state.slot) return;
        this.state = { ...this.state, slot };
        this.emit(MinimisedCallPipStoreEvent.Update);
    }
}

export function useMinimisedCallPip(
    store: MinimisedCallPipStore = MinimisedCallPipStore.instance,
): MinimisedCallPipState {
    return useSyncExternalStore(
        (onChange) => {
            store.on(MinimisedCallPipStoreEvent.Update, onChange);
            return () => store.off(MinimisedCallPipStoreEvent.Update, onChange);
        },
        () => store.getState(),
    );
}
