/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

/*
 * PSOBB technique effects, staged like the client:
 * startup -> charge (element-coloured particles at the hands) -> release -> effect.
 * Foie, Rafoie, the Barta family and ground ring waves use the client's own meshes from `bm_technic.bml` /
 * `bm_tec_regurar.bml` when they have been extracted to `media/pso/tech/`; everything else is procedural.
 */

type Vec3 = [number, number, number];

export interface PsoTechEffectMesh {
    name: string;
    format: "PROCEDURAL";
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    uvs: Float32Array;
    vertexCount: number;
    chunkInfo: string;
}

export type PsoTechMeshKey = "orb" | "ring" | "shard" | "bolt" | "column";

export type PsoTechXjKey = "xj_foie" | "xj_rafoie" | "xj_rafoie_shock" | "xj_barta" | "xj_gibarta" | "xj_rabarta" | "xj_ringwave";

/** Files under `media/pso/tech/`. Motions run at 30 frames per second. */
export const PSO_TECH_XJ_ASSETS: Record<PsoTechXjKey, { model: string; texture: string; motion?: string }> = {
    xj_foie: { model: "eff_f_foie.xj", texture: "tecregular.xvm" },
    xj_rafoie: { model: "eff_rafoie.xj", texture: "technic.xvm" },
    xj_rafoie_shock: { model: "eff_f_rafoie_shushku.xj", texture: "technic.xvm" },
    xj_barta: { model: "eff_f_bartaturara.xj", texture: "technic.xvm", motion: "eff_f_bartaturara.njm" },
    xj_gibarta: { model: "eff_f_gibarta_01.xj", texture: "technic.xvm", motion: "eff_f_gibarta_01.njm" },
    xj_rabarta: { model: "eff_f_rabarta.xj", texture: "technic.xvm", motion: "eff_f_rabarta.njm" },
    xj_ringwave: { model: "eff_f_ringwave.xj", texture: "technic.xvm" },
};

/** Same unit scale as the player models, so effect meshes keep their in-game size relative to characters. */
export const PSO_TECH_XJ_WORLD_SCALE = 0.135;

const MOTION_FPS = 30;
const RINGWAVE_RADIUS = 105.6 * PSO_TECH_XJ_WORLD_SCALE;
/** Turns a mesh authored with +Z up (Rafoie's dome, its shock disc) upright in the lobby's Y-up world. */
const Z_UP_PITCH = -Math.PI / 2;

export type PsoTechFamily =
    | "foie"
    | "barta"
    | "zonde"
    | "grants"
    | "megid"
    | "resta"
    | "anti"
    | "buff"
    | "debuff"
    | "ryuker"
    | "reverser";

export interface PsoTechSpec {
    name: string;
    family: PsoTechFamily;
    /** 0 = simple (Foie), 1 = normal (Gifoie), 2 = hard (Rafoie). */
    tier: 0 | 1 | 2;
    color: Vec3;
    /** Seconds from cast start until the technique releases (end of the cast motion's charge). */
    releaseSec: number;
    /** Seconds the released effect stays on screen. */
    effectSec: number;
}

export interface PsoActiveTechEffect {
    id: string;
    spec: PsoTechSpec;
    x: number;
    y: number;
    z: number;
    yaw: number;
    bornAt: number;
}

export interface PsoTechDrawCall {
    mesh: PsoTechMeshKey | PsoTechXjKey;
    /** Frame of the mesh's own `.njm` motion, if it has one. */
    motionFrame?: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    sx: number;
    sy: number;
    sz: number;
    tint: Vec3;
    alpha: number;
}

const FIRE: Vec3 = [1.0, 0.45, 0.12];
const ICE: Vec3 = [0.55, 0.85, 1.0];
const LIGHTNING: Vec3 = [1.0, 0.95, 0.45];
const LIGHT: Vec3 = [1.0, 0.98, 0.8];
const DARK: Vec3 = [0.6, 0.2, 0.85];
const HEAL: Vec3 = [0.4, 1.0, 0.55];
const CURE: Vec3 = [0.45, 0.95, 1.0];

const TECH_TABLE: Record<string, Omit<PsoTechSpec, "name" | "releaseSec" | "effectSec">> = {
    foie: { family: "foie", tier: 0, color: FIRE },
    gifoie: { family: "foie", tier: 1, color: FIRE },
    rafoie: { family: "foie", tier: 2, color: FIRE },
    barta: { family: "barta", tier: 0, color: ICE },
    gibarta: { family: "barta", tier: 1, color: ICE },
    rabarta: { family: "barta", tier: 2, color: ICE },
    zonde: { family: "zonde", tier: 0, color: LIGHTNING },
    gizonde: { family: "zonde", tier: 1, color: LIGHTNING },
    razonde: { family: "zonde", tier: 2, color: LIGHTNING },
    grants: { family: "grants", tier: 2, color: LIGHT },
    megid: { family: "megid", tier: 2, color: DARK },
    resta: { family: "resta", tier: 1, color: HEAL },
    anti: { family: "anti", tier: 0, color: CURE },
    shifta: { family: "buff", tier: 1, color: [1.0, 0.3, 0.25] },
    deband: { family: "buff", tier: 1, color: [0.3, 0.55, 1.0] },
    jellen: { family: "debuff", tier: 1, color: [0.85, 0.15, 0.2] },
    zalure: { family: "debuff", tier: 1, color: [0.2, 0.3, 0.9] },
    ryuker: { family: "ryuker", tier: 1, color: [0.5, 0.95, 1.0] },
    reverser: { family: "reverser", tier: 2, color: [1.0, 0.85, 0.4] },
};

/** Androids (HUcast, HUcaseal, RAcast, RAcaseal) cannot use techniques. */
export function isAndroidClass(classId: string | undefined): boolean {
    return classId === "hucast" || classId === "hucaseal" || classId === "racast" || classId === "racaseal";
}

export function getTechSpec(techName: string): PsoTechSpec {
    const key = techName.trim().toLowerCase();
    const base = TECH_TABLE[key] ?? TECH_TABLE.shifta;
    return {
        name: techName,
        ...base,
        releaseSec: 0.4 + base.tier * 0.12,
        effectSec: base.tier === 2 ? 1.6 : base.tier === 1 ? 1.3 : 0.9,
    };
}

/** Total time the caster stays in the cast motion. */
export function techCastDurationSec(spec: PsoTechSpec): number {
    return spec.releaseSec + 0.25;
}

export function isTechEffectAlive(effect: PsoActiveTechEffect, now: number): boolean {
    return (now - effect.bornAt) / 1000 < effect.spec.releaseSec + effect.spec.effectSec;
}

class TechMeshBuilder {
    private pos: number[] = [];
    private norm: number[] = [];

    public tri(a: Vec3, b: Vec3, c: Vec3): void {
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        this.pos.push(...a, ...b, ...c);
        this.norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }

    public quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
        this.tri(a, b, c);
        this.tri(a, c, d);
    }

    public build(name: string): PsoTechEffectMesh {
        const vertexCount = this.pos.length / 3;
        return {
            name,
            format: "PROCEDURAL",
            positions: new Float32Array(this.pos),
            normals: new Float32Array(this.norm),
            colors: new Float32Array(vertexCount * 3).fill(1),
            uvs: new Float32Array(vertexCount * 2).fill(-1),
            vertexCount,
            chunkInfo: "Technique effect",
        };
    }
}

export function buildTechEffectMeshes(): Record<PsoTechMeshKey, PsoTechEffectMesh> {
    const orb = new TechMeshBuilder();
    const rings = 6;
    const segs = 10;
    const pt = (i: number, j: number): Vec3 => {
        const theta = (i / rings) * Math.PI;
        const phi = (j / segs) * Math.PI * 2;
        return [Math.sin(theta) * Math.cos(phi) * 0.5, Math.cos(theta) * 0.5, Math.sin(theta) * Math.sin(phi) * 0.5];
    };
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) orb.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1));
    }

    const ring = new TechMeshBuilder();
    for (let j = 0; j < 24; j++) {
        const a0 = (j / 24) * Math.PI * 2;
        const a1 = ((j + 1) / 24) * Math.PI * 2;
        const inner = 0.9;
        ring.quad(
            [Math.cos(a0) * inner, 0, Math.sin(a0) * inner],
            [Math.cos(a0), 0, Math.sin(a0)],
            [Math.cos(a1), 0, Math.sin(a1)],
            [Math.cos(a1) * inner, 0, Math.sin(a1) * inner],
        );
        ring.quad(
            [Math.cos(a0), 0, Math.sin(a0)],
            [Math.cos(a0), 0.12, Math.sin(a0)],
            [Math.cos(a1), 0.12, Math.sin(a1)],
            [Math.cos(a1), 0, Math.sin(a1)],
        );
    }

    const shard = new TechMeshBuilder();
    const tip: Vec3 = [0, 1, 0];
    const base: Vec3 = [0, 0, 0];
    const mid = (k: number): Vec3 => {
        const a = (k / 4) * Math.PI * 2;
        return [Math.cos(a) * 0.14, 0.3, Math.sin(a) * 0.14];
    };
    for (let k = 0; k < 4; k++) {
        shard.tri(mid(k), mid(k + 1), tip);
        shard.tri(mid(k + 1), mid(k), base);
    }

    const bolt = new TechMeshBuilder();
    const zig: Vec3[] = [
        [0, 1, 0],
        [0.12, 0.8, 0.03],
        [-0.08, 0.6, -0.02],
        [0.1, 0.4, 0.04],
        [-0.06, 0.2, -0.03],
        [0, 0, 0],
    ];
    const w = 0.05;
    for (let k = 0; k < zig.length - 1; k++) {
        const a = zig[k];
        const b = zig[k + 1];
        bolt.quad([a[0] - w, a[1], a[2]], [a[0] + w, a[1], a[2]], [b[0] + w, b[1], b[2]], [b[0] - w, b[1], b[2]]);
        bolt.quad([a[0], a[1], a[2] - w], [a[0], a[1], a[2] + w], [b[0], b[1], b[2] + w], [b[0], b[1], b[2] - w]);
    }

    const column = new TechMeshBuilder();
    for (let j = 0; j < 16; j++) {
        const a0 = (j / 16) * Math.PI * 2;
        const a1 = ((j + 1) / 16) * Math.PI * 2;
        column.quad(
            [Math.cos(a0), 0, Math.sin(a0)],
            [Math.cos(a1), 0, Math.sin(a1)],
            [Math.cos(a1) * 0.8, 1, Math.sin(a1) * 0.8],
            [Math.cos(a0) * 0.8, 1, Math.sin(a0) * 0.8],
        );
    }

    return {
        orb: orb.build("Technique orb"),
        ring: ring.build("Technique ring wave"),
        shard: shard.build("Technique ice shard"),
        bolt: bolt.build("Technique lightning bolt"),
        column: column.build("Technique light column"),
    };
}

function call(
    mesh: PsoTechMeshKey | PsoTechXjKey,
    x: number,
    y: number,
    z: number,
    scale: number | Vec3,
    tint: Vec3,
    alpha: number,
    yaw = 0,
    pitch = 0,
): PsoTechDrawCall {
    const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
    return { mesh, x, y, z, yaw, pitch, sx, sy, sz, tint, alpha: Math.max(0, Math.min(1, alpha)) };
}

const fadeOut = (t: number): number => 1 - Math.max(0, Math.min(1, t));

/**
 * Returns the draw calls for an effect at time `now` (ms, `performance.now()` clock).
 * Positions are world-space; forward for `yaw` is (sin yaw, cos yaw).
 * `xjAvailable` lists the client meshes that have loaded; techniques without one fall back to procedural shapes.
 */
export function sampleTechEffect(
    effect: PsoActiveTechEffect,
    now: number,
    xjAvailable: ReadonlySet<PsoTechXjKey> = new Set(),
): PsoTechDrawCall[] {
    const out = sampleTechEffectCalls(effect, now, xjAvailable);
    if (!xjAvailable.has("xj_ringwave")) return out;
    return out.map((c) =>
        c.mesh === "ring" && c.pitch === 0
            ? { ...c, mesh: "xj_ringwave", sx: c.sx / RINGWAVE_RADIUS, sy: 1, sz: c.sz / RINGWAVE_RADIUS }
            : c,
    );
}

function sampleTechEffectCalls(
    effect: PsoActiveTechEffect,
    now: number,
    xjAvailable: ReadonlySet<PsoTechXjKey>,
): PsoTechDrawCall[] {
    const { spec, x, y, z, yaw } = effect;
    const t = (now - effect.bornAt) / 1000;
    const out: PsoTechDrawCall[] = [];
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const c = spec.color;

    // Charge: element-coloured motes gathering at chest height while the cast motion plays.
    if (t < spec.releaseSec) {
        const k = t / spec.releaseSec;
        for (let i = 0; i < 6; i++) {
            const a = i * (Math.PI / 3) + t * 7;
            const r = 0.7 * (1 - k) + 0.15;
            out.push(call("orb", x + fx * 0.35 + Math.cos(a) * r, y + 1.25 + Math.sin(a * 1.3) * 0.15, z + fz * 0.35 + Math.sin(a) * r, 0.12, c, 0.5 + k * 0.5));
        }
        return out;
    }

    const e = t - spec.releaseSec;
    const p = Math.min(1, e / spec.effectSec);
    const tier = spec.tier;

    const motion = (secs: number, frames: number): number => Math.min(frames - 1, Math.max(0, secs * MOTION_FPS));

    switch (spec.family) {
        case "foie": {
            const hasFireball = xjAvailable.has("xj_foie");
            if (tier === 0 && hasFireball) {
                const travel = Math.min(1, e / 0.45);
                const d = 0.6 + travel * 6;
                const bx = x + fx * d;
                const bz = z + fz * d;
                if (travel < 1) {
                    out.push(call("xj_foie", bx, y + 1.1, bz, 0.9, [1, 1, 1], 1, e * 14));
                } else {
                    const b = (e - 0.45) / (spec.effectSec - 0.45);
                    out.push(call("xj_foie", bx, y + 1.1, bz, 0.9 + b * 2.4, [1, 1, 1], fadeOut(b), e * 14));
                }
            } else if (tier === 1 && hasFireball) {
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + e * 5;
                    const r = 0.8 + p * 3.2;
                    out.push(call("xj_foie", x + Math.cos(a) * r, y + 0.9, z + Math.sin(a) * r, 0.7, [1, 1, 1], fadeOut((p - 0.6) / 0.4), e * 10 + i));
                }
            } else if (tier === 2 && xjAvailable.has("xj_rafoie")) {
                const ex = x + fx * 4;
                const ez = z + fz * 4;
                const grow = Math.min(1, e / 0.35);
                out.push(call("xj_rafoie", ex, y, ez, 0.35 + grow * 0.75, [1, 1, 1], fadeOut((p - 0.45) / 0.55), e * 2, Z_UP_PITCH));
                if (xjAvailable.has("xj_rafoie_shock")) {
                    out.push(call("xj_rafoie_shock", ex, y + 0.08, ez, 1 + p * 3, [1, 1, 1], fadeOut(p), 0, Z_UP_PITCH));
                }
                out.push(call("ring", ex, y + 0.05, ez, 0.5 + p * 5, c, fadeOut(p)));
            } else if (tier === 0) {
                // Fireball flies forward, then bursts.
                const travel = Math.min(1, e / 0.45);
                const d = 0.6 + travel * 6;
                const bx = x + fx * d;
                const bz = z + fz * d;
                if (travel < 1) {
                    out.push(call("orb", bx, y + 1.1, bz, 0.55, c, 0.95));
                    out.push(call("orb", bx - fx * 0.4, y + 1.1, bz - fz * 0.4, 0.35, c, 0.5));
                } else {
                    const b = (e - 0.45) / (spec.effectSec - 0.45);
                    out.push(call("orb", bx, y + 1.1, bz, 0.6 + b * 2.2, c, fadeOut(b)));
                }
            } else if (tier === 1) {
                // Gifoie: fire orbs spiral outward around the caster.
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + e * 5;
                    const r = 0.8 + p * 3.2;
                    out.push(call("orb", x + Math.cos(a) * r, y + 0.9, z + Math.sin(a) * r, 0.55, c, fadeOut((p - 0.6) / 0.4)));
                }
            } else {
                // Rafoie: large explosion ahead of the caster.
                const ex = x + fx * 4;
                const ez = z + fz * 4;
                out.push(call("orb", ex, y + 1.0, ez, 1 + p * 4.5, c, fadeOut(p) * 0.9));
                out.push(call("orb", ex, y + 1.0, ez, 0.5 + p * 2.5, [1, 0.9, 0.5], fadeOut(p)));
                out.push(call("ring", ex, y + 0.1, ez, 0.5 + p * 5, c, fadeOut(p)));
            }
            break;
        }
        case "barta": {
            if (tier === 0 && xjAvailable.has("xj_barta")) {
                // A line of ice spikes erupts forward; each spike plays bartaturara's own grow-and-twist motion.
                for (let s = 0; s < 7; s++) {
                    const appear = s * 0.06;
                    if (e < appear) break;
                    const d = 0.9 + s * 0.9;
                    const age = (e - appear) / (spec.effectSec - appear);
                    const spike = call("xj_barta", x + fx * d, y, z + fz * d, 1.1, [1, 1, 1], fadeOut((age - 0.6) / 0.4), yaw + s * 0.7);
                    spike.motionFrame = motion(e - appear, 10);
                    out.push(spike);
                }
                break;
            }
            if (tier === 1 && xjAvailable.has("xj_gibarta")) {
                const ring = call("xj_gibarta", x, y, z, 0.6, [1, 1, 1], fadeOut((p - 0.65) / 0.35), yaw);
                ring.motionFrame = motion(e, 31);
                out.push(ring);
                break;
            }
            if (tier === 2 && xjAvailable.has("xj_rabarta")) {
                const storm = call("xj_rabarta", x, y, z, 1.4, [1, 1, 1], fadeOut((p - 0.65) / 0.35), yaw);
                storm.motionFrame = motion(e, 31);
                out.push(storm);
                break;
            }
            const lines = tier === 0 ? [0] : tier === 1 ? [-0.5, 0, 0.5] : Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
            for (const offset of lines) {
                const ly = tier === 2 ? offset : yaw + offset;
                const dx = Math.sin(ly);
                const dz = Math.cos(ly);
                const shards = 7;
                for (let s = 0; s < shards; s++) {
                    const appear = s * 0.05;
                    if (e < appear) break;
                    const age = (e - appear) / (spec.effectSec - appear);
                    const d = 0.8 + s * 0.85;
                    const grow = Math.min(1, (e - appear) / 0.1);
                    out.push(call("shard", x + dx * d, y, z + dz * d, [0.9, 1.4 * grow, 0.9], c, fadeOut((age - 0.6) / 0.4), ly + s, 0.25));
                }
            }
            break;
        }
        case "zonde": {
            const strikes: Array<[number, number]> =
                tier === 0
                    ? [[x + fx * 4, z + fz * 4]]
                    : tier === 1
                      ? [0, 1, 2].map((i) => [x + Math.sin(yaw + (i - 1) * 0.6) * (3 + i), z + Math.cos(yaw + (i - 1) * 0.6) * (3 + i)])
                      : Array.from({ length: 6 }, (_, i) => {
                            const a = (i / 6) * Math.PI * 2;
                            return [x + Math.cos(a) * 3.5, z + Math.sin(a) * 3.5] as [number, number];
                        });
            strikes.forEach(([sx, sz], i) => {
                const local = e - i * 0.08;
                if (local < 0) return;
                const flicker = Math.sin(local * 60) > -0.3 ? 1 : 0.35;
                const a = fadeOut(local / (spec.effectSec * 0.7)) * flicker;
                out.push(call("bolt", sx, y, sz, [2.2, 7, 2.2], c, a, local * 9));
                out.push(call("orb", sx, y + 0.3, sz, 0.9, c, a * 0.8));
            });
            break;
        }
        case "grants": {
            const gx = x + fx * 4;
            const gz = z + fz * 4;
            out.push(call("ring", gx, y + 0.05, gz, 1.6, c, fadeOut(p)));
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const fall = Math.min(1, Math.max(0, (e - i * 0.04) / 0.35));
                const r = 1.6 * (1 - fall);
                out.push(call("shard", gx + Math.cos(a) * r, y + 6 * (1 - fall), gz + Math.sin(a) * r, [0.6, 1.6, 0.6], c, fadeOut((p - 0.7) / 0.3), 0, Math.PI));
            }
            out.push(call("column", gx, y, gz, [0.7, 6 * Math.min(1, e / 0.3), 0.7], c, fadeOut(p) * 0.6));
            break;
        }
        case "megid": {
            const mx = x + fx * 4;
            const mz = z + fz * 4;
            out.push(call("orb", mx, y + 1.1, mz, 0.4 + Math.sin(Math.min(1, p * 1.4) * Math.PI) * 1.8, c, fadeOut((p - 0.5) / 0.5)));
            out.push(call("ring", mx, y + 1.1, mz, 1.3, [0.2, 0.05, 0.3], fadeOut(p), e * 6, Math.PI / 2));
            out.push(call("ring", mx, y + 1.1, mz, 1.1, c, fadeOut(p), -e * 4, 0.6));
            break;
        }
        case "resta":
        case "anti":
        case "reverser": {
            const big = spec.family === "resta" && tier >= 1 ? 3.2 : 1.6;
            out.push(call("ring", x, y + 0.05, z, 0.6 + p * big, c, fadeOut(p)));
            out.push(call("ring", x, y + 0.05 + p * 1.6, z, 0.9, c, fadeOut(p) * 0.6));
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + e * 2;
                const rise = ((e * 1.4 + i * 0.13) % 1) * 2.2;
                out.push(call("orb", x + Math.cos(a) * 0.7, y + rise, z + Math.sin(a) * 0.7, 0.14, c, fadeOut(p)));
            }
            if (spec.family === "reverser") out.push(call("column", x, y, z, [0.9, 3.5, 0.9], c, fadeOut(p) * 0.5));
            break;
        }
        case "buff":
        case "debuff": {
            // Shifta/Deband spiral up around the caster; Jellen/Zalure spiral down onto the target.
            const down = spec.family === "debuff";
            const cx = down ? x + fx * 3 : x;
            const cz = down ? z + fz * 3 : z;
            for (let i = 0; i < 14; i++) {
                const k = (i / 14 + e * 0.9) % 1;
                const h = down ? 2.6 * (1 - k) : 2.6 * k;
                const a = k * Math.PI * 4 + i;
                out.push(call("orb", cx + Math.cos(a) * 0.9, y + h, cz + Math.sin(a) * 0.9, 0.18, c, fadeOut((p - 0.6) / 0.4)));
            }
            out.push(call("ring", cx, y + 0.05, cz, 1.2, c, fadeOut(p)));
            break;
        }
        case "ryuker": {
            out.push(call("column", x + fx * 1.5, y, z + fz * 1.5, [0.6, 4 * Math.min(1, e / 0.25), 0.6], c, fadeOut((p - 0.5) / 0.5) * 0.7));
            out.push(call("ring", x + fx * 1.5, y + 0.05, z + fz * 1.5, 0.9, c, fadeOut(p)));
            break;
        }
    }
    return out;
}
