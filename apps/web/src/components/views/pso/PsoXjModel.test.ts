/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { parseNjmRootMotion, parseXjModel } from "./PsoXjModel";

/** One object (translated +X, turned 90 degrees about Y) holding a textured 4-vertex strip. */
function buildXj(): ArrayBuffer {
    const size = 0x150;
    const buf = new ArrayBuffer(8 + size);
    const v = new DataView(buf);
    "NJCM".split("").forEach((ch, i) => v.setUint8(i, ch.charCodeAt(0)));
    v.setUint32(4, size, true);
    const b = 8;

    v.setUint32(b + 0x04, 0x40, true);
    v.setFloat32(b + 0x08, 1, true);
    v.setInt32(b + 0x18, 0x4000, true);
    [0x20, 0x24, 0x28].forEach((o) => v.setFloat32(b + o, 1, true));

    v.setUint32(b + 0x44, 0x70, true);
    v.setUint32(b + 0x48, 1, true);
    v.setUint32(b + 0x4c, 0x80, true);
    v.setUint32(b + 0x50, 1, true);

    v.setUint16(b + 0x70, 3, true);
    v.setUint32(b + 0x74, 0xa0, true);
    v.setUint32(b + 0x78, 32, true);
    v.setUint32(b + 0x7c, 4, true);

    v.setUint32(b + 0x80, 0x120, true);
    v.setUint32(b + 0x84, 1, true);
    v.setUint32(b + 0x88, 0x140, true);
    v.setUint32(b + 0x8c, 4, true);

    [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
    ].forEach(([x, y], i) => {
        const o = b + 0xa0 + i * 32;
        v.setFloat32(o, x, true);
        v.setFloat32(o + 4, y, true);
        v.setFloat32(o + 20, 1, true);
        v.setFloat32(o + 24, x, true);
        v.setFloat32(o + 28, y, true);
    });

    v.setUint32(b + 0x120, 3, true);
    v.setUint32(b + 0x124, 2, true);
    [0, 1, 2, 3].forEach((idx, i) => v.setUint16(b + 0x140 + i * 2, idx, true));
    return buf;
}

function buildNjm(): ArrayBuffer {
    const buf = new ArrayBuffer(8 + 0x60);
    const v = new DataView(buf);
    "NMDM".split("").forEach((ch, i) => v.setUint8(i, ch.charCodeAt(0)));
    v.setUint32(4, 0x60, true);
    const b = 8;
    v.setUint32(b, 0x0c, true);
    v.setUint32(b + 4, 11, true);
    v.setUint16(b + 8, 0x6, true);
    v.setUint16(b + 10, 2, true);
    v.setUint32(b + 0x0c, 0x20, true);
    v.setUint32(b + 0x10, 0x40, true);
    v.setUint32(b + 0x14, 2, true);
    v.setUint32(b + 0x18, 2, true);
    v.setUint32(b + 0x30, 10, true);
    v.setInt32(b + 0x38, 0x4000, true);
    v.setFloat32(b + 0x44, 1, true);
    v.setFloat32(b + 0x4c, 1, true);
    v.setUint32(b + 0x50, 10, true);
    [0x54, 0x58, 0x5c].forEach((o) => v.setFloat32(b + o, 1, true));
    return buf;
}

describe("PsoXjModel", () => {
    it("expands triangle strips into world-space triangles grouped by texture", () => {
        const model = parseXjModel(buildXj());
        expect(model).not.toBeNull();
        expect(model!.vertexCount).toBe(6);
        expect(model!.groups).toHaveLength(1);
        const group = model!.groups[0];
        expect(group.textureId).toBe(2);
        expect(group.additive).toBe(true);

        // Vertex (1, 0, 0) turned 90 degrees about Y lands on -Z, then the object offset moves it +1 on X.
        expect(Array.from(group.positions.slice(3, 6)).map((n) => +n.toFixed(5))).toEqual([1, 0, -1]);
        expect(group.uvs.slice(2, 4)).toEqual([1, 0]);
        expect(group.normals.slice(0, 3).map((n) => +n.toFixed(5))).toEqual([1, 0, 0]);
    });

    it("rejects buffers that are not NJCM chunks", () => {
        expect(parseXjModel(new ArrayBuffer(128))).toBeNull();
    });

    it("interpolates the root node's angle and scale keys", () => {
        const motion = parseNjmRootMotion(buildNjm());
        expect(motion?.frameCount).toBe(11);
        const pose = motion!.sample(5);
        expect(pose.rotation[1]).toBeCloseTo(Math.PI / 4);
        expect(pose.scale).toEqual([1, 0.5, 1]);
        expect(pose.position).toEqual([0, 0, 0]);
        expect(motion!.sample(99).scale).toEqual([1, 1, 1]);
    });
});
