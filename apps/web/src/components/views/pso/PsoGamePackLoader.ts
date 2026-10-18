/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import type {
    PsoBgmTrackId,
    PsoCityEventLayoutId,
    PsoClassModelId,
    PsoLobbyStageId,
    PsoNpcModelId,
} from "./PsoLobby3dLayer";

export type PsoGuildStationId =
    | "guild_counter"
    | "medical_center"
    | "bank_counter"
    | "shop_plaza"
    | "teleporter_pad"
    | "principal_warp_to_office"
    | "principal_warp_to_city"
    | "principal_tyrell";

export interface PsoCompiledStageSpec {
    vis: string;
    col: string;
    xvm: string;
    label: string;
    shortLabel?: string;
    scale: number;
    defaultFloorY: number;
    defaultBgm?: PsoBgmTrackId;
}

export interface PsoCompiledClassModelSpec {
    bdy: string;
    hed: string;
    hai?: string;
    xvm: string;
    tint: [number, number, number];
}

export interface PsoCompiledNpcModelSpec {
    nj: string;
    xvm: string;
    tint: [number, number, number];
}

export interface PsoCompiledGuildStation {
    id: PsoGuildStationId;
    title: string;
    x: number;
    y: number;
    z: number;
    radius: number;
    color: string;
}

export interface PsoCompiledNpcPlacement {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    yawDeg: number;
    c: PsoClassModelId;
    npcModelId: PsoNpcModelId;
    wanderRadius?: number;
}

export interface PsoCompiledStageObjectPlacement {
    kind: "warp_big" | "warp_small" | "elv_alcove" | "shopdoor" | "hunter_door" | "med_door";
    x: number;
    y: number;
    z: number;
    yawDeg: number;
}

export interface PsoCompiledAircarLane {
    x: number;
    y: number;
    z0: number;
    z1: number;
    speed: number;
    phase: number;
    dir: 1 | -1;
}

export interface PsoCompiledUiEntry {
    id: string;
    name: string;
    description: string;
}

/** Compiled from `unitxt_e.prs`. Only trusted when `uiSpecVersion === 2` (earlier packs used wrong string indices). */
export interface PsoCompiledUiMenuSpec {
    uiSpecVersion: number;
    functionKeyLabels: string[];
    helpTexts: Record<string, string>;
    statLabels: Record<
        | "totalExp"
        | "toNextLv"
        | "money"
        | "atp"
        | "dfp"
        | "mst"
        | "ata"
        | "evp"
        | "lck"
        | "efr"
        | "eic"
        | "eth"
        | "edk"
        | "elt"
        | "magLevel"
        | "synchro"
        | "iq"
        | "meseta",
        string
    >;
    classNames: string[];
    sectionIds: string[];
    techniques: PsoCompiledUiEntry[];
    toolItems: PsoCompiledUiEntry[];
    uiXvmSheets: Record<string, string>;
}

export interface PsoCompiledGamePack {
    schemaVersion: number;
    generatedAt: string;
    sourceGame: string;
    stages: Partial<Record<Exclude<PsoLobbyStageId, "pioneer2_holodeck">, PsoCompiledStageSpec>>;
    classModels: Partial<Record<PsoClassModelId, PsoCompiledClassModelSpec>>;
    npcModels: Partial<Record<PsoNpcModelId, PsoCompiledNpcModelSpec>>;
    stationsByStage: Record<string, PsoCompiledGuildStation[]>;
    cityNpcLayouts: Partial<Record<PsoCityEventLayoutId, PsoCompiledNpcPlacement[]>>;
    cityStageObjects: PsoCompiledStageObjectPlacement[];
    cityAircarLanes: PsoCompiledAircarLane[];
    uiMenuSpec?: PsoCompiledUiMenuSpec;
}

/**
 * Clean-room procedural fallback pack used when the user has not run
 * `pnpm run extract:psobb -- --source /path/to/PSOBB` yet.
 * Contains zero copyrighted game tables, coordinates, or binary filenames.
 */
export const FALLBACK_PROCEDURAL_GAME_PACK: PsoCompiledGamePack = {
    schemaVersion: 1,
    generatedAt: "procedural-fallback",
    sourceGame: "Clean-Room Procedural Holodeck",
    stages: {},
    classModels: {},
    npcModels: {},
    stationsByStage: {
        default: [
            {
                id: "guild_counter",
                title: "💁‍♀️ HUNTER'S GUILD COUNTER [F]",
                x: 0,
                y: 2.85,
                z: -5.2,
                radius: 3.1,
                color: "#f2c650",
            },
            {
                id: "teleporter_pad",
                title: "🟢 RAGOL AREA TELEPORTER (FOREST / CAVES / MINES / RUINS) [F]",
                x: 0,
                y: 1.95,
                z: 4.2,
                radius: 2.8,
                color: "#50f296",
            },
            {
                id: "bank_counter",
                title: "🏦 CHECK ROOM & SYMBOL BANK [F]",
                x: 6.8,
                y: 2.55,
                z: -0.4,
                radius: 2.7,
                color: "#7cc8ff",
            },
            {
                id: "medical_center",
                title: "🏥 PIONEER 2 MEDICAL CENTER [F]",
                x: -6.8,
                y: 2.55,
                z: -0.4,
                radius: 2.7,
                color: "#6fffa8",
            },
        ],
    },
    cityNpcLayouts: {
        e: [],
        e_s: [],
        e_d: [],
        e_c1: [],
    },
    cityStageObjects: [],
    cityAircarLanes: [],
};

let cachedGamePack: PsoCompiledGamePack | null = null;

export async function loadCompiledGamePack(url = "media/pso/game-pack.json"): Promise<PsoCompiledGamePack> {
    if (cachedGamePack) return cachedGamePack;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const json = (await res.json()) as Partial<PsoCompiledGamePack>;
            if (json && typeof json === "object" && json.schemaVersion === 1) {
                cachedGamePack = {
                    ...FALLBACK_PROCEDURAL_GAME_PACK,
                    ...json,
                    stationsByStage: {
                        ...FALLBACK_PROCEDURAL_GAME_PACK.stationsByStage,
                        ...(json.stationsByStage ?? {}),
                    },
                };
                return cachedGamePack;
            }
        }
    } catch {
        // Fallback to clean-room procedural pack if `game-pack.json` hasn't been compiled yet
    }
    return FALLBACK_PROCEDURAL_GAME_PACK;
}

export interface PsoDecodedXvrTexture {
    index: number;
    texId: number;
    width: number;
    height: number;
    fmt: number;
    dataUrl: string;
}

const cachedXvmSheets = new Map<string, PsoDecodedXvrTexture[]>();
const cachedXvmPixels = new Map<string, Array<{ width: number; height: number; rgba: Uint8Array }>>();
const cachedSprites = new Map<string, string>();

function decodeSingleXvrToRgba(
    view: DataView,
    bytes: Uint8Array,
    xvrOffset: number,
    width: number,
    height: number,
    fmt: number,
): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    const dataStart = xvrOffset + 64;
    if (fmt === 6 || fmt === 7) {
        const isDxt3 = fmt === 7;
        const blockSize = isDxt3 ? 16 : 8;
        const blocksX = Math.max(1, width >> 2);
        const blocksY = Math.max(1, height >> 2);
        let bOff = dataStart;

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                if (bOff + blockSize > bytes.byteLength) break;
                const alphaLow = isDxt3 ? view.getUint32(bOff, true) : 0xffffffff;
                const alphaHigh = isDxt3 ? view.getUint32(bOff + 4, true) : 0xffffffff;
                const cOff = isDxt3 ? bOff + 8 : bOff;
                const c0 = view.getUint16(cOff, true);
                const c1 = view.getUint16(cOff + 2, true);
                const lut = view.getUint32(cOff + 4, true);

                const r0 = ((c0 >> 11) & 31) * (255 / 31);
                const g0 = ((c0 >> 5) & 63) * (255 / 63);
                const b0 = (c0 & 31) * (255 / 31);
                const r1 = ((c1 >> 11) & 31) * (255 / 31);
                const g1 = ((c1 >> 5) & 63) * (255 / 63);
                const b1 = (c1 & 31) * (255 / 31);

                for (let py = 0; py < 4; py++) {
                    for (let px = 0; px < 4; px++) {
                        const pIdx = py * 4 + px;
                        const code = (lut >>> (pIdx * 2)) & 3;
                        let r = r0;
                        let g = g0;
                        let b = b0;
                        let a = 255;

                        if (isDxt3) {
                            const alphaWord = pIdx < 8 ? alphaLow : alphaHigh;
                            const shift = (pIdx & 7) * 4;
                            a = ((alphaWord >>> shift) & 0x0f) * 17;
                        }

                        if (c0 > c1 || isDxt3) {
                            if (code === 1) {
                                r = r1;
                                g = g1;
                                b = b1;
                            } else if (code === 2) {
                                r = (2 * r0 + r1) / 3;
                                g = (2 * g0 + g1) / 3;
                                b = (2 * b0 + b1) / 3;
                            } else if (code === 3) {
                                r = (r0 + 2 * r1) / 3;
                                g = (g0 + 2 * g1) / 3;
                                b = (b0 + 2 * b1) / 3;
                            }
                        } else {
                            if (code === 1) {
                                r = r1;
                                g = g1;
                                b = b1;
                            } else if (code === 2) {
                                r = (r0 + r1) * 0.5;
                                g = (g0 + g1) * 0.5;
                                b = (b0 + b1) * 0.5;
                            } else if (code === 3) {
                                r = 0;
                                g = 0;
                                b = 0;
                                if (!isDxt3) a = 0;
                            }
                        }

                        const dstX = bx * 4 + px;
                        const dstY = by * 4 + py;
                        if (dstX < width && dstY < height) {
                            const dst = (dstY * width + dstX) * 4;
                            rgba[dst] = r;
                            rgba[dst + 1] = g;
                            rgba[dst + 2] = b;
                            rgba[dst + 3] = a;
                        }
                    }
                }
                bOff += blockSize;
            }
        }
    }
    return rgba;
}

/**
 * Decodes an extracted PSOBB `.xvm` UI texture archive (`media/pso/ui/*.xvm`)
 * into browser `data:image/png` URLs with full DXT1/DXT3 alpha channel support.
 */
export async function loadPsoUiXvmSheet(url: string): Promise<PsoDecodedXvrTexture[]> {
    const cached = cachedXvmSheets.get(url);
    if (cached) return cached;
    if (typeof document === "undefined") return [];

    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const buffer = await res.arrayBuffer();
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        const out: PsoDecodedXvrTexture[] = [];
        const pixels: Array<{ width: number; height: number; rgba: Uint8Array }> = [];

        let pos = 0;
        let texIndex = 0;
        while (pos + 64 <= bytes.byteLength) {
            if (
                bytes[pos] === 0x58 && // 'X'
                bytes[pos + 1] === 0x56 && // 'V'
                bytes[pos + 2] === 0x52 && // 'R'
                bytes[pos + 3] === 0x54 // 'T'
            ) {
                const chunkLen = view.getUint32(pos + 4, true);
                const fmt = view.getUint32(pos + 12, true);
                const texId = view.getUint32(pos + 16, true);
                const w = view.getUint16(pos + 20, true);
                const h = view.getUint16(pos + 22, true);

                if (w >= 8 && h >= 8 && w <= 2048 && h <= 2048) {
                    const rgba = decodeSingleXvrToRgba(view, bytes, pos, w, h, fmt);
                    pixels[texIndex] = { width: w, height: h, rgba };
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        const imgData = ctx.createImageData(w, h);
                        imgData.data.set(rgba);
                        ctx.putImageData(imgData, 0, 0);
                        out.push({
                            index: texIndex,
                            texId,
                            width: w,
                            height: h,
                            fmt,
                            dataUrl: canvas.toDataURL("image/png"),
                        });
                    }
                }
                texIndex++;
                pos += Math.max(64, chunkLen + 8);
            } else {
                pos += 4;
            }
        }

        if (out.length > 0) {
            cachedXvmSheets.set(url, out);
            cachedXvmPixels.set(url, pixels);
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * Crops one sprite out of a texture inside an extracted `.xvm` sheet and returns it as a PNG data URL.
 * `rect` is `[x, y, width, height]` in texture pixels. Returns null if the sheet is not available.
 */
export async function loadPsoUiSprite(
    sheetUrl: string,
    texIndex: number,
    rect: readonly [number, number, number, number],
): Promise<string | null> {
    const key = `${sheetUrl}#${texIndex}@${rect.join(",")}`;
    const cached = cachedSprites.get(key);
    if (cached) return cached;
    await loadPsoUiXvmSheet(sheetUrl);
    const tex = cachedXvmPixels.get(sheetUrl)?.[texIndex];
    if (!tex) return null;
    const [sx, sy, sw, sh] = rect;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) {
        const srcRow = (sy + y) * tex.width + sx;
        if (sy + y >= tex.height) break;
        img.data.set(tex.rgba.subarray(srcRow * 4, (srcRow + Math.min(sw, tex.width - sx)) * 4), y * sw * 4);
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL("image/png");
    cachedSprites.set(key, url);
    return url;
}

