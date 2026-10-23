/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useState } from "react";
import classNames from "classnames";
import {
    EventType,
    type IRoomTimelineData,
    type MatrixClient,
    type MatrixEvent,
    MatrixEventEvent,
    type Room,
    RoomEvent,
} from "matrix-js-sdk/src/matrix";

import { PsoBitmapText } from "./PsoBitmapText";

const MAX_LINES = 5;
const LINE_LIFETIME_MS = 8000;
const LINE_FADE_MS = 900;

interface TickerLine {
    id: string;
    text: string;
    addedAt: number;
}

function tickerText(ev: MatrixEvent): string | null {
    if (ev.getType() !== EventType.RoomMessage || ev.isRedacted()) return null;
    const content = ev.getContent();
    if (typeof content.body !== "string" || !content.body.trim()) return null;
    if (content["m.relates_to"]?.rel_type === "m.replace") return null;
    const sender = ev.sender?.name ?? ev.getSender() ?? "?";
    const body = content.body.replace(/^>.*\n?/gm, "").replace(/\s+/g, " ").trim();
    return content.msgtype === "m.emote" ? `* ${sender} ${body}` : `${sender}: ${body}`;
}

interface Props {
    client: MatrixClient;
    roomId: string | null;
}

/**
 * While the compact chat box is folded away, new messages in the current room scroll through a translucent side
 * window in white PSO caption text, each fading out after a few seconds.
 */
export function PsoMessageTicker({ client, roomId }: Props): JSX.Element | null {
    const [lines, setLines] = useState<TickerLine[]>([]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        setLines([]);
        if (!roomId) return;
        const myUserId = client.getUserId();

        const push = (ev: MatrixEvent): void => {
            const text = tickerText(ev);
            if (!text) return;
            const id = ev.getId() ?? `${ev.getTs()}-${text}`;
            setLines((prev) =>
                prev.some((l) => l.id === id) ? prev : [...prev, { id, text, addedAt: Date.now() }].slice(-MAX_LINES),
            );
        };

        const onTimeline = (
            ev: MatrixEvent,
            room: Room | undefined,
            toStartOfTimeline: boolean | undefined,
            removed: boolean,
            data: IRoomTimelineData,
        ): void => {
            if (toStartOfTimeline || removed || !data.liveEvent || room?.roomId !== roomId) return;
            if (ev.getSender() === myUserId) return;
            if (ev.isEncrypted() && (ev.isBeingDecrypted() || ev.shouldAttemptDecryption())) {
                ev.once(MatrixEventEvent.Decrypted, () => push(ev));
                return;
            }
            push(ev);
        };

        client.on(RoomEvent.Timeline, onTimeline);
        return () => {
            client.off(RoomEvent.Timeline, onTimeline);
        };
    }, [client, roomId]);

    useEffect(() => {
        if (lines.length === 0) return;
        const timer = window.setInterval(() => {
            const t = Date.now();
            setNow(t);
            setLines((prev) => {
                const next = prev.filter((l) => t - l.addedAt < LINE_LIFETIME_MS);
                return next.length === prev.length ? prev : next;
            });
        }, 250);
        return () => window.clearInterval(timer);
    }, [lines.length]);

    if (lines.length === 0) return null;
    return (
        <div className="pso-message-ticker" aria-live="polite" data-testid="pso-message-ticker">
            {lines.map((line) => (
                <div
                    key={line.id}
                    className={classNames("pso-message-ticker-line", {
                        "pso-message-ticker-line--fading": now - line.addedAt > LINE_LIFETIME_MS - LINE_FADE_MS,
                    })}
                >
                    <PsoBitmapText text={line.text} lineHeight={15} maxWidth={330} maxLines={3} />
                </div>
            ))}
        </div>
    );
}
