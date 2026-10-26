/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

const VORBIS = [0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];
/** The identification and comment headers sit in the first two Ogg pages. */
const HEADER_SCAN_BYTES = 64 * 1024;

let audioCtx: AudioContext | null = null;

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

function findVorbisHeader(bytes: Uint8Array, type: number, from = 0): number {
    const end = Math.min(bytes.length, HEADER_SCAN_BYTES) - VORBIS.length - 1;
    outer: for (let i = from; i <= end; i++) {
        if (bytes[i] !== type) continue;
        for (let j = 0; j < VORBIS.length; j++) {
            if (bytes[i + 1 + j] !== VORBIS[j]) continue outer;
        }
        return i + 1 + VORBIS.length;
    }
    return -1;
}

/**
 * Reads the game's `loop_start` Vorbis comment (a sample offset) and converts it to seconds.
 * Returns null for tracks without one, which loop from the very start.
 */
export function parseOggLoopStartSeconds(data: ArrayBuffer): number | null {
    const bytes = new Uint8Array(data);
    const view = new DataView(data);

    const ident = findVorbisHeader(bytes, 0x01);
    if (ident < 0 || ident + 9 > bytes.length) return null;
    const sampleRate = view.getUint32(ident + 5, true);
    if (!sampleRate) return null;

    let pos = findVorbisHeader(bytes, 0x03, ident);
    if (pos < 0 || pos + 4 > bytes.length) return null;
    pos += 4 + view.getUint32(pos, true);
    if (pos + 4 > bytes.length) return null;
    const count = view.getUint32(pos, true);
    pos += 4;

    const decoder = new TextDecoder();
    for (let i = 0; i < count && pos + 4 <= bytes.length; i++) {
        const len = view.getUint32(pos, true);
        pos += 4;
        if (pos + len > bytes.length) return null;
        const comment = decoder.decode(bytes.subarray(pos, pos + len));
        pos += len;
        const match = /^loop_start=(\d+)$/i.exec(comment);
        if (match) return Number(match[1]) / sampleRate;
    }
    return null;
}

/**
 * Plays a BGM track forever, jumping back to its `loop_start` point at the end like the game does
 * instead of replaying the intro. Returns a stop function that is safe to call while still loading.
 */
export function playPsoBgm(url: string, volume: number): () => void {
    let stopped = false;
    let stopPlayback = (): void => {};

    const playWithMediaElement = (): void => {
        if (stopped) return;
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = volume;
        void audio.play().catch(() => {});
        stopPlayback = (): void => {
            audio.pause();
            audio.src = "";
        };
    };

    const ctx = getAudioContext();
    if (!ctx) {
        playWithMediaElement();
    } else {
        void (async (): Promise<void> => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(String(res.status));
                const data = await res.arrayBuffer();
                const loopStart = parseOggLoopStartSeconds(data);
                const buffer = await ctx.decodeAudioData(data);
                if (stopped) return;
                if (ctx.state === "suspended") void ctx.resume();
                const source = ctx.createBufferSource();
                const gain = ctx.createGain();
                source.buffer = buffer;
                source.loop = true;
                if (loopStart !== null && loopStart < buffer.duration) {
                    source.loopStart = loopStart;
                    source.loopEnd = buffer.duration;
                }
                gain.gain.value = volume;
                source.connect(gain);
                gain.connect(ctx.destination);
                source.start();
                stopPlayback = (): void => {
                    source.stop();
                    source.disconnect();
                    gain.disconnect();
                };
            } catch {
                playWithMediaElement();
            }
        })();
    }

    return (): void => {
        stopped = true;
        stopPlayback();
    };
}
