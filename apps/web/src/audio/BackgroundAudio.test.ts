/*
Copyright 2026 hayaksi1

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import fetchMock from "@fetch-mock/vitest";

import { BackgroundAudio } from "./BackgroundAudio";
import { createAudioContext } from "./compat";

vi.mock("./compat", () => ({
    createAudioContext: vi.fn(),
}));

describe("BackgroundAudio", () => {
    let audioContext: {
        createBufferSource: Mock;
        createGain: Mock;
        decodeAudioData: Mock;
        resume: Mock;
        suspend: Mock;
        destination: object;
    };

    /** The sources handed out by the mocked context, in the order they were created. */
    let sources: Array<{ start: Mock; connect: Mock; disconnect: Mock; onended?: () => void }>;
    /** The gain nodes handed out by the mocked context, in the order they were created. */
    let gains: Array<{ gain: { value: number }; connect: Mock; disconnect: Mock }>;

    beforeEach(() => {
        sources = [];
        gains = [];
        audioContext = {
            createBufferSource: vi.fn().mockImplementation(() => {
                const source = { start: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
                sources.push(source);
                return source;
            }),
            createGain: vi.fn().mockImplementation(() => {
                const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
                gains.push(gain);
                return gain;
            }),
            decodeAudioData: vi.fn().mockResolvedValue({}),
            resume: vi.fn().mockResolvedValue(undefined),
            suspend: vi.fn().mockResolvedValue(undefined),
            destination: {},
        };
        vi.mocked(createAudioContext).mockReturnValue(audioContext as unknown as AudioContext);

        // Every sound is fetched before it is decoded, and the decoding is mocked out above, so the
        // bytes that come back never matter.
        fetchMock.mockReset();
        fetchMock.get("*", 200);
    });

    it("suspends the context once the sound has finished", async () => {
        const audio = new BackgroundAudio();

        await audio.play("sound.mp3");
        expect(audioContext.suspend).not.toHaveBeenCalled();

        sources[0].onended!();

        expect(audioContext.suspend).toHaveBeenCalled();
    });

    it("keeps playing a sound that outlasts one started before it", async () => {
        const audio = new BackgroundAudio();

        await audio.play("first.mp3");
        await audio.play("second.mp3");

        // The first sound finishes while the second is still going.
        sources[0].onended!();

        expect(audioContext.suspend).not.toHaveBeenCalled();

        sources[1].onended!();

        expect(audioContext.suspend).toHaveBeenCalledTimes(1);
    });

    it("throws instead of decoding when the sound cannot be fetched", async () => {
        fetchMock.mockReset();
        fetchMock.get("*", 404);
        const audio = new BackgroundAudio();

        await expect(audio.play("missing.mp3")).rejects.toThrow("HTTP 404");
        expect(audioContext.decodeAudioData).not.toHaveBeenCalled();
    });

    it("passes the request options to fetch", async () => {
        const audio = new BackgroundAudio();

        await audio.play("authed.mp3", false, { requestInit: { headers: { Authorization: "Bearer token" } } });

        expect(fetchMock.callHistory.lastCall()?.options.headers).toEqual({ authorization: "Bearer token" });
    });

    it("connects straight to the output when no volume is given", async () => {
        const audio = new BackgroundAudio();

        await audio.play("sound.mp3");

        expect(audioContext.createGain).not.toHaveBeenCalled();
        expect(sources[0].connect).toHaveBeenCalledWith(audioContext.destination);
    });

    it("plays through a gain node at the given volume and disconnects it afterwards", async () => {
        const audio = new BackgroundAudio();

        await audio.play("sound.mp3", false, { volume: 0.25 });

        expect(gains[0].gain.value).toBe(0.25);
        expect(sources[0].connect).toHaveBeenCalledWith(gains[0]);
        expect(gains[0].connect).toHaveBeenCalledWith(audioContext.destination);

        sources[0].onended!();
        expect(gains[0].disconnect).toHaveBeenCalled();
    });

    it("plays loaded data and only loads it once per key", async () => {
        const audio = new BackgroundAudio();
        const load = vi.fn().mockResolvedValue(new ArrayBuffer(4));

        await audio.playData("local:1", load);
        await audio.playData("local:1", load);

        expect(load).toHaveBeenCalledTimes(1);
        expect(fetchMock.callHistory.calls()).toHaveLength(0);
        expect(sources).toHaveLength(2);
    });

    it("clamps the volume to between 0 and 1", async () => {
        const audio = new BackgroundAudio();

        await audio.play("loud.mp3", false, { volume: 3 });
        await audio.play("quiet.mp3", false, { volume: -1 });

        expect(gains[0].gain.value).toBe(1);
        expect(gains[1].gain.value).toBe(0);
    });
});
