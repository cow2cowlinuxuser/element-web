/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/** Clips extracted from the user's own `data/sound/*.pac` banks by `scripts/extract-psobb-assets.mjs`. */
export type PsoSfxId = "cursor" | "confirm" | "cancel" | "menu_open" | "menu_close" | "use_item" | "game_start";

const ALL_SFX: PsoSfxId[] = ["cursor", "confirm", "cancel", "menu_open", "menu_close", "use_item", "game_start"];

/** The banks are mastered near full scale; the game attenuates them through a volume table. */
const SFX_VOLUME = 0.35;

let audioCtx: AudioContext | null = null;
const buffers = new Map<PsoSfxId, Promise<AudioBuffer | null>>();
const playing = new Map<PsoSfxId, AudioBufferSourceNode>();

function getAudioContext(): AudioContext | null {
    if (audioCtx) return audioCtx;
    const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
        audioCtx = new AudioCtx();
    } catch {
        return null;
    }
    return audioCtx;
}

function loadBuffer(ctx: AudioContext, id: PsoSfxId): Promise<AudioBuffer | null> {
    let pending = buffers.get(id);
    if (!pending) {
        pending = fetch(`media/pso/se/${id}.wav`)
            .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => null);
        buffers.set(id, pending);
    }
    return pending;
}

export function preloadPsoSfx(): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const id of ALL_SFX) void loadBuffer(ctx, id);
}

/**
 * Plays a clip, cutting off the previous instance of the same clip like the game does.
 * Resolves false when the clip isn't available, so the caller can fall back to a synthesized chime.
 */
export async function playPsoSfx(id: PsoSfxId): Promise<boolean> {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const buffer = await loadBuffer(ctx, id);
    if (!buffer) return false;
    try {
        if (ctx.state === "suspended") void ctx.resume();
        playing.get(id)?.stop();
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = SFX_VOLUME;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = (): void => {
            if (playing.get(id) === source) playing.delete(id);
        };
        playing.set(id, source);
        source.start();
        return true;
    } catch {
        return false;
    }
}
