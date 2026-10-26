/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { parseOggLoopStartSeconds } from "./PsoBgm";

function u32(n: number): number[] {
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

function str(s: string): number[] {
    return [...new TextEncoder().encode(s)];
}

/** Just the two Vorbis headers the parser reads, with some Ogg page noise in front of each. */
function fakeOgg(sampleRate: number, comments: string[]): ArrayBuffer {
    const vorbis = str("vorbis");
    const ident = [0x01, ...vorbis, ...u32(0), 2, ...u32(sampleRate), ...u32(0), ...u32(0), ...u32(0), 0xb8, 1];
    const comment = [
        0x03,
        ...vorbis,
        ...u32(9),
        ...str("Xiph.Org "),
        ...u32(comments.length),
        ...comments.flatMap((c) => [...u32(str(c).length), ...str(c)]),
        1,
    ];
    return new Uint8Array([...str("OggS"), 0, 2, ...ident, ...str("OggS"), 0, 0, ...comment]).buffer;
}

describe("parseOggLoopStartSeconds", () => {
    it("converts the game's loop_start sample offset to seconds", () => {
        expect(parseOggLoopStartSeconds(fakeOgg(44100, ["loop_start=548851"]))).toBeCloseTo(548851 / 44100);
    });

    it("finds the tag among other comments regardless of case", () => {
        expect(parseOggLoopStartSeconds(fakeOgg(22050, ["TITLE=Lobby", "LOOP_START=22050"]))).toBe(1);
    });

    it("returns null for tracks that loop from the start", () => {
        expect(parseOggLoopStartSeconds(fakeOgg(44100, ["TITLE=Forest"]))).toBeNull();
        expect(parseOggLoopStartSeconds(new ArrayBuffer(16))).toBeNull();
    });
});
