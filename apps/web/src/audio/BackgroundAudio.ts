/*
Copyright 2024 New Vector Ltd.
Copyright 2024 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { createAudioContext } from "./compat";

const formatMap = {
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
};

/**
 * Extra options for {@link BackgroundAudio.play}.
 */
export interface PlayOptions {
    /** Playback volume from 0 (silent) to 1 (the file's own level). Defaults to 1. */
    volume?: number;
    /** Passed to `fetch` when the sound is not cached yet, e.g. to attach an access token. */
    requestInit?: RequestInit;
}

export class BackgroundAudio {
    private audioContext = createAudioContext();
    private sounds: Record<string, AudioBuffer> = {};
    /** How many sounds started here are still going. */
    private playing = 0;

    public async pickFormatAndPlay<F extends Array<keyof typeof formatMap>>(
        urlPrefix: string,
        formats: F,
        loop = false,
        options: PlayOptions = {},
    ): Promise<AudioBufferSourceNode> {
        const format = this.pickFormat(...formats);
        if (!format) {
            console.log("Browser doesn't support any of the formats", formats);
            // Will probably never happen. If happened, format="" and will fail to load audio. Who cares...
        }

        return this.play(`${urlPrefix}.${format}`, loop, options);
    }

    /**
     * Fetches (or reuses a cached copy of) the sound at `url` and starts playing it.
     * @throws if the sound cannot be fetched or decoded.
     */
    public async play(url: string, loop = false, options: PlayOptions = {}): Promise<AudioBufferSourceNode> {
        return this.playData(
            url,
            async () => {
                const response = await fetch(url, options.requestInit);
                if (!response.ok) {
                    // Decoding the error body as audio would only fail with a less useful message.
                    throw new Error(`Failed to fetch audio (HTTP ${response.status})`);
                }
                return response.arrayBuffer();
            },
            loop,
            options,
        );
    }

    /**
     * Plays a sound whose bytes come from somewhere other than a URL, e.g. local storage.
     * @param key - identifies the sound in the decoded-sound cache; `load` is only called on a cache miss.
     * @param load - returns the encoded sound file.
     * @throws if the sound cannot be loaded or decoded.
     */
    public async playData(
        key: string,
        load: () => Promise<ArrayBuffer>,
        loop = false,
        options: PlayOptions = {},
    ): Promise<AudioBufferSourceNode> {
        if (!this.sounds.hasOwnProperty(key)) {
            const sound = await this.audioContext.decodeAudioData(await load());
            this.sounds[key] = sound;
        }
        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds[key];
        source.loop = loop;

        let gain: GainNode | undefined;
        if (options.volume !== undefined) {
            gain = this.audioContext.createGain();
            gain.gain.value = Math.min(Math.max(options.volume, 0), 1);
            source.connect(gain);
            gain.connect(this.audioContext.destination);
        } else {
            source.connect(this.audioContext.destination);
        }

        await this.audioContext.resume();
        this.playing++;
        source.onended = () => {
            source.disconnect();
            gain?.disconnect();
            this.playing--;
            // Every sound played here shares the one context, which is suspended rather than closed so
            // that it can be reused. Suspending it while another sound is still going would cut that
            // one off mid-way and leave it to pick up again the next time anything is played.
            if (this.playing === 0) {
                void this.audioContext.suspend();
            }
        };

        source.start();
        return source;
    }

    private pickFormat<F extends Array<keyof typeof formatMap>>(...formats: F): F[number] | null {
        // Detect supported formats
        const audioElement = document.createElement("audio");

        for (const format of formats) {
            if (audioElement.canPlayType(formatMap[format])) {
                return format;
            }
        }
        return null;
    }
}
