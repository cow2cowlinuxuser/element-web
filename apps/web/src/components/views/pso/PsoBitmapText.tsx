/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import { loadPsoBitmapFont, PSO_FONT_LINE_HEIGHT, type PsoBitmapFont } from "./PsoBitmapFont";

export function usePsoBitmapFont(): PsoBitmapFont | null {
    const [font, setFont] = useState<PsoBitmapFont | null>(null);
    useEffect(() => {
        let cancelled = false;
        void loadPsoBitmapFont().then((f) => {
            if (!cancelled) setFont(f);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return font;
}

interface Props {
    text: string;
    /** Rendered line height in CSS pixels; the atlas is stretched to it the way the game stretches its text. */
    lineHeight: number;
    maxWidth: number;
    maxLines?: number;
    className?: string;
}

/** White PSO HUD caption text, drawn from the game's bitmap font when extracted, otherwise styled HTML text. */
export function PsoBitmapText({ text, lineHeight, maxWidth, maxLines = 3, className }: Props): JSX.Element {
    const font = usePsoBitmapFont();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const scale = lineHeight / PSO_FONT_LINE_HEIGHT;
    const lines = useMemo(
        () => (font ? font.wrap(text, Math.floor(maxWidth / scale), maxLines) : []),
        [font, text, maxWidth, scale, maxLines],
    );

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!font || !canvas) return;
        const width = Math.max(1, ...lines.map((l) => font.measure(l)));
        canvas.width = width;
        canvas.height = PSO_FONT_LINE_HEIGHT * Math.max(1, lines.length);
        canvas.style.width = `${width * scale}px`;
        canvas.style.height = `${canvas.height * scale}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        lines.forEach((line, i) => font.draw(ctx, line, 0, i * PSO_FONT_LINE_HEIGHT));
    }, [font, lines, scale]);

    if (!font) {
        return (
            <span
                className={classNames("pso-bitmap-text pso-bitmap-text--fallback", className)}
                style={{ fontSize: `${Math.round(lineHeight * 0.8)}px`, lineHeight: `${lineHeight}px`, maxWidth }}
            >
                {text}
            </span>
        );
    }
    return (
        <canvas ref={canvasRef} className={classNames("pso-bitmap-text", className)} role="img" aria-label={text} />
    );
}
