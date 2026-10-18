/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

/*
 * Sega Ninja XJ model (`.xj`) and single-node NJM motion (`.njm`) readers.
 * Layouts follow phantasmal-world (https://github.com/DaanVandenBosch/phantasmal-world, MIT License,
 * Copyright (c) Daan Vanden Bosch): psolib/fileFormats/ninja/{Ninja.kt, Xj.kt} and the XJ branch of
 * web/viewer/rendering/conversion/NinjaGeometryConversion.kt.
 */

/** Non-indexed triangles that share one texture. */
export interface PsoXjTriangleGroup {
    textureId: number;
    /** False when the material asks for normal (SRC_ALPHA / INV_SRC_ALPHA) blending. */
    additive: boolean;
    positions: number[];
    normals: number[];
    uvs: number[];
}

export interface PsoXjModelData {
    groups: PsoXjTriangleGroup[];
    vertexCount: number;
}

const NJCM = "NJCM";

const EVAL_NO_TRANSLATE = 0x01;
const EVAL_NO_ROTATE = 0x02;
const EVAL_NO_SCALE = 0x04;
const EVAL_HIDDEN = 0x08;
const EVAL_BREAK_CHILDREN = 0x10;
const EVAL_ZXY = 0x20;

const BLEND_SRC_ALPHA = 4;
const BLEND_INV_SRC_ALPHA = 5;

type Mat4 = Float64Array;

const angleToRad = (angle: number): number => (angle * 2 * Math.PI) / 0x10000;

function mul(a: Mat4, b: Mat4): Mat4 {
    const r = new Float64Array(16);
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[row * 4 + k] * b[k * 4 + col];
            r[row * 4 + col] = s;
        }
    }
    return r;
}

const identity = (): Mat4 => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Row-major T * R * S where R = Rz * Ry * Rx (or Rz * Rx * Ry for ZXY objects). */
export function ninjaObjectMatrix(
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number],
    zxy = false,
): Mat4 {
    const [cx, sx] = [Math.cos(rot[0]), Math.sin(rot[0])];
    const [cy, sy] = [Math.cos(rot[1]), Math.sin(rot[1])];
    const [cz, sz] = [Math.cos(rot[2]), Math.sin(rot[2])];
    const rx = new Float64Array([1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1]);
    const ry = new Float64Array([cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1]);
    const rz = new Float64Array([cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const r = zxy ? mul(rz, mul(rx, ry)) : mul(rz, mul(ry, rx));
    const m = mul(r, new Float64Array([scale[0], 0, 0, 0, 0, scale[1], 0, 0, 0, 0, scale[2], 0, 0, 0, 0, 1]));
    m[3] = pos[0];
    m[7] = pos[1];
    m[11] = pos[2];
    return m;
}

function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
    return [
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    ];
}

function transformNormal(m: Mat4, x: number, y: number, z: number): [number, number, number] {
    const nx = m[0] * x + m[1] * y + m[2] * z;
    const ny = m[4] * x + m[5] * y + m[6] * z;
    const nz = m[8] * x + m[9] * y + m[10] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
}

/** Parses an `NJCM`-wrapped XJ object tree into world-space triangles grouped by texture. Returns null if malformed. */
export function parseXjModel(buf: ArrayBuffer): PsoXjModelData | null {
    if (buf.byteLength < 8 + 52) return null;
    const view = new DataView(buf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== NJCM) return null;
    const base = 8;
    const end = Math.min(buf.byteLength, base + view.getUint32(4, true));
    const inRange = (off: number, size: number): boolean => off >= 0 && base + off + size <= end;
    const u32 = (off: number): number => view.getUint32(base + off, true);
    const f32 = (off: number): number => view.getFloat32(base + off, true);

    const groups = new Map<string, PsoXjTriangleGroup>();
    let vertexCount = 0;
    const visited = new Set<number>();

    const parseModel = (modelOff: number, matrix: Mat4): void => {
        if (!inRange(modelOff, 0x28)) return;
        const vertexInfoOff = u32(modelOff + 4);
        const vertexInfoCount = u32(modelOff + 8);
        if (vertexInfoCount === 0 || !inRange(vertexInfoOff, 16)) return;

        const vertexType = view.getUint16(base + vertexInfoOff, true);
        const tableOff = u32(vertexInfoOff + 4);
        const stride = u32(vertexInfoOff + 8);
        const count = u32(vertexInfoOff + 12);
        if (stride < 12 || count === 0 || count > 65535 || !inRange(tableOff, stride * count)) return;

        const pos: Array<[number, number, number]> = [];
        const norm: Array<[number, number, number]> = [];
        const uv: Array<[number, number]> = [];
        for (let i = 0; i < count; i++) {
            const vo = tableOff + i * stride;
            pos.push(transformPoint(matrix, f32(vo), f32(vo + 4), f32(vo + 8)));
            let n: [number, number, number] = [0, 1, 0];
            let t: [number, number] = [0, 0];
            if ((vertexType === 2 || vertexType === 3 || vertexType === 6 || vertexType === 7) && stride >= 24) {
                n = transformNormal(matrix, f32(vo + 12), f32(vo + 16), f32(vo + 20));
            }
            if ((vertexType === 3 || vertexType === 7) && stride >= 32) t = [f32(vo + 24), f32(vo + 28)];
            else if (vertexType === 5 && stride >= 24) t = [f32(vo + 16), f32(vo + 20)];
            norm.push(n);
            uv.push(t);
        }

        let textureId = 0;
        let srcAlpha = BLEND_SRC_ALPHA;
        let dstAlpha = 1;
        for (const [listOff, listCount] of [
            [u32(modelOff + 12), u32(modelOff + 16)],
            [u32(modelOff + 20), u32(modelOff + 24)],
        ]) {
            for (let s = 0; s < listCount && inRange(listOff + s * 20, 20); s++) {
                const so = listOff + s * 20;
                const matOff = u32(so);
                const matCount = u32(so + 4);
                const indexOff = u32(so + 8);
                const indexCount = u32(so + 12);

                for (let m = 0; m < matCount && inRange(matOff + m * 16, 16); m++) {
                    const mo = matOff + m * 16;
                    const kind = u32(mo);
                    if (kind === 2) {
                        srcAlpha = u32(mo + 4);
                        dstAlpha = u32(mo + 8);
                    } else if (kind === 3) {
                        textureId = u32(mo + 4);
                    }
                }
                if (!inRange(indexOff, indexCount * 2)) continue;

                const additive = srcAlpha !== BLEND_SRC_ALPHA || dstAlpha !== BLEND_INV_SRC_ALPHA;
                const key = `${textureId}:${additive}`;
                let group = groups.get(key);
                if (!group) {
                    group = { textureId, additive, positions: [], normals: [], uvs: [] };
                    groups.set(key, group);
                }
                for (let j = 2; j < indexCount; j++) {
                    const a = view.getUint16(base + indexOff + (j - 2) * 2, true);
                    const b = view.getUint16(base + indexOff + (j - 1) * 2, true);
                    const c = view.getUint16(base + indexOff + j * 2, true);
                    if (a === b || b === c || a === c || a >= count || b >= count || c >= count) continue;
                    for (const v of j % 2 === 0 ? [a, b, c] : [b, a, c]) {
                        group.positions.push(...pos[v]);
                        group.normals.push(...norm[v]);
                        group.uvs.push(...uv[v]);
                        vertexCount++;
                    }
                }
            }
        }
    };

    const parseObject = (objOff: number, parent: Mat4): void => {
        for (let off = objOff; ; ) {
            if (visited.has(off) || !inRange(off, 52)) return;
            visited.add(off);
            const flags = u32(off);
            const matrix = mul(
                parent,
                ninjaObjectMatrix(
                    flags & EVAL_NO_TRANSLATE ? [0, 0, 0] : [f32(off + 8), f32(off + 12), f32(off + 16)],
                    flags & EVAL_NO_ROTATE
                        ? [0, 0, 0]
                        : [
                              angleToRad(view.getInt32(base + off + 20, true)),
                              angleToRad(view.getInt32(base + off + 24, true)),
                              angleToRad(view.getInt32(base + off + 28, true)),
                          ],
                    flags & EVAL_NO_SCALE ? [1, 1, 1] : [f32(off + 32), f32(off + 36), f32(off + 40)],
                    (flags & EVAL_ZXY) !== 0,
                ),
            );
            const modelOff = u32(off + 4);
            if (modelOff && !(flags & EVAL_HIDDEN)) parseModel(modelOff, matrix);
            const childOff = u32(off + 44);
            if (childOff && !(flags & EVAL_BREAK_CHILDREN)) parseObject(childOff, matrix);
            const siblingOff = u32(off + 48);
            if (!siblingOff) return;
            off = siblingOff;
        }
    };

    parseObject(0, identity());
    return vertexCount > 0 ? { groups: [...groups.values()], vertexCount } : null;
}

export interface PsoNjmRootPose {
    position: [number, number, number];
    /** Radians, applied in Ninja ZYX order. */
    rotation: [number, number, number];
    scale: [number, number, number];
}

export interface PsoNjmRootMotion {
    frameCount: number;
    sample(frame: number): PsoNjmRootPose;
}

interface Keyframe {
    frame: number;
    value: [number, number, number];
}

const MTYPE_POS = 0x1;
const MTYPE_ANG = 0x2;
const MTYPE_SCL = 0x4;

function sampleTrack(keys: Keyframe[], frame: number, fallback: [number, number, number]): [number, number, number] {
    if (keys.length === 0) return fallback;
    if (frame <= keys[0].frame) return keys[0].value;
    for (let i = 1; i < keys.length; i++) {
        const k1 = keys[i];
        if (frame <= k1.frame) {
            const k0 = keys[i - 1];
            const t = (frame - k0.frame) / Math.max(1, k1.frame - k0.frame);
            return [0, 1, 2].map((a) => k0.value[a] + (k1.value[a] - k0.value[a]) * t) as [number, number, number];
        }
    }
    return keys[keys.length - 1].value;
}

/** Reads the first node's position/angle/scale tracks from an `NMDM`-wrapped motion. Returns null if malformed. */
export function parseNjmRootMotion(buf: ArrayBuffer): PsoNjmRootMotion | null {
    if (buf.byteLength < 8 + 12) return null;
    const view = new DataView(buf);
    const base = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) === "NMDM" ? 8 : 0;
    const inRange = (off: number, size: number): boolean => off >= 0 && base + off + size <= buf.byteLength;
    const dataOff = view.getUint32(base, true);
    const frameCount = Math.max(1, view.getUint32(base + 4, true));
    const type = view.getUint16(base + 8, true);
    const kinds = [MTYPE_POS, MTYPE_ANG, MTYPE_SCL, 0x8, 0x10, 0x20, 0x40, 0x80].filter((bit) => type & bit);
    if (kinds.length === 0 || !inRange(dataOff, kinds.length * 8)) return null;

    const tracks = new Map<number, Keyframe[]>();
    kinds.forEach((kind, i) => {
        const keysOff = view.getUint32(base + dataOff + i * 4, true);
        const keyCount = view.getUint32(base + dataOff + (kinds.length + i) * 4, true);
        if (kind !== MTYPE_POS && kind !== MTYPE_ANG && kind !== MTYPE_SCL) return;
        if (!keysOff || !keyCount || !inRange(keysOff, keyCount * 16)) return;
        const keys: Keyframe[] = [];
        for (let k = 0; k < keyCount; k++) {
            const ko = base + keysOff + k * 16;
            const value: [number, number, number] =
                kind === MTYPE_ANG
                    ? [
                          angleToRad(view.getInt32(ko + 4, true)),
                          angleToRad(view.getInt32(ko + 8, true)),
                          angleToRad(view.getInt32(ko + 12, true)),
                      ]
                    : [view.getFloat32(ko + 4, true), view.getFloat32(ko + 8, true), view.getFloat32(ko + 12, true)];
            keys.push({ frame: view.getUint32(ko, true), value });
        }
        tracks.set(kind, keys);
    });

    return {
        frameCount,
        sample: (frame: number): PsoNjmRootPose => {
            const f = Math.max(0, Math.min(frameCount - 1, frame));
            return {
                position: sampleTrack(tracks.get(MTYPE_POS) ?? [], f, [0, 0, 0]),
                rotation: sampleTrack(tracks.get(MTYPE_ANG) ?? [], f, [0, 0, 0]),
                scale: sampleTrack(tracks.get(MTYPE_SCL) ?? [], f, [1, 1, 1]),
            };
        },
    };
}
