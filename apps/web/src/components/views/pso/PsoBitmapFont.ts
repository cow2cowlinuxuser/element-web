/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { loadPsoUiXvmPixels } from "./PsoGamePackLoader";

/** The game's bitmap font sheet (ending credits); only present when the user has extracted their own PSOBB assets. */
const FONT_SHEET = "media/pso/ui/ed128_font.xvm";

/** Each texture is a 6x6 grid of 20px cells, glyphs left-aligned in their cell, read row by row. */
const CELL = 20;
const GRID_COLUMNS = 6;
const SHEET_LAYOUT: ReadonlyArray<{ tex: number; chars: string }> = [
    { tex: 0, chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ()/.:&~©-," },
    { tex: 1, chars: "abcdefghijklmnopqrstuvwxyz0123456789" },
];

/** Line height of the atlas, in atlas pixels. */
export const PSO_FONT_LINE_HEIGHT = CELL;
const SPACE_ADVANCE = 7;
/** Neighbouring glyph outlines overlap by this much, as in the game. */
const GLYPH_OVERLAP = 1;
/** Characters the sheet lacks are drawn with the font PSOBB itself renders text with, sized to the atlas caps. */
const FALLBACK_FONT = "bold 22px Tahoma, Verdana, sans-serif";
const FALLBACK_BASELINE = 17;

interface Glyph {
    atlas: HTMLCanvasElement;
    sx: number;
    sy: number;
    width: number;
}

export interface PsoBitmapFont {
    measure(text: string): number;
    /** Draws one line with its top-left at `(x, y)`; returns the advance in atlas pixels. */
    draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number;
    /** Greedy word wrap to `maxWidth` atlas pixels; anything past `maxLines` is cut with an ellipsis. */
    wrap(text: string, maxWidth: number, maxLines: number): string[];
}

/**
 * The sheet's glyphs are pale blue with a dark blue rim. Remap the fill to white and the rim to near-black so the
 * text reads like the game's white HUD captions (e.g. "Level Up") over any backdrop.
 */
function whiten(rgba: Uint8Array): Uint8ClampedArray {
    const out = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
        const fill = Math.min(1, Math.max(0, (rgba[i] - 24) / 110));
        out[i] = 12 + 243 * fill;
        out[i + 1] = 16 + 239 * fill;
        out[i + 2] = 22 + 233 * fill;
        out[i + 3] = rgba[i + 3];
    }
    return out;
}

function buildFont(textures: ReadonlyArray<{ width: number; height: number; rgba: Uint8Array } | undefined>): PsoBitmapFont | null {
    const glyphs = new Map<string, Glyph>();
    for (const { tex, chars } of SHEET_LAYOUT) {
        const src = textures[tex];
        if (!src) return null;
        const atlas = document.createElement("canvas");
        atlas.width = src.width;
        atlas.height = src.height;
        const ctx = atlas.getContext("2d");
        if (!ctx) return null;
        const img = ctx.createImageData(src.width, src.height);
        img.data.set(whiten(src.rgba));
        ctx.putImageData(img, 0, 0);

        [...chars].forEach((ch, i) => {
            const cx = (i % GRID_COLUMNS) * CELL;
            const cy = Math.floor(i / GRID_COLUMNS) * CELL;
            let minX = CELL;
            let maxX = -1;
            for (let y = cy; y < cy + CELL; y++) {
                for (let x = cx; x < cx + CELL; x++) {
                    if (src.rgba[(y * src.width + x) * 4 + 3] > 24) {
                        minX = Math.min(minX, x - cx);
                        maxX = Math.max(maxX, x - cx);
                    }
                }
            }
            if (maxX >= minX) glyphs.set(ch, { atlas, sx: cx + minX, sy: cy, width: maxX - minX + 1 });
        });
    }

    const measureCtx = document.createElement("canvas").getContext("2d");
    if (!measureCtx) return null;
    measureCtx.font = FALLBACK_FONT;

    const advance = (ch: string): number => {
        if (ch === " ") return SPACE_ADVANCE;
        const glyph = glyphs.get(ch);
        if (glyph) return glyph.width - GLYPH_OVERLAP;
        return Math.ceil(measureCtx.measureText(ch).width) + 2;
    };
    const measure = (text: string): number => {
        let w = 0;
        for (const ch of text) w += advance(ch);
        return Math.max(0, w + GLYPH_OVERLAP);
    };

    return {
        measure,
        draw(ctx, text, x, y): number {
            let pen = x;
            ctx.font = FALLBACK_FONT;
            ctx.textBaseline = "alphabetic";
            ctx.lineJoin = "round";
            for (const ch of text) {
                const glyph = glyphs.get(ch);
                if (glyph) {
                    ctx.drawImage(glyph.atlas, glyph.sx, glyph.sy, glyph.width, CELL, pen, y, glyph.width, CELL);
                } else if (ch !== " ") {
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = "rgb(12, 16, 22)";
                    ctx.strokeText(ch, pen + 1, y + FALLBACK_BASELINE);
                    ctx.fillStyle = "#ffffff";
                    ctx.fillText(ch, pen + 1, y + FALLBACK_BASELINE);
                }
                pen += advance(ch);
            }
            return pen - x;
        },
        wrap(text, maxWidth, maxLines): string[] {
            const lines: string[] = [];
            let line = "";
            for (const word of text.split(/\s+/).filter(Boolean)) {
                const candidate = line ? `${line} ${word}` : word;
                if (measure(candidate) <= maxWidth || !line) {
                    line = candidate;
                } else {
                    lines.push(line);
                    line = word;
                }
            }
            if (line) lines.push(line);
            for (let i = 0; i < lines.length; i++) {
                // A single word wider than the line is hard-cut.
                while (measure(lines[i]) > maxWidth && lines[i].length > 1) lines[i] = lines[i].slice(0, -1);
            }
            if (lines.length <= maxLines) return lines;
            const kept = lines.slice(0, maxLines);
            let last = kept[maxLines - 1];
            while (last.length > 0 && measure(`${last}...`) > maxWidth) last = last.slice(0, -1);
            kept[maxLines - 1] = `${last}...`;
            return kept;
        },
    };
}

let fontPromise: Promise<PsoBitmapFont | null> | null = null;

/** Loads the game's bitmap font once; resolves null when the sheet has not been extracted. */
export function loadPsoBitmapFont(): Promise<PsoBitmapFont | null> {
    fontPromise ??= (async (): Promise<PsoBitmapFont | null> => {
        if (typeof document === "undefined") return null;
        const textures = await loadPsoUiXvmPixels(FONT_SHEET);
        return textures ? buildFont(textures) : null;
    })().catch(() => null);
    return fontPromise;
}
