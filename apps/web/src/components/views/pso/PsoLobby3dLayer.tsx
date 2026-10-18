/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import React, { useCallback, useEffect, useRef, useState, type JSX } from "react";
import classNames from "classnames";

import { playPsoSymbolChime, type PsoSymbolChatSpec } from "./PsoSymbolChatMaker";
import {
    buildTechEffectMeshes,
    getTechSpec,
    isAndroidClass,
    isTechEffectAlive,
    sampleTechEffect,
    techCastDurationSec,
    type PsoActiveTechEffect,
} from "./PsoTechniqueEffects";
import {
    FALLBACK_PROCEDURAL_GAME_PACK,
    loadCompiledGamePack,
    type PsoCompiledGamePack,
} from "./PsoGamePackLoader";

export type PsoWeaponModelId =
    | "photon_saber"
    | "red_sword"
    | "dark_flow"
    | "kingdom_key"
    | "oathkeeper";

export type PsoClassModelId =
    | "humar"
    | "hunewearl"
    | "hucast"
    | "hucaseal"
    | "ramar"
    | "ramarl"
    | "racast"
    | "racaseal"
    | "fomar"
    | "fomarl"
    | "fonewm"
    | "fonewearl";

export type PsoNpcModelId =
    | "npc_trunk"
    | "npc_nurse"
    | "npc_tekker"
    | "npc_tyrell"
    | "npc_irene"
    | "npc_momoka"
    | "npc_hakase"
    | "npc_gunm"
    | "npc_gunb2"
    | "npc_shop_weap"
    | "npc_shop_armor"
    | "npc_shop_tool"
    | "npc_cit_efw"
    | "npc_cit_etw"
    | "npc_cit_eom"
    | "npc_cit_efsm";

export type PsoCityEventLayoutId = "e" | "e_s" | "e_d" | "e_c1";

export type PsoLobbyStageId =
    | "pioneer2_holodeck"
    | "bb_lobby_01"
    | "bb_city00"
    | "bb_forest01"
    | "bb_cave01"
    | "bb_machine01"
    | "bb_ruins01"
    | "bb_labo00";

export type PsoBgmTrackId =
    | "synth"
    | "CITY.ogg"
    | "LOBBY.ogg"
    | "GUILD.ogg"
    | "MEDICAL.ogg"
    | "SHOP.ogg"
    | "LABO.ogg"
    | "slbgm_forest.ogg";

export interface PsoPersistedHunterState {
    x: number;
    z: number;
    yaw: number;
    camYaw: number;
    classId: PsoClassModelId;
    weaponId: PsoWeaponModelId;
    inChair: boolean;
    stageId: PsoLobbyStageId;
    useRealClassNj: boolean;
    bgmTrack: PsoBgmTrackId;
    mesetaCount: number;
    rareDropsFound: string[];
    reShade: PsoReShadeConfig;
}

export type PsoLobbyEmoteId = "none" | "wave" | "dance" | "cheer" | "bow";

export type PsoSectionIdName =
    | "VIRIDIA"
    | "GREENILL"
    | "SKYLY"
    | "BLUEFULL"
    | "PURPLENUM"
    | "PINKAL"
    | "REDRIA"
    | "ORAN"
    | "YELLOWBOZE"
    | "WHITILL";

export interface PsoReShadeConfig {
    enabled: boolean;
    smaa: boolean;
    vibrance: number; // 0..1.5
    lumaSharpen: number; // 0..1.5
    reflectiveBump: number; // 0..1.2
    magicBloom: number; // 0..1.5
    khOverhaulMode: boolean;
}

export interface PsoRemoteLobbyPlayer {
    userId: string;
    displayName: string;
    x: number;
    z: number;
    vx?: number;
    vz?: number;
    yaw: number;
    classId: PsoClassModelId;
    weaponId: PsoWeaponModelId;
    inChair: boolean;
    attacking: boolean;
    emote?: PsoLobbyEmoteId;
    ghostMode?: boolean;
    stageId?: PsoLobbyStageId;
    lastUpdated: number;
    symbolSpec?: PsoSymbolChatSpec;
}

export interface PsoLobbyWorldAction {
    kind: "hit_box" | "tech_burst" | "emote";
    boxId?: string;
    dmg?: number;
    emote?: PsoLobbyEmoteId;
    senderName?: string;
    techName?: string;
    x?: number;
    z?: number;
    yaw?: number;
    ts: number;
}

export interface PsoGuildRoomEntry {
    roomId: string;
    name: string;
    memberCount: number;
    isCurrent: boolean;
    isDirect?: boolean;
    unreadCount?: number;
}

export type PsoLobbyPresentationMode = "unified_stage" | "floating_window";

export type PsoGuildStationId =
    | "guild_counter"
    | "teleporter_pad"
    | "bank_counter"
    | "medical_center"
    | "principal_warp_to_office"
    | "principal_warp_to_city"
    | "principal_tyrell"
    | "shop_plaza";

export interface PsoLobbySpeechBubble {
    text: string;
    senderName: string;
    sentAt: number;
}

export type PsoInputFocusMode = "WORLD_FOCUS" | "CHAT_FOCUS";

interface PsoItemBoxEntity {
    id: string;
    x: number;
    z: number;
    rotY: number;
    kind: "green_box" | "red_rare_box" | "kh_chest" | "rappy_target";
    hp: number;
    maxHp: number;
    dropLoot: null | {
        type: "red_box" | "meseta" | "monomate" | "keyblade";
        label: string;
    };
    respawnAt: number;
}

interface PsoFloatingText {
    id: string;
    x: number;
    y: number;
    z: number;
    text: string;
    color: string;
    bornAt: number;
}

interface CustomMeshGeometry {
    name: string;
    format: "OBJ" | "GLB" | "NJ (Sega Ninja)" | "PROCEDURAL";
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    uvs: Float32Array;
    vertexCount: number;
    chunkInfo: string;
    atlasPixels?: Uint8Array;
    atlasWidth?: number;
    atlasHeight?: number;
    articulatedParts?: {
        torsoHead: CustomMeshGeometry;
        leftLeg: CustomMeshGeometry;
        rightLeg: CustomMeshGeometry;
        leftArm: CustomMeshGeometry;
        rightArm: CustomMeshGeometry;
        hipY: number;
        shoulderX: number;
        shoulderY: number;
        shoulderZ: number;
    };
    skeleton?: {
        nodes: Array<{
            flags: number;
            px: number;
            py: number;
            pz: number;
            rx: number;
            ry: number;
            rz: number;
            sx: number;
            sy: number;
            sz: number;
            parentIdx: number;
        }>;
        recipes: Array<{
            weights: Array<{
                bone: number;
                w: number;
                vx: number;
                vy: number;
                vz: number;
                nx: number;
                ny: number;
                nz: number;
            }>;
        }>;
        triVertRecipes: Uint16Array;
        scale: number;
        lastMotionKey?: string;
        rightHandPos?: [number, number, number];
    };
}

interface PsoLobby3dLayerProps {
    localDisplayName: string;
    localUserId: string;
    activeSymbolChat: { sender: string; spec: PsoSymbolChatSpec } | null;
    remotePlayers: PsoRemoteLobbyPlayer[];
    speechBubbles?: Record<string, PsoLobbySpeechBubble>;
    presentationMode?: PsoLobbyPresentationMode;
    isChatDockVisible?: boolean;
    guildRooms?: PsoGuildRoomEntry[];
    isVoiceCallActive?: boolean;
    onChangePresentationMode?: (mode: PsoLobbyPresentationMode) => void;
    onToggleChatDock?: () => void;
    onSelectGuildRoom?: (roomId: string) => void;
    onToggleVoiceCall?: () => void;
    onOpenSymbolMaker?: () => void;
    onOpenHudTuner?: () => void;
    onSendLobbyChatMessage?: (text: string) => Promise<void> | void;
    onRequestRoomComposerFocus?: () => void;
    onBroadcastLobbyState?: (
        state: Omit<PsoRemoteLobbyPlayer, "userId" | "displayName" | "lastUpdated"> & {
            requestSync?: boolean;
            fastTick?: boolean;
            worldAction?: PsoLobbyWorldAction;
        },
    ) => void;
    incomingWorldAction?: PsoLobbyWorldAction | null;
    initialHunterState?: Partial<PsoPersistedHunterState>;
    onPersistHunterState?: (state: PsoPersistedHunterState) => void;
    /** Receives the 3D viewport element so HUD windows can be anchored inside the game view. */
    onViewportElementChange?: (el: HTMLDivElement | null) => void;
    /**
     * While true (the main menu is open) the menu owns arrows/Enter/Esc; WASD, camera and action keys still drive the hunter,
     * and chat focus is handed back when the menu closes.
     */
    isInputSuspended?: boolean;
    /** Cast a technique as the local hunter (e.g. from the main menu). `nonce` makes repeat casts distinct. */
    castTechniqueRequest?: { techName: string; nonce: number } | null;
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const SECTION_ID_TABLE: Array<{ name: PsoSectionIdName; color: string; rgb: [number, number, number] }> = [
    { name: "VIRIDIA", color: "#28d66c", rgb: [0.16, 0.84, 0.42] },
    { name: "GREENILL", color: "#7cfa4b", rgb: [0.49, 0.98, 0.29] },
    { name: "SKYLY", color: "#4fe8ff", rgb: [0.31, 0.91, 1.0] },
    { name: "BLUEFULL", color: "#3b82ff", rgb: [0.23, 0.51, 1.0] },
    { name: "PURPLENUM", color: "#b75cff", rgb: [0.72, 0.36, 1.0] },
    { name: "PINKAL", color: "#ff6ec7", rgb: [1.0, 0.43, 0.78] },
    { name: "REDRIA", color: "#ff3d47", rgb: [1.0, 0.24, 0.28] },
    { name: "ORAN", color: "#ff9429", rgb: [1.0, 0.58, 0.16] },
    { name: "YELLOWBOZE", color: "#ffe135", rgb: [1.0, 0.88, 0.21] },
    { name: "WHITILL", color: "#eafcff", rgb: [0.92, 0.99, 1.0] },
];

export function computePsoSectionId(name: string): {
    name: PsoSectionIdName;
    color: string;
    rgb: [number, number, number];
} {
    let sum = 5; // Authentic PSO Blue Burst ASCII mod-10 seed!
    for (let i = 0; i < name.length; i++) {
        sum += name.charCodeAt(i);
    }
    return SECTION_ID_TABLE[sum % 10] ?? SECTION_ID_TABLE[0];
}

// ============================================================================
// 3D MATH & PROCEDURAL MESH BUILDER FOR WEBGL
// ============================================================================
function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
    ]);
}

function mat4LookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1,
    ]);
}

function mat4TRS(
    tx: number,
    ty: number,
    tz: number,
    ry: number,
    rx: number,
    sx: number,
    sy: number,
    sz: number,
): Float32Array {
    const cy = Math.cos(ry);
    const syRot = Math.sin(ry);
    const cx = Math.cos(rx);
    const sxRot = Math.sin(rx);

    return new Float32Array([
        cy * sx, sxRot * syRot * sx, -cx * syRot * sx, 0,
        0, cx * sy, sxRot * sy, 0,
        syRot * sz, -sxRot * cy * sz, cx * cy * sz, 0,
        tx, ty, tz, 1,
    ]);
}

function projectToScreen(
    world: [number, number, number],
    view: Float32Array,
    proj: Float32Array,
    width: number,
    height: number,
): { x: number; y: number; visible: boolean } {
    const [wx, wy, wz] = world;
    const vx = view[0] * wx + view[4] * wy + view[8] * wz + view[12];
    const vy = view[1] * wx + view[5] * wy + view[9] * wz + view[13];
    const vz = view[2] * wx + view[6] * wy + view[10] * wz + view[14];
    const vw = view[3] * wx + view[7] * wy + view[11] * wz + view[15];

    const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
    const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;

    if (cw <= 0.1) return { x: -999, y: -999, visible: false };
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    return {
        x: (ndcX * 0.5 + 0.5) * width,
        y: (1.0 - (ndcY * 0.5 + 0.5)) * height,
        visible: ndcX >= -1.2 && ndcX <= 1.2 && ndcY >= -1.2 && ndcY <= 1.2,
    };
}

class MeshBuilder {
    public pos: number[] = [];
    public norm: number[] = [];
    public col: number[] = [];
    public uv: number[] = [];

    public addTri(
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
        rgb: [number, number, number],
        uvA?: [number, number],
        uvB?: [number, number],
        uvC?: [number, number],
        rgbB?: [number, number, number],
        rgbC?: [number, number, number],
    ): void {
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
        this.col.push(...rgb, ...(rgbB ?? rgb), ...(rgbC ?? rgb));
        if (uvA && uvB && uvC) {
            this.uv.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
        } else {
            this.uv.push(-1, -1, -1, -1, -1, -1);
        }
    }

    public addBox(
        cx: number,
        cy: number,
        cz: number,
        sx: number,
        sy: number,
        sz: number,
        rgb: [number, number, number],
    ): void {
        const x0 = cx - sx * 0.5;
        const x1 = cx + sx * 0.5;
        const y0 = cy - sy * 0.5;
        const y1 = cy + sy * 0.5;
        const z0 = cz - sz * 0.5;
        const z1 = cz + sz * 0.5;

        const faces: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number]]> = [
            [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // Front
            [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // Back
            [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], // Top
            [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // Bottom
            [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], // Right
            [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // Left
        ];
        for (const [p0, p1, p2, p3] of faces) {
            this.addTri(p0, p1, p2, rgb);
            this.addTri(p0, p2, p3, rgb);
        }
    }

    public addCylinder(
        cx: number,
        cy: number,
        cz: number,
        radiusTop: number,
        radiusBot: number,
        height: number,
        segments: number,
        rgb: [number, number, number],
    ): void {
        const y0 = cy - height * 0.5;
        const y1 = cy + height * 0.5;
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            const c0 = Math.cos(a0);
            const s0 = Math.sin(a0);
            const c1 = Math.cos(a1);
            const s1 = Math.sin(a1);

            const b0: [number, number, number] = [cx + c0 * radiusBot, y0, cz + s0 * radiusBot];
            const b1: [number, number, number] = [cx + c1 * radiusBot, y0, cz + s1 * radiusBot];
            const t1: [number, number, number] = [cx + c1 * radiusTop, y1, cz + s1 * radiusTop];
            const t0: [number, number, number] = [cx + c0 * radiusTop, y1, cz + s0 * radiusTop];

            this.addTri(b0, b1, t1, rgb);
            this.addTri(b0, t1, t0, rgb);
            this.addTri([cx, y1, cz], t0, t1, rgb);
        }
    }

    public toGeometry(
        name: string,
        format: CustomMeshGeometry["format"],
        chunkInfo: string,
        atlas?: { pixels: Uint8Array; width: number; height: number } | null,
    ): CustomMeshGeometry {
        return {
            name,
            format,
            positions: new Float32Array(this.pos),
            normals: new Float32Array(this.norm),
            colors: new Float32Array(this.col),
            uvs: new Float32Array(this.uv),
            vertexCount: this.pos.length / 3,
            chunkInfo,
            atlasPixels: atlas?.pixels,
            atlasWidth: atlas?.width,
            atlasHeight: atlas?.height,
        };
    }
}

function buildBuiltinGeometries(): Record<string, CustomMeshGeometry> {
    // 1. Episode I Pioneer 2 Hunter's Guild Concourse + Principal Teleporter Deck
    const stage = new MeshBuilder();
    // Main octagonal/circular deck floor
    stage.addCylinder(0, -0.25, 0, 14.5, 15.2, 0.5, 12, [0.06, 0.22, 0.27]);

    // Central Episode I Green Teleporter Spawn Pad (at x=0, z=4.2 where Hunters materialize!)
    stage.addCylinder(0, -0.01, 4.2, 2.35, 2.55, 0.1, 12, [0.1, 0.36, 0.32]);
    stage.addCylinder(0, 0.05, 4.2, 1.65, 1.75, 0.08, 12, [0.18, 0.88, 0.52]);
    stage.addCylinder(0, 0.09, 4.2, 0.85, 0.9, 0.06, 12, [0.55, 0.99, 0.78]);

    // North Curved Hunter's Guild Counter Desk (at x=0, z=-5.4) + Neon Cyan Barrier & Receptionist NPC
    stage.addBox(0, 0.58, -5.2, 5.6, 1.15, 0.9, [0.12, 0.38, 0.45]);
    stage.addBox(-2.9, 0.58, -4.5, 1.2, 1.15, 1.4, [0.12, 0.38, 0.45]);
    stage.addBox(2.9, 0.58, -4.5, 1.2, 1.15, 1.4, [0.12, 0.38, 0.45]);
    // Glowing sea-cyan top counter trim & holographic screen
    stage.addBox(0, 1.18, -5.15, 5.7, 0.12, 0.98, [0.35, 0.96, 0.92]);
    stage.addBox(0, 1.95, -5.55, 4.4, 1.1, 0.08, [0.22, 0.85, 0.92]);
    // Guild Counter Receptionist NPC behind the desk (x=0, z=-6.3)
    stage.addCylinder(0, 0.95, -6.35, 0.32, 0.42, 1.5, 8, [0.92, 0.38, 0.55]);
    stage.addCylinder(0, 1.88, -6.35, 0.24, 0.22, 0.42, 8, [0.96, 0.82, 0.72]);
    stage.addBox(0, 2.15, -6.35, 0.54, 0.16, 0.32, [0.98, 0.98, 1.0]); // Nurse/Guild cap

    // East Alcove: Check Room / Bank & Tekker Counter (at x=6.8, z=-0.4)
    stage.addBox(6.8, 0.6, -0.4, 1.1, 1.2, 3.8, [0.14, 0.34, 0.42]);
    stage.addBox(6.75, 1.22, -0.4, 1.18, 0.12, 3.9, [0.98, 0.78, 0.26]); // Amber Bank trim
    stage.addCylinder(7.8, 1.1, -0.4, 0.45, 0.5, 1.8, 8, [0.25, 0.78, 0.85]); // Storage terminal

    // West Alcove: Pioneer 2 Medical Center (at x=-6.8, z=-0.4)
    stage.addBox(-6.8, 0.6, -0.4, 1.1, 1.2, 3.8, [0.12, 0.42, 0.38]);
    stage.addBox(-6.75, 1.22, -0.4, 1.18, 0.12, 3.9, [0.32, 0.96, 0.64]); // Resta green trim
    stage.addBox(-7.6, 1.85, -0.4, 0.14, 0.9, 0.3, [0.35, 0.98, 0.68]); // Medical Cross vertical
    stage.addBox(-7.6, 1.85, -0.4, 0.14, 0.3, 0.9, [0.35, 0.98, 0.68]); // Medical Cross horizontal

    // Outer Pioneer 2 neon structural bulkheads + Overhead Domed Skylight Ring + Ragol Planet Vista
    for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const px = Math.cos(ang) * 13.4;
        const pz = Math.sin(ang) * 13.4;
        stage.addBox(px, 2.5, pz, 0.72, 5.0, 0.72, [0.1, 0.35, 0.42]);
        stage.addBox(px, 2.5, pz, 0.32, 4.8, 0.84, [0.35, 0.92, 0.88]);
        // Overhead arched skylight ribs converging toward the Pioneer 2 dome
        const mx = Math.cos(ang) * 9.5;
        const mz = Math.sin(ang) * 9.5;
        stage.addBox(mx, 5.3, mz, 0.55, 0.45, 0.55, [0.16, 0.58, 0.68]);
    }
    // Upper Pioneer 2 Skylight Crown Ring
    stage.addCylinder(0, 5.75, 0, 10.2, 9.6, 0.32, 12, [0.12, 0.46, 0.56]);

    // 2. Articulated Hunter Character Mesh Parts (Torso, Section ID Badge, Head, Left/Right Arms & Legs)
    const hunter = new MeshBuilder();
    hunter.addBox(-0.22, 0.45, 0, 0.22, 0.9, 0.24, [0.16, 0.24, 0.34]);
    hunter.addBox(0.22, 0.45, 0, 0.22, 0.9, 0.24, [0.16, 0.24, 0.34]);
    hunter.addBox(0, 1.25, 0, 0.66, 0.82, 0.38, [0.85, 0.24, 0.22]);
    hunter.addBox(0, 1.32, 0.2, 0.26, 0.26, 0.06, [0.28, 0.95, 0.9]);
    hunter.addBox(-0.48, 1.28, 0, 0.22, 0.72, 0.22, [0.82, 0.86, 0.9]);
    hunter.addBox(0.48, 1.28, 0, 0.22, 0.72, 0.22, [0.82, 0.86, 0.9]);
    hunter.addCylinder(0, 1.92, 0, 0.26, 0.24, 0.46, 8, [0.96, 0.82, 0.7]);
    hunter.addCylinder(0, 2.15, -0.04, 0.05, 0.32, 0.34, 6, [0.95, 0.76, 0.22]);

    const hunterTorso = new MeshBuilder();
    hunterTorso.addBox(0, 1.25, 0, 0.66, 0.82, 0.38, [0.85, 0.24, 0.22]); // Main armor chestplate
    hunterTorso.addBox(-0.38, 1.54, 0, 0.24, 0.22, 0.44, [0.92, 0.95, 0.98]); // Left shoulder pauldron
    hunterTorso.addBox(0.38, 1.54, 0, 0.24, 0.22, 0.44, [0.92, 0.95, 0.98]); // Right shoulder pauldron
    hunterTorso.addBox(0, 0.86, 0, 0.68, 0.14, 0.41, [0.22, 0.28, 0.36]); // Photon utility belt

    const hunterSectionBadge = new MeshBuilder();
    hunterSectionBadge.addCylinder(0, 1.34, 0.21, 0.15, 0.15, 0.05, 6, [1.0, 1.0, 1.0]);

    const hunterHead = new MeshBuilder();
    hunterHead.addCylinder(0, 0.22, 0, 0.26, 0.24, 0.46, 8, [0.96, 0.82, 0.7]); // Head
    hunterHead.addBox(0, 0.24, 0.22, 0.34, 0.1, 0.08, [0.28, 0.96, 0.95]); // Cyber visor / eyes
    hunterHead.addCylinder(0, 0.46, -0.04, 0.05, 0.34, 0.36, 6, [0.95, 0.76, 0.22]); // SpikyPSO crest/hair

    const hunterLimbArm = new MeshBuilder();
    hunterLimbArm.addBox(0, -0.32, 0, 0.21, 0.68, 0.21, [0.84, 0.88, 0.94]); // Arm segment pivoted at shoulder (y=0)
    hunterLimbArm.addBox(0, -0.62, 0, 0.24, 0.18, 0.24, [0.25, 0.88, 0.92]); // Photon gauntlet cuff

    const hunterLimbLeg = new MeshBuilder();
    hunterLimbLeg.addBox(0, -0.42, 0, 0.23, 0.84, 0.25, [0.18, 0.26, 0.36]); // Leg segment pivoted at hip (y=0)
    hunterLimbLeg.addBox(0, -0.8, 0.05, 0.25, 0.18, 0.34, [0.85, 0.88, 0.92]); // PSO Hunter boot

    const magWing = new MeshBuilder();
    magWing.addCylinder(0, 0, 0, 0.26, 0.16, 0.36, 6, [0.88, 0.94, 0.98]);
    magWing.addBox(-0.28, 0.08, -0.1, 0.32, 0.06, 0.48, [0.35, 0.98, 0.92]); // Left photon wing
    magWing.addBox(0.28, 0.08, -0.1, 0.32, 0.06, 0.48, [0.35, 0.98, 0.92]); // Right photon wing

    // 3. PSO Lobby Hover Chair
    const chair = new MeshBuilder();
    chair.addCylinder(0, 0.2, 0, 0.65, 0.55, 0.2, 8, [0.2, 0.78, 0.82]);
    chair.addBox(0, 0.45, -0.1, 0.78, 0.14, 0.78, [0.92, 0.55, 0.16]);
    chair.addBox(0, 0.95, -0.42, 0.76, 0.9, 0.16, [0.92, 0.55, 0.16]);

    // 4. Weapons (Photon Saber, Red Sword, Kingdom Key Keyblade)
    const saber = new MeshBuilder();
    saber.addBox(0, 0, 0.2, 0.08, 0.08, 0.4, [0.75, 0.8, 0.85]);
    saber.addBox(0, 0, 1.05, 0.06, 0.12, 1.4, [0.25, 0.98, 0.58]);

    const redSword = new MeshBuilder();
    redSword.addBox(0, 0, 0.2, 0.12, 0.26, 0.35, [0.85, 0.85, 0.9]);
    redSword.addBox(0, 0, 1.15, 0.1, 0.28, 1.65, [0.96, 0.18, 0.22]);

    const keyblade = new MeshBuilder();
    // Golden handguard + silver shaft + crown teeth (Kingdom Hearts PSOBB Overhaul!)
    keyblade.addBox(0, 0, 0.18, 0.12, 0.48, 0.36, [0.98, 0.82, 0.18]);
    keyblade.addBox(0, 0, 1.05, 0.09, 0.09, 1.45, [0.86, 0.9, 0.96]);
    keyblade.addBox(0, 0.22, 1.62, 0.09, 0.36, 0.26, [0.86, 0.9, 0.96]);
    keyblade.addBox(0, 0.34, 1.62, 0.1, 0.12, 0.34, [0.98, 0.82, 0.18]);

    // 5. PSO Item Boxes (Green Box, Red Rare Box, KH Stained Glass Box, Rappy Target)
    const greenBox = new MeshBuilder();
    greenBox.addCylinder(0, 0.45, 0, 0.58, 0.64, 0.88, 6, [0.18, 0.68, 0.42]);
    greenBox.addCylinder(0, 0.92, 0, 0.45, 0.58, 0.12, 6, [0.42, 0.98, 0.68]);

    const redBox = new MeshBuilder();
    redBox.addBox(0, 0.38, 0, 0.88, 0.72, 0.68, [0.88, 0.12, 0.16]);
    redBox.addBox(0, 0.76, 0, 0.92, 0.12, 0.72, [1.0, 0.45, 0.45]);

    const khChest = new MeshBuilder();
    khChest.addBox(0, 0.4, 0, 0.9, 0.76, 0.68, [0.22, 0.38, 0.86]);
    khChest.addBox(0, 0.8, 0, 0.94, 0.18, 0.72, [0.98, 0.82, 0.22]);

    const rappy = new MeshBuilder();
    rappy.addCylinder(0, 0.48, 0, 0.46, 0.52, 0.72, 8, [0.98, 0.86, 0.22]);
    rappy.addCylinder(0, 1.05, 0, 0.36, 0.38, 0.52, 8, [0.99, 0.89, 0.28]);
    rappy.addBox(0, 1.02, 0.38, 0.22, 0.14, 0.25, [0.95, 0.48, 0.12]); // Beak
    rappy.addCylinder(0, 1.42, 0, 0.04, 0.12, 0.28, 5, [0.99, 0.89, 0.28]); // Feather

    return {
        stage: stage.toGeometry("Pioneer 2 Deck (city01_00.nj)", "NJ (Sega Ninja)", "NJCM Chunk // 8 Pillars + Dome"),
        hunter: hunter.toGeometry("Hunter Avatar (pl_humar.nj)", "NJ (Sega Ninja)", "NJCM Skeletal Root // 12 Nodes"),
        hunter_torso: hunterTorso.toGeometry("Hunter Torso (pl_torso.nj)", "NJ (Sega Ninja)", "NJCM Node // Torso"),
        hunter_badge: hunterSectionBadge.toGeometry("Section ID Badge (pl_secid.nj)", "NJ (Sega Ninja)", "NJCM Node // Badge"),
        hunter_head: hunterHead.toGeometry("Hunter Head (pl_head.nj)", "NJ (Sega Ninja)", "NJCM Node // Head"),
        hunter_arm: hunterLimbArm.toGeometry("Hunter Arm (pl_arm.nj)", "NJ (Sega Ninja)", "NJCM Node // Arm"),
        hunter_leg: hunterLimbLeg.toGeometry("Hunter Leg (pl_leg.nj)", "NJ (Sega Ninja)", "NJCM Node // Leg"),
        mag_wing: magWing.toGeometry("Sato / Rati MAG (mag_wing.nj)", "NJ (Sega Ninja)", "NJCM Node // Evolution MAG"),
        chair: chair.toGeometry("Lobby Hover Chair (chair00.nj)", "NJ (Sega Ninja)", "NJCM Prop // Pioneer 2 Chair"),
        photon_saber: saber.toGeometry("DB's Photon Saber (wp_saber.nj)", "NJ (Sega Ninja)", "NJCM Weapon // Photon Edge"),
        red_sword: redSword.toGeometry("Red Sword Rare (wp_redswd.nj)", "NJ (Sega Ninja)", "NJCM Special Weapon // Sealed"),
        dark_flow: redSword.toGeometry("Dark Flow (wp_dflow.nj)", "NJ (Sega Ninja)", "NJCM Olga DNA Greatsword"),
        kingdom_key: keyblade.toGeometry("Kingdom Key (kh_keyblade.nj)", "NJ (Sega Ninja)", "KH Overhaul v1.04 // Keyblade"),
        oathkeeper: keyblade.toGeometry("Oathkeeper (kh_oath.nj)", "NJ (Sega Ninja)", "KH Overhaul v1.04 // Light Keyblade"),
        green_box: greenBox.toGeometry("Ragol Container (box_nrm.nj)", "NJ (Sega Ninja)", "NJCM Breakable Container"),
        red_rare_box: redBox.toGeometry("SPECIAL WEAPON Red Box (box_rare.nj)", "NJ (Sega Ninja)", "NJCM Rare Drop Container"),
        kh_chest: khChest.toGeometry("KH2 Stained Glass Chest (kh_box.nj)", "NJ (Sega Ninja)", "KH Overhaul v1.02 // Chest"),
        rappy_target: rappy.toGeometry("Ragol Rag Rappy (en_rappy.nj)", "NJ (Sega Ninja)", "NJCM Enemy // Rag Rappy"),
    };
}

/**
 * Decodes a Phantasy Star Online Blue Burst `.xvm` (`XVMH` / `XVRT`) texture archive into a single RGBA8 Texture Atlas
 * so WebGL can render authentic stage and character textures with a single draw call per mesh!
 */
interface PsoXvmAtlas {
    pixels: Uint8Array;
    width: number;
    height: number;
    cols: number;
    rows: number;
    texCount: number;
    avgColors: Array<[number, number, number]>;
}

function parsePsoXvmAtlas(buf: ArrayBuffer | null | undefined, cellSize = 128, cols = 16): PsoXvmAtlas | null {
    if (!buf || buf.byteLength < 64) return null;
    const view = new DataView(buf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== "XVMH") return null;

    const xvmhSize = view.getUint32(4, true);
    const rawCount = view.getUint32(8, true);
    const texCount = Math.min(rawCount, 256);
    if (texCount <= 0) return null;

    const rows = Math.max(1, Math.ceil(texCount / cols));
    const atlasW = cols * cellSize;
    const atlasH = rows * cellSize;
    const atlasPixels = new Uint8Array(atlasW * atlasH * 4);
    const avgColors: Array<[number, number, number]> = [];

    let off = 8 + xvmhSize;
    for (let t = 0; t < texCount && off + 64 <= buf.byteLength; t++) {
        const chunkSz = view.getUint32(off + 4, true);
        const fmt = view.getUint32(off + 12, true);
        const w = view.getUint16(off + 20, true);
        const h = view.getUint16(off + 22, true);
        const dataOff = off + 64;
        const nextOff = off + 8 + chunkSz;

        if (w > 0 && h > 0 && w <= 1024 && h <= 1024 && dataOff < buf.byteLength) {
            const rgba = new Uint8Array(w * h * 4);
            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            let sampleCnt = 0;

            if (fmt === 6 || fmt === 7) {
                // DXT1 (fmt=6, 8 bytes/block) or DXT3 (fmt=7, 16 bytes/block)
                const blockBytes = fmt === 7 ? 16 : 8;
                const colorOffInBlock = fmt === 7 ? 8 : 0;
                const bw = Math.max(1, w >> 2);
                const bh = Math.max(1, h >> 2);
                let bo = dataOff;
                const cr = [0, 0, 0, 0];
                const cg = [0, 0, 0, 0];
                const cb = [0, 0, 0, 0];

                for (let by = 0; by < bh; by++) {
                    for (let bx = 0; bx < bw; bx++) {
                        if (bo + blockBytes > buf.byteLength) break;
                        const c0 = view.getUint16(bo + colorOffInBlock, true);
                        const c1 = view.getUint16(bo + colorOffInBlock + 2, true);
                        const bits = view.getUint32(bo + colorOffInBlock + 4, true);

                        const r0 = ((c0 >> 11) & 0x1f) * 255 / 31;
                        const g0 = ((c0 >> 5) & 0x3f) * 255 / 63;
                        const b0 = (c0 & 0x1f) * 255 / 31;
                        const r1 = ((c1 >> 11) & 0x1f) * 255 / 31;
                        const g1 = ((c1 >> 5) & 0x3f) * 255 / 63;
                        const b1 = (c1 & 0x1f) * 255 / 31;

                        cr[0] = r0; cg[0] = g0; cb[0] = b0;
                        cr[1] = r1; cg[1] = g1; cb[1] = b1;
                        if (c0 > c1 || fmt === 7) {
                            cr[2] = (2 * r0 + r1) / 3; cg[2] = (2 * g0 + g1) / 3; cb[2] = (2 * b0 + b1) / 3;
                            cr[3] = (r0 + 2 * r1) / 3; cg[3] = (g0 + 2 * g1) / 3; cb[3] = (b0 + 2 * b1) / 3;
                        } else {
                            cr[2] = (r0 + r1) * 0.5; cg[2] = (g0 + g1) * 0.5; cb[2] = (b0 + b1) * 0.5;
                            cr[3] = (r0 + r1) * 0.5; cg[3] = (g0 + g1) * 0.5; cb[3] = (b0 + b1) * 0.5;
                        }

                        rSum += (r0 + r1) * 0.5;
                        gSum += (g0 + g1) * 0.5;
                        bSum += (b0 + b1) * 0.5;
                        sampleCnt++;

                        for (let py = 0; py < 4; py++) {
                            const yy = by * 4 + py;
                            if (yy >= h) continue;
                            for (let px = 0; px < 4; px++) {
                                const xx = bx * 4 + px;
                                if (xx >= w) continue;
                                const shift = (py * 4 + px) * 2;
                                const code = (bits >>> shift) & 3;
                                const dst = (yy * w + xx) * 4;
                                rgba[dst] = cr[code];
                                rgba[dst + 1] = cg[code];
                                rgba[dst + 2] = cb[code];
                                rgba[dst + 3] = 255;
                            }
                        }
                        bo += blockBytes;
                    }
                }
            } else {
                // 16-bit uncompressed ARGB1555 / RGB565 / ARGB4444
                let po = dataOff;
                for (let i = 0; i < w * h && po + 2 <= buf.byteLength; i++) {
                    const px = view.getUint16(po, true);
                    const r = fmt === 2 ? ((px >> 11) & 0x1f) * 255 / 31 : ((px >> 10) & 0x1f) * 255 / 31;
                    const g = fmt === 2 ? ((px >> 5) & 0x3f) * 255 / 63 : ((px >> 5) & 0x1f) * 255 / 31;
                    const b = (px & 0x1f) * 255 / 31;
                    const dst = i * 4;
                    rgba[dst] = r;
                    rgba[dst + 1] = g;
                    rgba[dst + 2] = b;
                    rgba[dst + 3] = 255;
                    rSum += r; gSum += g; bSum += b; sampleCnt++;
                    po += 2;
                }
            }

            avgColors[t] = sampleCnt > 0
                ? [rSum / (sampleCnt * 255), gSum / (sampleCnt * 255), bSum / (sampleCnt * 255)]
                : [0.6, 0.7, 0.75];

            // Resample decoded texture into its cell (col = t % cols, row = floor(t / cols)) in the atlas
            const cellX = (t % cols) * cellSize;
            const cellY = Math.floor(t / cols) * cellSize;
            for (let cy = 0; cy < cellSize; cy++) {
                const sy = Math.min(h - 1, Math.floor((cy * h) / cellSize));
                for (let cx = 0; cx < cellSize; cx++) {
                    const sx = Math.min(w - 1, Math.floor((cx * w) / cellSize));
                    const srcIdx = (sy * w + sx) * 4;
                    const dstIdx = ((cellY + cy) * atlasW + (cellX + cx)) * 4;
                    atlasPixels[dstIdx] = rgba[srcIdx];
                    atlasPixels[dstIdx + 1] = rgba[srcIdx + 1];
                    atlasPixels[dstIdx + 2] = rgba[srcIdx + 2];
                    atlasPixels[dstIdx + 3] = 255;
                }
            }
        } else {
            avgColors[t] = [0.6, 0.7, 0.75];
        }

        off = nextOff;
    }

    return {
        pixels: atlasPixels,
        width: atlasW,
        height: atlasH,
        cols,
        rows,
        texCount,
        avgColors,
    };
}

function mapUvToAtlas(u: number, v: number, texIdx: number, atlas: PsoXvmAtlas | null): [number, number] {
    if (!atlas || atlas.texCount <= 0) return [-1, -1];
    const safeIdx = Math.max(0, Math.min(atlas.texCount - 1, texIdx));
    const col = safeIdx % atlas.cols;
    const row = Math.floor(safeIdx / atlas.cols);
    // Repeat-wrap UV inside [0.02, 0.98] of the cell to prevent bleeding across neighboring atlas tiles
    const uWrap = ((u % 1) + 1) % 1;
    const vWrap = ((v % 1) + 1) % 1;
    const uClamped = 0.02 + uWrap * 0.96;
    const vClamped = 0.02 + vWrap * 0.96;
    return [(col + uClamped) / atlas.cols, (row + vClamped) / atlas.rows];
}

/**
 * Authentic Sega Ninja (`NJCM`) hierarchical character/weapon model parser (`.nj`).
 * Evaluates the `NJS_OBJECT` bone hierarchy, populates the shared 4096-vertex Ninja pool (`0x29` rigid + `0x2c` weighted envelope vertex chunks),
 * and decodes `0x40`/`0x41`/`0x42` triangle strip chunks + `.xvm` character textures into a `CustomMeshGeometry` with articulated limb sub-meshes!
 */
function parseSegaNinjaNjBuffer(
    buf: ArrayBuffer,
    labelName: string,
    scale = 0.135,
    baseTint: [number, number, number] = [0.88, 0.92, 0.96],
    extraHeadBuf?: ArrayBuffer | null,
    extraHairBuf?: ArrayBuffer | null,
    xvmBuf?: ArrayBuffer | null,
): CustomMeshGeometry {
    const builder = new MeshBuilder();
    const torsoHeadBuilder = new MeshBuilder();
    const leftLegBuilder = new MeshBuilder();
    const rightLegBuilder = new MeshBuilder();
    const leftArmBuilder = new MeshBuilder();
    const rightArmBuilder = new MeshBuilder();
    const atlas = parsePsoXvmAtlas(xvmBuf, 128, 4);
    let totalVerts = 0;
    let totalTris = 0;

    const matMul4 = (A: Float32Array, B: Float32Array): Float32Array => {
        const R = new Float32Array(16);
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                R[r * 4 + c] =
                    A[r * 4 + 0] * B[0 * 4 + c] +
                    A[r * 4 + 1] * B[1 * 4 + c] +
                    A[r * 4 + 2] * B[2 * 4 + c] +
                    A[r * 4 + 3] * B[3 * 4 + c];
            }
        }
        return R;
    };

    const makeNjMat = (
        px: number,
        py: number,
        pz: number,
        rx: number,
        ry: number,
        rz: number,
        sx: number,
        sy: number,
        sz: number,
        zxy = false,
    ): Float32Array => {
        const ax = (rx * 2 * Math.PI) / 65536;
        const ay = (ry * 2 * Math.PI) / 65536;
        const az = (rz * 2 * Math.PI) / 65536;
        const cx = Math.cos(ax);
        const sx_ = Math.sin(ax);
        const cy = Math.cos(ay);
        const sy_ = Math.sin(ay);
        const cz = Math.cos(az);
        const sz_ = Math.sin(az);
        if (zxy) {
            return new Float32Array([
                (cy * cz + sy_ * sx_ * sz_) * sx,
                (-cy * sz_ + sy_ * sx_ * cz) * sy,
                sy_ * cx * sz,
                px,
                cx * sz_ * sx,
                cx * cz * sy,
                -sx_ * sz,
                py,
                (-sy_ * cz + cy * sx_ * sz_) * sx,
                (sy_ * sz_ + cy * sx_ * cz) * sy,
                cy * cx * sz,
                pz,
                0,
                0,
                0,
                1,
            ]);
        }
        return new Float32Array([
            cy * cz * sx,
            (cz * sx_ * sy_ - cx * sz_) * sy,
            (cx * cz * sy_ + sx_ * sz_) * sz,
            px,
            cy * sz_ * sx,
            (cx * cz + sx_ * sy_ * sz_) * sy,
            (-cz * sx_ + cx * sy_ * sz_) * sz,
            py,
            -sy_ * sx,
            cy * sx_ * sy,
            cx * cy * sz,
            pz,
            0,
            0,
            0,
            1,
        ]);
    };

    let headAttachY = 16.0;
    let hipPivotY = 10.86 * scale;
    let shoulderPivotX = 2.2 * scale;
    let shoulderPivotY = 15.0 * scale;
    let shoulderPivotZ = -0.45 * scale;

    const skelNodes: NonNullable<CustomMeshGeometry["skeleton"]>["nodes"] = [];
    const skelRecipes: NonNullable<CustomMeshGeometry["skeleton"]>["recipes"] = [];
    const triVertRecipeList: number[] = [];
    const bodyWorldMats: Float32Array[] = [];

    const decodeChunkTree = (
        targetBuf: ArrayBuffer,
        rootMat: Float32Array,
        partTint: [number, number, number],
        texOffset = 0,
        isBodyTree = false,
        attachBoneOverride?: number,
    ): void => {
        const view = new DataView(targetBuf);
        if (targetBuf.byteLength < 60) return;
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        let baseOffset = magic === "NJCM" || magic === "GJCM" ? 8 : 0;
        if (magic === "NJTL") {
            let scan = 0;
            while (scan + 8 <= targetBuf.byteLength) {
                const m = String.fromCharCode(
                    view.getUint8(scan),
                    view.getUint8(scan + 1),
                    view.getUint8(scan + 2),
                    view.getUint8(scan + 3),
                );
                if (m === "NJCM" || m === "GJCM") {
                    baseOffset = scan + 8;
                    break;
                }
                const sz = view.getUint32(scan + 4, true);
                if (sz === 0 || scan + 8 + sz > targetBuf.byteLength) break;
                scan += 8 + sz;
            }
        }
        const vpool: Array<[number, number, number] | undefined> = new Array(4096);
        const vpoolRecipeIdx: Array<number | undefined> = new Array(4096);
        const vlimb: Array<"torso" | "lleg" | "rleg" | "larm" | "rarm" | undefined> = new Array(4096);
        const visited = new Set<number>();
        let nodeCounter = 0;
        const ident4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

        const walk = (
            relOff: number,
            parentMat: Float32Array,
            parentRelMat: Float32Array,
            parentNodeIdx: number,
            activeBranch: "torso" | "lleg" | "rleg" | "larm" | "rarm",
        ): void => {
            if (relOff < 0 || baseOffset + relOff + 52 > targetBuf.byteLength || visited.has(relOff)) return;
            visited.add(relOff);
            const nodeIdx = nodeCounter++;
            const off = baseOffset + relOff;
            const flags = view.getUint32(off, true);
            const mOff = view.getUint32(off + 4, true);
            const px = view.getFloat32(off + 8, true);
            const py = view.getFloat32(off + 12, true);
            const pz = view.getFloat32(off + 16, true);
            const rx = view.getInt32(off + 20, true);
            const ry = view.getInt32(off + 24, true);
            const rz = view.getInt32(off + 28, true);
            const sx = view.getFloat32(off + 32, true);
            const sy = view.getFloat32(off + 36, true);
            const sz = view.getFloat32(off + 40, true);
            const childOff = view.getUint32(off + 44, true);
            const sibOff = view.getUint32(off + 48, true);

            let branch = activeBranch;
            if (isBodyTree) {
                if (nodeIdx === 3) branch = "lleg";
                else if (nodeIdx === 12) branch = "rleg";
                else if (nodeIdx === 24) branch = "torso";
                else if (nodeIdx === 26) branch = "larm";
                else if (nodeIdx === 39) branch = "rarm";
                else if (nodeIdx === 52 || nodeIdx === 55) branch = "torso";
            }

            const effPx = flags & 1 ? 0 : px;
            const effPy = flags & 1 ? 0 : py;
            const effPz = flags & 1 ? 0 : pz;
            const effRx = flags & 2 ? 0 : rx;
            const effRy = flags & 2 ? 0 : ry;
            const effRz = flags & 2 ? 0 : rz;
            const effSx = flags & 4 ? 1 : sx || 1;
            const effSy = flags & 4 ? 1 : sy || 1;
            const effSz = flags & 4 ? 1 : sz || 1;

            if (isBodyTree) {
                skelNodes.push({
                    flags,
                    px: effPx,
                    py: effPy,
                    pz: effPz,
                    rx: effRx,
                    ry: effRy,
                    rz: effRz,
                    sx: effSx,
                    sy: effSy,
                    sz: effSz,
                    parentIdx: parentNodeIdx,
                });
            }

            const localMat = makeNjMat(effPx, effPy, effPz, effRx, effRy, effRz, effSx, effSy, effSz, (flags & 0x20) !== 0);
            const worldMat = matMul4(parentMat, localMat);
            const relMat = matMul4(parentRelMat, localMat);

            if (isBodyTree) {
                bodyWorldMats[nodeIdx] = worldMat;
                if (nodeIdx === 3) {
                    hipPivotY = worldMat[7] * scale;
                } else if (nodeIdx === 26) {
                    shoulderPivotX = Math.abs(worldMat[3]) * scale;
                    shoulderPivotY = worldMat[7] * scale;
                    shoulderPivotZ = worldMat[11] * scale;
                }
                if ((flags === 0x1d || nodeIdx === 58 || nodeIdx === 59) && worldMat[7] > 11.0) {
                    headAttachY = worldMat[7];
                }
            }

            let vlist = 0;
            let plist = 0;
            if (mOff > 0 && baseOffset + mOff + 16 <= targetBuf.byteLength) {
                vlist = view.getUint32(baseOffset + mOff, true);
                plist = view.getUint32(baseOffset + mOff + 4, true);
            }

            // Check if this node has BOTH its own vlist AND a geometry-drawing plist (e.g. Hand nodes 34 & 47).
            // In Sega Ninja, such leaf nodes temporarily use overlapping vpool slots (204..237) and must not clobber parent arm vertices!
            let savedVpool: Array<[number, number, number] | undefined> | null = null;
            let savedVrecipe: Array<number | undefined> | null = null;
            let savedVlimb: Array<"torso" | "lleg" | "rleg" | "larm" | "rarm" | undefined> | null = null;
            if (vlist > 0 && plist > 0 && baseOffset + plist + 4 <= targetBuf.byteLength) {
                let checkPo = baseOffset + plist;
                let hasStripChunk = false;
                for (let it = 0; it < 32 && checkPo + 2 <= targetBuf.byteLength; it++) {
                    const ct = view.getUint16(checkPo, true) & 0xff;
                    if (ct === 0xff) break;
                    if (ct >= 0x40 && ct <= 0x4f) {
                        hasStripChunk = true;
                        break;
                    }
                    if (ct === 0 || (ct >= 1 && ct <= 7)) checkPo += 2;
                    else if (ct === 8 || ct === 9) checkPo += 4;
                    else if (ct >= 16 && ct <= 31 && checkPo + 4 <= targetBuf.byteLength) {
                        checkPo += 4 + view.getUint16(checkPo + 2, true) * 2;
                    } else break;
                }
                if (hasStripChunk) {
                    savedVpool = vpool.map((v) => (v ? ([v[0], v[1], v[2]] as [number, number, number]) : undefined));
                    savedVrecipe = vpoolRecipeIdx.slice();
                    savedVlimb = vlimb.slice();
                }
            }

            if (vlist > 0 && baseOffset + vlist + 8 <= targetBuf.byteLength) {
                let vo = baseOffset + vlist;
                while (vo + 8 <= targetBuf.byteLength) {
                    const hdr = view.getUint16(vo, true);
                    const t = hdr & 0xff;
                    const vFlags = (hdr >>> 8) & 0xff;
                    if (t === 0xff || t === 0) break;
                    const szW = view.getUint16(vo + 2, true);
                    const baseIdx = view.getUint16(vo + 4, true);
                    const cnt = view.getUint16(vo + 6, true);
                    if (cnt === 0 || szW === 0) break;
                    const vStride = t === 0x2c ? 28 : Math.max(12, Math.floor(((szW - 1) * 4) / cnt));
                    let p = vo + 8;
                    for (let i = 0; i < cnt && p + 12 <= targetBuf.byteLength; i++) {
                        const vx = view.getFloat32(p, true);
                        const vy = view.getFloat32(p + 4, true);
                        const vz = view.getFloat32(p + 8, true);
                        const hasNorm = vStride >= 24 && p + 24 <= targetBuf.byteLength;
                        const nx = hasNorm ? view.getFloat32(p + 12, true) : 0;
                        const ny = hasNorm ? view.getFloat32(p + 16, true) : 1;
                        const nz = hasNorm ? view.getFloat32(p + 20, true) : 0;

                        const wx = (worldMat[0] * vx + worldMat[1] * vy + worldMat[2] * vz + worldMat[3]) * scale;
                        const wy = (worldMat[4] * vx + worldMat[5] * vy + worldMat[6] * vz + worldMat[7]) * scale;
                        const wz = (worldMat[8] * vx + worldMat[9] * vy + worldMat[10] * vz + worldMat[11]) * scale;

                        const rvx = attachBoneOverride !== undefined
                            ? relMat[0] * vx + relMat[1] * vy + relMat[2] * vz + relMat[3]
                            : vx;
                        const rvy = attachBoneOverride !== undefined
                            ? relMat[4] * vx + relMat[5] * vy + relMat[6] * vz + relMat[7]
                            : vy;
                        const rvz = attachBoneOverride !== undefined
                            ? relMat[8] * vx + relMat[9] * vy + relMat[10] * vz + relMat[11]
                            : vz;
                        const rnx = attachBoneOverride !== undefined
                            ? relMat[0] * nx + relMat[1] * ny + relMat[2] * nz
                            : nx;
                        const rny = attachBoneOverride !== undefined
                            ? relMat[4] * nx + relMat[5] * ny + relMat[6] * nz
                            : ny;
                        const rnz = attachBoneOverride !== undefined
                            ? relMat[8] * nx + relMat[9] * ny + relMat[10] * nz
                            : nz;
                        const targetBone = attachBoneOverride !== undefined ? attachBoneOverride : nodeIdx;

                        if (t === 0x2c && p + 28 <= targetBuf.byteLength) {
                            // NJD_CV_VN_NF (`0x2c`): Smooth-skinned weighted joint vertex (`u1 = targetOffset`, `u2 = weight255`)
                            const u1 = view.getUint16(p + 24, true);
                            const u2 = view.getUint16(p + 26, true);
                            const dstIdx = baseIdx + u1;
                            const weight = u2 / 255.0;
                            const existing = vpool[dstIdx];
                            const existingRec = vpoolRecipeIdx[dstIdx];
                            if (vFlags === 0x80 || !existing || existingRec === undefined) {
                                vpool[dstIdx] = [wx * weight, wy * weight, wz * weight];
                                vlimb[dstIdx] = branch;
                                const rIdx = skelRecipes.length;
                                skelRecipes.push({
                                    weights: [{ bone: targetBone, w: weight, vx: rvx, vy: rvy, vz: rvz, nx: rnx, ny: rny, nz: rnz }],
                                });
                                vpoolRecipeIdx[dstIdx] = rIdx;
                            } else {
                                existing[0] += wx * weight;
                                existing[1] += wy * weight;
                                existing[2] += wz * weight;
                                if (branch !== "torso") vlimb[dstIdx] = branch;
                                skelRecipes[existingRec].weights.push({
                                    bone: targetBone,
                                    w: weight,
                                    vx: rvx,
                                    vy: rvy,
                                    vz: rvz,
                                    nx: rnx,
                                    ny: rny,
                                    nz: rnz,
                                });
                            }
                        } else {
                            const dstIdx = baseIdx + i;
                            vpool[dstIdx] = [wx, wy, wz];
                            vlimb[dstIdx] = branch;
                            const rIdx = skelRecipes.length;
                            skelRecipes.push({
                                weights: [{ bone: targetBone, w: 1.0, vx: rvx, vy: rvy, vz: rvz, nx: rnx, ny: rny, nz: rnz }],
                            });
                            vpoolRecipeIdx[dstIdx] = rIdx;
                        }
                        totalVerts++;
                        p += vStride;
                    }
                    vo += 4 + szW * 4;
                }
            }

            if (childOff > 0) {
                walk(childOff, worldMat, relMat, nodeIdx, branch);
            }

            if (plist > 0 && baseOffset + plist + 4 <= targetBuf.byteLength) {
                let po = baseOffset + plist;
                let matTint: [number, number, number] = atlas ? [1, 1, 1] : partTint;
                let activeTexId = texOffset;
                for (let iter = 0; iter < 256 && po + 2 <= targetBuf.byteLength; iter++) {
                    const hdr = view.getUint16(po, true);
                    const t = hdr & 0xff;
                    if (t === 0xff) break;
                    if (t === 0 || (t >= 1 && t <= 7)) {
                        po += 2;
                        continue;
                    }
                    if (t === 8 || t === 9) {
                        const rawTid = view.getUint16(po + 2, true) & 0x1fff;
                        activeTexId = texOffset + rawTid;
                        if (!atlas) {
                            const palette: Array<[number, number, number]> = [
                                partTint,
                                [partTint[0] * 0.85, partTint[1] * 0.9, partTint[2] * 0.98],
                                [0.24, 0.3, 0.38],
                                [0.92, 0.85, 0.76],
                                [0.32, 0.92, 0.88],
                            ];
                            matTint = palette[rawTid % palette.length] ?? partTint;
                        }
                        po += 4;
                        continue;
                    }
                    if (po + 4 > targetBuf.byteLength) break;
                    const szW = view.getUint16(po + 2, true);
                    if (t >= 0x10 && t <= 0x1f) {
                        po += 4 + szW * 2;
                        continue;
                    }
                    if (t >= 0x40 && t <= 0x4f) {
                        let so = po + 4;
                        const stripEnd = Math.min(targetBuf.byteLength, po + 4 + szW * 2);
                        if (so + 2 <= stripEnd) {
                            const stripCount = view.getUint16(so, true) & 0x3fff;
                            so += 2;
                            const perVertWords = t === 0x40 ? 1 : 3;
                            for (let st = 0; st < stripCount && so + 2 <= stripEnd; st++) {
                                const rawLen = view.getInt16(so, true);
                                const len = Math.abs(rawLen);
                                so += 2;
                                const stripPts: Array<[number, number, number] | undefined> = [];
                                const stripIdxs: number[] = [];
                                const stripRecs: Array<number | undefined> = [];
                                const stripUvs: Array<[number, number]> = [];
                                for (let k = 0; k < len && so + 2 <= stripEnd; k++) {
                                    const idx = view.getUint16(so, true);
                                    stripPts.push(vpool[idx]);
                                    stripIdxs.push(idx);
                                    stripRecs.push(vpoolRecipeIdx[idx]);
                                    if (t !== 0x40 && so + 6 <= stripEnd) {
                                        const uRaw = view.getInt16(so + 2, true) / 256.0;
                                        const vRaw = view.getInt16(so + 4, true) / 256.0;
                                        stripUvs.push(mapUvToAtlas(uRaw, vRaw, activeTexId, atlas));
                                    } else {
                                        stripUvs.push([-1, -1]);
                                    }
                                    so += perVertWords * 2;
                                }
                                for (let k = 0; k + 2 < stripPts.length; k++) {
                                    const p0 = stripPts[k];
                                    const p1 = stripPts[k + 1];
                                    const p2 = stripPts[k + 2];
                                    if (!p0 || !p1 || !p2) continue;
                                    const uv0 = stripUvs[k];
                                    const uv1 = stripUvs[k + 1];
                                    const uv2 = stripUvs[k + 2];
                                    const odd = (k & 1) === 1;
                                    const a = odd ? (rawLen < 0 ? p0 : p1) : rawLen < 0 ? p1 : p0;
                                    const b = odd ? (rawLen < 0 ? p1 : p0) : rawLen < 0 ? p0 : p1;
                                    const uva = odd ? (rawLen < 0 ? uv0 : uv1) : rawLen < 0 ? uv1 : uv0;
                                    const uvb = odd ? (rawLen < 0 ? uv1 : uv0) : rawLen < 0 ? uv0 : uv1;
                                    const r0 = stripRecs[k] ?? 0;
                                    const r1 = stripRecs[k + 1] ?? 0;
                                    const r2 = stripRecs[k + 2] ?? 0;
                                    const ra = odd ? (rawLen < 0 ? r0 : r1) : rawLen < 0 ? r1 : r0;
                                    const rb = odd ? (rawLen < 0 ? r1 : r0) : rawLen < 0 ? r0 : r1;
                                    builder.addTri(a, b, p2, matTint, uva, uvb, uv2);
                                    triVertRecipeList.push(ra, rb, r2);
                                    totalTris++;

                                    if (isBodyTree) {
                                        const limb0 = vlimb[stripIdxs[k]];
                                        const limb1 = vlimb[stripIdxs[k + 1]];
                                        const limb2 = vlimb[stripIdxs[k + 2]];
                                        const triBranch =
                                            branch !== "torso"
                                                ? branch
                                                : limb0 === "lleg" || limb1 === "lleg" || limb2 === "lleg"
                                                  ? "lleg"
                                                  : limb0 === "rleg" || limb1 === "rleg" || limb2 === "rleg"
                                                    ? "rleg"
                                                    : "torso";
                                        if (triBranch === "larm") {
                                            leftArmBuilder.addTri(
                                                [a[0] - shoulderPivotX, a[1] - shoulderPivotY, a[2] - shoulderPivotZ],
                                                [b[0] - shoulderPivotX, b[1] - shoulderPivotY, b[2] - shoulderPivotZ],
                                                [p2[0] - shoulderPivotX, p2[1] - shoulderPivotY, p2[2] - shoulderPivotZ],
                                                matTint,
                                                uva,
                                                uvb,
                                                uv2,
                                            );
                                        } else if (triBranch === "rarm") {
                                            rightArmBuilder.addTri(
                                                [a[0] + shoulderPivotX, a[1] - shoulderPivotY, a[2] - shoulderPivotZ],
                                                [b[0] + shoulderPivotX, b[1] - shoulderPivotY, b[2] - shoulderPivotZ],
                                                [p2[0] + shoulderPivotX, p2[1] - shoulderPivotY, p2[2] - shoulderPivotZ],
                                                matTint,
                                                uva,
                                                uvb,
                                                uv2,
                                            );
                                        } else if (triBranch === "lleg") {
                                            leftLegBuilder.addTri(
                                                [a[0], a[1] - hipPivotY, a[2]],
                                                [b[0], b[1] - hipPivotY, b[2]],
                                                [p2[0], p2[1] - hipPivotY, p2[2]],
                                                matTint,
                                                uva,
                                                uvb,
                                                uv2,
                                            );
                                        } else if (triBranch === "rleg") {
                                            rightLegBuilder.addTri(
                                                [a[0], a[1] - hipPivotY, a[2]],
                                                [b[0], b[1] - hipPivotY, b[2]],
                                                [p2[0], p2[1] - hipPivotY, p2[2]],
                                                matTint,
                                                uva,
                                                uvb,
                                                uv2,
                                            );
                                        } else {
                                            torsoHeadBuilder.addTri(a, b, p2, matTint, uva, uvb, uv2);
                                        }
                                    } else {
                                        torsoHeadBuilder.addTri(a, b, p2, matTint, uva, uvb, uv2);
                                    }
                                }
                            }
                        }
                    }
                    po += 4 + szW * 2;
                }
            }

            if (savedVpool && savedVlimb && savedVrecipe) {
                for (let i = 0; i < 4096; i++) {
                    vpool[i] = savedVpool[i];
                    vpoolRecipeIdx[i] = savedVrecipe[i];
                    vlimb[i] = savedVlimb[i];
                }
            }

            if (sibOff > 0) {
                walk(sibOff, parentMat, parentRelMat, parentNodeIdx, activeBranch);
            }
        };

        walk(0, rootMat, ident4, -1, "torso");
    };

    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    decodeChunkTree(buf, identity, baseTint, 0, true);

    // Attach head & hair at the exact `node[58]` / `node[59]` neck sockets so they animate with the 64-bone skeleton!
    const fallbackHeadMat = new Float32Array([1, 0, 0, 0, 0, 1, 0, headAttachY, 0, 0, 1, 0, 0, 0, 0, 1]);
    const headSocketMat = bodyWorldMats[58] ?? bodyWorldMats[56] ?? fallbackHeadMat;
    const hairSocketMat = bodyWorldMats[59] ?? bodyWorldMats[58] ?? fallbackHeadMat;
    const headSocketIdx = bodyWorldMats[58] ? 58 : bodyWorldMats[56] ? 56 : undefined;
    const hairSocketIdx = bodyWorldMats[59] ? 59 : headSocketIdx;
    if (extraHeadBuf) {
        decodeChunkTree(extraHeadBuf, headSocketMat, [0.95, 0.82, 0.72], 5, false, headSocketIdx);
    }
    if (extraHairBuf) {
        decodeChunkTree(extraHairBuf, hairSocketMat, [0.92, 0.76, 0.28], 7, false, hairSocketIdx);
    }

    const atlasData = atlas ? { pixels: atlas.pixels, width: atlas.width, height: atlas.height } : null;
    const geom = builder.toGeometry(
        labelName,
        "NJ (Sega Ninja)",
        `NJCM Skeletal Mesh // ${totalVerts} verts, ${totalTris} triangles`,
        atlasData,
    );
    if (skelNodes.length >= 60 && skelRecipes.length > 0 && triVertRecipeList.length === geom.vertexCount) {
        const m35 = bodyWorldMats[35];
        geom.skeleton = {
            nodes: skelNodes,
            recipes: skelRecipes,
            triVertRecipes: new Uint16Array(triVertRecipeList),
            scale,
            rightHandPos: m35 ? [m35[3] * scale, m35[7] * scale, m35[11] * scale] : undefined,
        };
    }
    if (leftLegBuilder.pos.length > 0 && rightLegBuilder.pos.length > 0) {
        geom.articulatedParts = {
            torsoHead: torsoHeadBuilder.toGeometry(`${labelName} Torso+Head`, "NJ (Sega Ninja)", "Torso+Head", atlasData),
            leftLeg: leftLegBuilder.toGeometry(`${labelName} LeftLeg`, "NJ (Sega Ninja)", "LeftLeg", atlasData),
            rightLeg: rightLegBuilder.toGeometry(`${labelName} RightLeg`, "NJ (Sega Ninja)", "RightLeg", atlasData),
            leftArm: leftArmBuilder.toGeometry(`${labelName} LeftArm`, "NJ (Sega Ninja)", "LeftArm", atlasData),
            rightArm: rightArmBuilder.toGeometry(`${labelName} RightArm`, "NJ (Sega Ninja)", "RightArm", atlasData),
            hipY: hipPivotY,
            shoulderX: shoulderPivotX,
            shoulderY: shoulderPivotY,
            shoulderZ: shoulderPivotZ,
        };
    }
    return geom;
}

/**
 * Evaluates a 64-node Sega Ninja `NMDM` (`.njm`) skeletal animation at `frame` with linear keyframe interpolation
 * and updates `geom.positions`, `geom.normals`, and `geom.skeleton.rightHandPos` in-place.
 */
function applySegaNinjaMotion(
    geom: CustomMeshGeometry,
    njmBuf: ArrayBuffer,
    frame: number,
    motionKey: string,
): void {
    const skel = geom.skeleton;
    if (!skel || skel.nodes.length < 60 || njmBuf.byteLength < 32) return;

    const qFrame = Math.floor(frame * 4) * 0.25;
    const cacheKey = `${motionKey}:${qFrame.toFixed(2)}`;
    if (skel.lastMotionKey === cacheKey) return;
    skel.lastMotionKey = cacheKey;

    const view = new DataView(njmBuf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const base = magic === "NMDM" ? 8 : 0;
    if (base + 16 > njmBuf.byteLength) return;

    const mdataOff = base + view.getUint32(base, true);
    const nbFrame = Math.max(1, view.getUint32(base + 4, true));
    const f = ((frame % nbFrame) + nbFrame) % nbFrame;
    const nodeCount = Math.min(skel.nodes.length, 64);
    if (mdataOff + nodeCount * 16 > njmBuf.byteLength) return;

    const worldMats: Float32Array[] = new Array(skel.nodes.length);
    const kBams = (2 * Math.PI) / 65536.0;

    for (let i = 0; i < skel.nodes.length; i++) {
        const nd = skel.nodes[i];
        let px = nd.px;
        let py = nd.py;
        let pz = nd.pz;
        let rx = nd.rx;
        let ry = nd.ry;
        let rz = nd.rz;

        if (i < nodeCount) {
            const md = mdataOff + i * 16;
            const pPos = view.getUint32(md, true);
            const pAng = view.getUint32(md + 4, true);
            const nPos = view.getUint32(md + 8, true);
            const nAng = view.getUint32(md + 12, true);

            if (pPos > 0 && nPos > 0 && base + pPos + nPos * 16 <= njmBuf.byteLength) {
                let k0 = 0;
                for (let j = 0; j < nPos; j++) {
                    if (view.getUint32(base + pPos + j * 16, true) <= f) k0 = j;
                    else break;
                }
                const k1 = (k0 + 1) % nPos;
                const o0 = base + pPos + k0 * 16;
                const o1 = base + pPos + k1 * 16;
                const f0 = view.getUint32(o0, true);
                const f1 = view.getUint32(o1, true);
                const span = k1 > k0 ? f1 - f0 : nbFrame - f0 + f1;
                const t = span > 0 ? Math.min(1, Math.max(0, (f - f0) / span)) : 0;
                px = view.getFloat32(o0 + 4, true) * (1 - t) + view.getFloat32(o1 + 4, true) * t;
                py = view.getFloat32(o0 + 8, true) * (1 - t) + view.getFloat32(o1 + 8, true) * t;
                pz = view.getFloat32(o0 + 12, true) * (1 - t) + view.getFloat32(o1 + 12, true) * t;
            }

            if (pAng > 0 && nAng > 0 && base + pAng + nAng * 16 <= njmBuf.byteLength) {
                let k0 = 0;
                for (let j = 0; j < nAng; j++) {
                    if (view.getUint32(base + pAng + j * 16, true) <= f) k0 = j;
                    else break;
                }
                const k1 = (k0 + 1) % nAng;
                const o0 = base + pAng + k0 * 16;
                const o1 = base + pAng + k1 * 16;
                const f0 = view.getUint32(o0, true);
                const f1 = view.getUint32(o1, true);
                const span = k1 > k0 ? f1 - f0 : nbFrame - f0 + f1;
                const t = span > 0 ? Math.min(1, Math.max(0, (f - f0) / span)) : 0;
                const lerpAng = (a0: number, a1: number): number => {
                    let diff = ((a1 - a0) & 0xffff);
                    if (diff > 0x8000) diff -= 0x10000;
                    return a0 + diff * t;
                };
                rx = lerpAng(view.getInt32(o0 + 4, true), view.getInt32(o1 + 4, true));
                ry = lerpAng(view.getInt32(o0 + 8, true), view.getInt32(o1 + 8, true));
                rz = lerpAng(view.getInt32(o0 + 12, true), view.getInt32(o1 + 12, true));
            }
        }

        if (i === 0) {
            px = 0;
            pz = 0;
            if (py < -3.0) py = 0;
        }

        const ax = rx * kBams;
        const ay = ry * kBams;
        const az = rz * kBams;
        const cx = Math.cos(ax);
        const sx_ = Math.sin(ax);
        const cy = Math.cos(ay);
        const sy_ = Math.sin(ay);
        const cz = Math.cos(az);
        const sz_ = Math.sin(az);
        const sx = nd.sx;
        const sy = nd.sy;
        const sz = nd.sz;

        const lm =
            (nd.flags & 0x20) !== 0
                ? new Float32Array([
                      (cy * cz + sy_ * sx_ * sz_) * sx,
                      (-cy * sz_ + sy_ * sx_ * cz) * sy,
                      sy_ * cx * sz,
                      px,
                      cx * sz_ * sx,
                      cx * cz * sy,
                      -sx_ * sz,
                      py,
                      (-sy_ * cz + cy * sx_ * sz_) * sx,
                      (sy_ * sz_ + cy * sx_ * cz) * sy,
                      cy * cx * sz,
                      pz,
                      0,
                      0,
                      0,
                      1,
                  ])
                : new Float32Array([
                      cy * cz * sx,
                      (cz * sx_ * sy_ - cx * sz_) * sy,
                      (cx * cz * sy_ + sx_ * sz_) * sz,
                      px,
                      cy * sz_ * sx,
                      (cx * cz + sx_ * sy_ * sz_) * sy,
                      (-cz * sx_ + cx * sy_ * sz_) * sz,
                      py,
                      -sy_ * sx,
                      cy * sx_ * sy,
                      cx * cy * sz,
                      pz,
                      0,
                      0,
                      0,
                      1,
                  ]);

        if (nd.parentIdx >= 0 && worldMats[nd.parentIdx]) {
            const A = worldMats[nd.parentIdx];
            const R = new Float32Array(16);
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    R[r * 4 + c] =
                        A[r * 4 + 0] * lm[0 * 4 + c] +
                        A[r * 4 + 1] * lm[1 * 4 + c] +
                        A[r * 4 + 2] * lm[2 * 4 + c] +
                        A[r * 4 + 3] * lm[3 * 4 + c];
                }
            }
            worldMats[i] = R;
        } else {
            worldMats[i] = lm;
        }
    }

    const sc = skel.scale;
    const m35 = worldMats[35];
    if (m35) {
        skel.rightHandPos = [m35[3] * sc, m35[7] * sc, m35[11] * sc];
    }

    const rCount = skel.recipes.length;
    const rPosX = new Float32Array(rCount);
    const rPosY = new Float32Array(rCount);
    const rPosZ = new Float32Array(rCount);
    const rNormX = new Float32Array(rCount);
    const rNormY = new Float32Array(rCount);
    const rNormZ = new Float32Array(rCount);

    for (let i = 0; i < rCount; i++) {
        const weights = skel.recipes[i].weights;
        let wx = 0;
        let wy = 0;
        let wz = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let j = 0; j < weights.length; j++) {
            const bw = weights[j];
            const m = worldMats[bw.bone];
            if (!m) continue;
            wx += (m[0] * bw.vx + m[1] * bw.vy + m[2] * bw.vz + m[3]) * sc * bw.w;
            wy += (m[4] * bw.vx + m[5] * bw.vy + m[6] * bw.vz + m[7]) * sc * bw.w;
            wz += (m[8] * bw.vx + m[9] * bw.vy + m[10] * bw.vz + m[11]) * sc * bw.w;
            nx += (m[0] * bw.nx + m[1] * bw.ny + m[2] * bw.nz) * bw.w;
            ny += (m[4] * bw.nx + m[5] * bw.ny + m[6] * bw.nz) * bw.w;
            nz += (m[8] * bw.nx + m[9] * bw.ny + m[10] * bw.nz) * bw.w;
        }
        rPosX[i] = wx;
        rPosY[i] = wy;
        rPosZ[i] = wz;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        rNormX[i] = nx / nLen;
        rNormY[i] = ny / nLen;
        rNormZ[i] = nz / nLen;
    }

    const posArr = geom.positions;
    const normArr = geom.normals;
    const triMap = skel.triVertRecipes;
    const vCnt = Math.min(geom.vertexCount, triMap.length);
    for (let v = 0; v < vCnt; v++) {
        const ri = triMap[v];
        const o = v * 3;
        posArr[o] = rPosX[ri];
        posArr[o + 1] = rPosY[ri];
        posArr[o + 2] = rPosZ[ri];
        normArr[o] = rNormX[ri];
        normArr[o + 1] = rNormY[ri];
        normArr[o + 2] = rNormZ[ri];
    }
}

/**
 * Parses a standalone PSOBB `.xj` model file (e.g. `obj_warp_big.xj`, `obj_shopdoor.xj`, `obj_elv_alcove.xj`)
 * where offsets inside the `NJCM` chunk are relative to `base = 8`.
 */
function parsePsoStandaloneXjBuffer(
    xjBuf: ArrayBuffer,
    labelName: string,
    scale = 0.08,
    xvmBuf?: ArrayBuffer | null,
): CustomMeshGeometry {
    const builder = new MeshBuilder();
    const atlas = parsePsoXvmAtlas(xvmBuf, 128, 16);
    if (xjBuf.byteLength < 60) {
        return builder.toGeometry(labelName, "NJ (Sega Ninja)", "Empty XJ", null);
    }
    const view = new DataView(xjBuf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const base = magic === "NJCM" || magic === "GJCM" ? 8 : 0;
    const visited = new Set<number>();
    let totalTris = 0;

    const walk = (relOff: number, ox: number, oy: number, oz: number, cosY: number, sinY: number): void => {
        if (relOff < 0 || base + relOff + 52 > xjBuf.byteLength || visited.has(relOff)) return;
        visited.add(relOff);
        const off = base + relOff;
        const mOff = view.getUint32(off + 4, true);
        const lx = view.getFloat32(off + 8, true);
        const ly = view.getFloat32(off + 12, true);
        const lz = view.getFloat32(off + 16, true);
        const ry = view.getInt32(off + 24, true);
        const nodeAngle = (ry * 2 * Math.PI) / 65536;
        const nCos = Math.cos(nodeAngle);
        const nSin = Math.sin(nodeAngle);

        const px = ox + (lx * cosY + lz * sinY);
        const py = oy + ly;
        const pz = oz + (-lx * sinY + lz * cosY);
        const totalCos = cosY * nCos - sinY * nSin;
        const totalSin = sinY * nCos + cosY * nSin;

        if (mOff > 0 && base + mOff + 28 <= xjBuf.byteLength) {
            const vInfoOff = view.getUint32(base + mOff + 4, true);
            const sInfoA = view.getUint32(base + mOff + 12, true);
            const sCntA = view.getUint32(base + mOff + 16, true);
            const sInfoB = view.getUint32(base + mOff + 20, true);
            const sCntB = view.getUint32(base + mOff + 24, true);

            if (vInfoOff > 0 && base + vInfoOff + 16 <= xjBuf.byteLength) {
                const vBufOff = view.getUint32(base + vInfoOff + 4, true);
                const vStride = view.getUint32(base + vInfoOff + 8, true);
                const vCnt = view.getUint32(base + vInfoOff + 12, true);
                if (
                    vBufOff > 0 &&
                    (vStride === 16 || vStride === 24 || vStride === 28 || vStride === 32 || vStride === 36) &&
                    vCnt > 0 &&
                    vCnt < 16384 &&
                    base + vBufOff + vCnt * vStride <= xjBuf.byteLength
                ) {
                    const pts: Array<[number, number, number]> = new Array(vCnt);
                    const cols: Array<[number, number, number]> = new Array(vCnt);
                    const rawUvs: Array<[number, number] | null> = new Array(vCnt);
                    const hasCol = vStride !== 32;
                    const colOffset = vStride === 16 || vStride === 24 ? 12 : 24;
                    const hasUv = vStride === 24 || vStride === 32 || vStride === 36;
                    const uvOffset = vStride === 24 ? 16 : vStride === 32 ? 24 : 28;

                    for (let i = 0; i < vCnt; i++) {
                        const vo = base + vBufOff + i * vStride;
                        const vx = view.getFloat32(vo, true);
                        const vy = view.getFloat32(vo + 4, true);
                        const vz = view.getFloat32(vo + 8, true);
                        pts[i] = [
                            (px + (vx * totalCos + vz * totalSin)) * scale,
                            (py + vy) * scale,
                            (pz + (-vx * totalSin + vz * totalCos)) * scale,
                        ];
                        if (hasCol) {
                            const bCol = view.getUint8(vo + colOffset);
                            const gCol = view.getUint8(vo + colOffset + 1);
                            const rCol = view.getUint8(vo + colOffset + 2);
                            cols[i] = [
                                Math.max(0.35, (rCol / 255) * 0.9 + 0.15),
                                Math.max(0.35, (gCol / 255) * 0.9 + 0.15),
                                Math.max(0.35, (bCol / 255) * 0.9 + 0.15),
                            ];
                        } else {
                            cols[i] = [0.92, 0.96, 1.0];
                        }
                        if (hasUv && vo + uvOffset + 8 <= xjBuf.byteLength) {
                            const u = view.getFloat32(vo + uvOffset, true);
                            const v = view.getFloat32(vo + uvOffset + 4, true);
                            rawUvs[i] = Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
                        } else {
                            rawUvs[i] = null;
                        }
                    }

                    for (const [sOff, sCnt] of [
                        [sInfoA, sCntA],
                        [sInfoB, sCntB],
                    ] as const) {
                        if (!sOff || !sCnt || sCnt > 256) continue;
                        for (let s = 0; s < sCnt; s++) {
                            const so = base + sOff + s * 20;
                            if (so + 20 > xjBuf.byteLength) break;
                            const mPtr = view.getUint32(so, true);
                            const mCnt = view.getUint32(so + 4, true);
                            const iOff = view.getUint32(so + 8, true);
                            const iCnt = view.getUint32(so + 12, true);
                            if (!iOff || iCnt < 3 || iCnt > 32768 || base + iOff + iCnt * 2 > xjBuf.byteLength) continue;
                            let stripTexIdx = 0;
                            if (mPtr > 0 && mCnt > 0 && mCnt <= 16 && base + mPtr + mCnt * 16 <= xjBuf.byteLength) {
                                for (let m = 0; m < mCnt; m++) {
                                    const cmd = view.getUint32(base + mPtr + m * 16, true);
                                    if (cmd === 3) {
                                        stripTexIdx = view.getUint32(base + mPtr + m * 16 + 4, true);
                                    }
                                }
                            }
                            for (let i = 0; i + 2 < iCnt; i++) {
                                const idx0 = view.getUint16(base + iOff + i * 2, true);
                                const idx1 = view.getUint16(base + iOff + (i + 1) * 2, true);
                                const idx2 = view.getUint16(base + iOff + (i + 2) * 2, true);
                                if (idx0 === idx1 || idx1 === idx2 || idx0 === idx2) continue;
                                if (idx0 >= vCnt || idx1 >= vCnt || idx2 >= vCnt) continue;
                                const p0 = pts[idx0];
                                const p1 = (i & 1) === 1 ? pts[idx2] : pts[idx1];
                                const p2 = (i & 1) === 1 ? pts[idx1] : pts[idx2];
                                const c0 = cols[idx0];
                                const uv0Raw = rawUvs[idx0];
                                const uv1Raw = (i & 1) === 1 ? rawUvs[idx2] : rawUvs[idx1];
                                const uv2Raw = (i & 1) === 1 ? rawUvs[idx1] : rawUvs[idx2];
                                const uv0 = uv0Raw ? mapUvToAtlas(uv0Raw[0], uv0Raw[1], stripTexIdx, atlas) : undefined;
                                const uv1 = uv1Raw ? mapUvToAtlas(uv1Raw[0], uv1Raw[1], stripTexIdx, atlas) : undefined;
                                const uv2 = uv2Raw ? mapUvToAtlas(uv2Raw[0], uv2Raw[1], stripTexIdx, atlas) : undefined;
                                builder.addTri(p0, p1, p2, c0, uv0, uv1, uv2);
                                totalTris++;
                            }
                        }
                    }
                }
            }
        }

        const childOff = view.getUint32(off + 44, true);
        const sibOff = view.getUint32(off + 48, true);
        if (childOff > 0) walk(childOff, px, py, pz, totalCos, totalSin);
        if (sibOff > 0) walk(sibOff, ox, oy, oz, cosY, sinY);
    };

    walk(0, 0, 0, 0, 1, 0);
    const atlasData = atlas ? { pixels: atlas.pixels, width: atlas.width, height: atlas.height } : null;
    return builder.toGeometry(labelName, "NJ (Sega Ninja)", `XJ Object // ${totalTris} tris`, atlasData);
}

export interface PsoCollisionTriangle {
    v0: [number, number, number];
    v1: [number, number, number];
    v2: [number, number, number];
    ny: number;
    flags: number;
}

/**
 * Parses an authentic Phantasy Star Online Blue Burst Scene `.rel` (`n.rel` XJ visual geometry + `c.rel` collision mesh).
 */
function parsePsoSceneRelBuffers(
    visualBuf: ArrayBuffer | null,
    collisionBuf: ArrayBuffer | null,
    stageName: string,
    scale = 0.08,
    xvmBuf?: ArrayBuffer | null,
): { geometry: CustomMeshGeometry; collisionTris: PsoCollisionTriangle[] } {
    const builder = new MeshBuilder();
    const atlas = parsePsoXvmAtlas(xvmBuf, 128, 16);
    const collisionTris: PsoCollisionTriangle[] = [];
    let visualTris = 0;

    // 1. Parse `n.rel` (`fmt2`) visual stage sections & XJ triangle strips
    if (visualBuf && visualBuf.byteLength > 64) {
        const view = new DataView(visualBuf);
        const rootOff = view.getUint32(visualBuf.byteLength - 16, true);
        if (rootOff > 0 && rootOff + 24 <= visualBuf.byteLength) {
            const secCount = view.getUint32(rootOff + 8, true);
            const secTblOff = view.getUint32(rootOff + 16, true);
            const visitedNj = new Set<number>();

            const walkXjNode = (
                njOff: number,
                ox: number,
                oy: number,
                oz: number,
                cosY: number,
                sinY: number,
            ): void => {
                if (!njOff || njOff + 52 > visualBuf.byteLength || visitedNj.has(njOff)) return;
                visitedNj.add(njOff);
                const lx = view.getFloat32(njOff + 8, true);
                const ly = view.getFloat32(njOff + 12, true);
                const lz = view.getFloat32(njOff + 16, true);
                const ry = view.getInt32(njOff + 24, true);
                const nodeAngle = (ry * 2 * Math.PI) / 65536;
                const nCos = Math.cos(nodeAngle);
                const nSin = Math.sin(nodeAngle);

                const px = ox + (lx * cosY + lz * sinY);
                const py = oy + ly;
                const pz = oz + (-lx * sinY + lz * cosY);
                const totalCos = cosY * nCos - sinY * nSin;
                const totalSin = sinY * nCos + cosY * nSin;

                const mOff = view.getUint32(njOff + 4, true);
                if (mOff > 0 && mOff + 28 <= visualBuf.byteLength) {
                    const vInfoOff = view.getUint32(mOff + 4, true);
                    const sInfoA = view.getUint32(mOff + 12, true);
                    const sCntA = view.getUint32(mOff + 16, true);
                    const sInfoB = view.getUint32(mOff + 20, true);
                    const sCntB = view.getUint32(mOff + 24, true);

                    if (vInfoOff > 0 && vInfoOff + 16 <= visualBuf.byteLength) {
                        const vBufOff = view.getUint32(vInfoOff + 4, true);
                        const vStride = view.getUint32(vInfoOff + 8, true);
                        const vCnt = view.getUint32(vInfoOff + 12, true);

                        if (
                            vBufOff > 0 &&
                            (vStride === 16 || vStride === 24 || vStride === 28 || vStride === 36) &&
                            vCnt > 0 &&
                            vCnt < 16384 &&
                            vBufOff + vCnt * vStride <= visualBuf.byteLength
                        ) {
                            const pts: Array<[number, number, number]> = new Array(vCnt);
                            const cols: Array<[number, number, number]> = new Array(vCnt);
                            const rawUvs: Array<[number, number] | null> = new Array(vCnt);
                            const colOffset = vStride === 16 || vStride === 24 ? 12 : 24;
                            const hasUv = vStride === 24 || vStride === 36;
                            const uvOffset = vStride === 24 ? 16 : 28;

                            for (let i = 0; i < vCnt; i++) {
                                const vo = vBufOff + i * vStride;
                                const vx = view.getFloat32(vo, true);
                                const vy = view.getFloat32(vo + 4, true);
                                const vz = view.getFloat32(vo + 8, true);
                                const wx = (px + (vx * totalCos + vz * totalSin)) * scale;
                                const wy = (py + vy) * scale;
                                const wz = (pz + (-vx * totalSin + vz * totalCos)) * scale;
                                pts[i] = [wx, wy, wz];

                                const bCol = view.getUint8(vo + colOffset);
                                const gCol = view.getUint8(vo + colOffset + 1);
                                const rCol = view.getUint8(vo + colOffset + 2);
                                if (atlas) {
                                    // Authentic vertex lighting modulating the decoded XVM stage texture
                                    cols[i] = [
                                        Math.max(0.28, (rCol / 255) * 0.92 + 0.14),
                                        Math.max(0.28, (gCol / 255) * 0.92 + 0.14),
                                        Math.max(0.28, (bCol / 255) * 0.92 + 0.14),
                                    ];
                                } else {
                                    cols[i] = [
                                        Math.max(0.14, (rCol / 255) * 0.72 + 0.12),
                                        Math.max(0.24, (gCol / 255) * 0.85 + 0.16),
                                        Math.max(0.28, (bCol / 255) * 0.92 + 0.2),
                                    ];
                                }

                                if (hasUv && vo + uvOffset + 8 <= visualBuf.byteLength) {
                                    const u = view.getFloat32(vo + uvOffset, true);
                                    const v = view.getFloat32(vo + uvOffset + 4, true);
                                    rawUvs[i] = Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
                                } else {
                                    rawUvs[i] = null;
                                }
                            }

                            for (const [sOff, sCnt] of [
                                [sInfoA, sCntA],
                                [sInfoB, sCntB],
                            ] as const) {
                                if (!sOff || !sCnt || sCnt > 256) continue;
                                for (let s = 0; s < sCnt; s++) {
                                    const so = sOff + s * 20;
                                    if (so + 20 > visualBuf.byteLength) break;
                                    const mPtr = view.getUint32(so, true);
                                    const mCnt = view.getUint32(so + 4, true);
                                    const iOff = view.getUint32(so + 8, true);
                                    const iCnt = view.getUint32(so + 12, true);
                                    if (!iOff || iCnt < 3 || iCnt > 32768 || iOff + iCnt * 2 > visualBuf.byteLength) {
                                        continue;
                                    }

                                    // Extract active XVM texture index from the XJ strip material table (`cmd === 3`)
                                    let stripTexIdx = 0;
                                    if (mPtr > 0 && mCnt > 0 && mCnt <= 16 && mPtr + mCnt * 16 <= visualBuf.byteLength) {
                                        for (let m = 0; m < mCnt; m++) {
                                            const cmd = view.getUint32(mPtr + m * 16, true);
                                            if (cmd === 3) {
                                                stripTexIdx = view.getUint32(mPtr + m * 16 + 4, true);
                                                break;
                                            }
                                        }
                                    }

                                    for (let k = 0; k + 2 < iCnt; k++) {
                                        const i0 = view.getUint16(iOff + k * 2, true);
                                        const i1 = view.getUint16(iOff + (k + 1) * 2, true);
                                        const i2 = view.getUint16(iOff + (k + 2) * 2, true);
                                        if (i0 === i1 || i1 === i2 || i0 === i2 || i0 >= vCnt || i1 >= vCnt || i2 >= vCnt) {
                                            continue;
                                        }
                                        const p0 = pts[i0];
                                        const p1 = pts[i1];
                                        const p2 = pts[i2];
                                        // Filter far-off skybox spheres (> 55 units from section origin after scale) so camera stays crisp while preserving distant rooms like the Principal's Office (Sec 41 at Z=-150)!
                                        if (
                                            Math.abs(p0[0] - ox * scale) > 55 ||
                                            Math.abs(p0[2] - oz * scale) > 55 ||
                                            Math.abs(p0[1] - oy * scale) > 28
                                        ) {
                                            continue;
                                        }
                                        const odd = (k & 1) === 1;
                                        const a = odd ? p1 : p0;
                                        const b = odd ? p0 : p1;
                                        const ca = odd ? cols[i1] : cols[i0];
                                        const cb = odd ? cols[i0] : cols[i1];
                                        const cc = cols[i2];

                                        const ruv0 = rawUvs[i0];
                                        const ruv1 = rawUvs[i1];
                                        const ruv2 = rawUvs[i2];
                                        if (atlas && ruv0 && ruv1 && ruv2) {
                                            const uv0 = mapUvToAtlas(ruv0[0], ruv0[1], stripTexIdx, atlas);
                                            const uv1 = mapUvToAtlas(ruv1[0], ruv1[1], stripTexIdx, atlas);
                                            const uv2 = mapUvToAtlas(ruv2[0], ruv2[1], stripTexIdx, atlas);
                                            builder.addTri(
                                                a,
                                                b,
                                                p2,
                                                ca,
                                                odd ? uv1 : uv0,
                                                odd ? uv0 : uv1,
                                                uv2,
                                                cb,
                                                cc,
                                            );
                                        } else {
                                            builder.addTri(a, b, p2, ca, undefined, undefined, undefined, cb, cc);
                                        }
                                        visualTris++;
                                    }
                                }
                            }
                        }
                    }
                }

                const childOff = view.getUint32(njOff + 44, true);
                const sibOff = view.getUint32(njOff + 48, true);
                if (childOff) walkXjNode(childOff, px, py, pz, totalCos, totalSin);
                if (sibOff) walkXjNode(sibOff, ox, oy, oz, cosY, sinY);
            };

            for (let s = 0; s < Math.min(secCount, 96); s++) {
                const so = secTblOff + s * 52;
                if (so + 52 > visualBuf.byteLength) break;
                const sx = view.getFloat32(so + 4, true);
                const sy = view.getFloat32(so + 8, true);
                const sz = view.getFloat32(so + 12, true);
                const sry = view.getInt32(so + 20, true);
                if (Math.abs(sz) > 3500 || Math.abs(sx) > 3500) continue;
                const ang = (sry * 2 * Math.PI) / 65536;
                const cosY = Math.cos(ang);
                const sinY = Math.sin(ang);
                const listA = view.getUint32(so + 0x20, true);
                const listB = view.getUint32(so + 0x24, true);
                const cntA = view.getUint32(so + 0x28, true);
                const cntB = view.getUint32(so + 0x2c, true);
                for (let i = 0; i < Math.min(cntA, 256); i++) {
                    if (listA + i * 16 + 4 <= visualBuf.byteLength) {
                        walkXjNode(view.getUint32(listA + i * 16, true), sx, sy, sz, cosY, sinY);
                    }
                }
                for (let i = 0; i < Math.min(cntB, 256); i++) {
                    if (listB + i * 20 + 4 <= visualBuf.byteLength) {
                        walkXjNode(view.getUint32(listB + i * 20, true), sx, sy, sz, cosY, sinY);
                    }
                }
            }
        }
    }

    // 2. Parse `c.rel` collision mesh (for walkable floors, ramps, walls, and optional wireframe/architectural trim!)
    if (collisionBuf && collisionBuf.byteLength > 64) {
        const cView = new DataView(collisionBuf);
        const rootOff = cView.getUint32(collisionBuf.byteLength - 16, true);
        if (rootOff > 0 && rootOff + 4 <= collisionBuf.byteLength) {
            const tblOff = cView.getUint32(rootOff, true);
            for (let off = tblOff; off + 24 <= rootOff; off += 24) {
                const subOff = cView.getUint32(off, true);
                if (!subOff || subOff >= tblOff || subOff + 16 > collisionBuf.byteLength) break;
                const vCount = cView.getUint32(subOff, true);
                const vOff = cView.getUint32(subOff + 4, true);
                const tCount = cView.getUint32(subOff + 8, true);
                const tOff = cView.getUint32(subOff + 12, true);
                if (vOff + vCount * 12 > collisionBuf.byteLength || tOff + tCount * 36 > collisionBuf.byteLength) {
                    continue;
                }
                const pts: Array<[number, number, number]> = new Array(vCount);
                for (let i = 0; i < vCount; i++) {
                    const vo = vOff + i * 12;
                    pts[i] = [
                        cView.getFloat32(vo, true) * scale,
                        cView.getFloat32(vo + 4, true) * scale,
                        cView.getFloat32(vo + 8, true) * scale,
                    ];
                }
                for (let i = 0; i < tCount; i++) {
                    const to = tOff + i * 36;
                    const i0 = cView.getUint16(to, true);
                    const i1 = cView.getUint16(to + 2, true);
                    const i2 = cView.getUint16(to + 4, true);
                    const flags = cView.getUint16(to + 6, true);
                    const ny = cView.getFloat32(to + 12, true);
                    if (i0 >= vCount || i1 >= vCount || i2 >= vCount) continue;
                    const v0 = pts[i0];
                    const v1 = pts[i1];
                    const v2 = pts[i2];
                    if (Math.abs(v0[2]) > 260 || Math.abs(v0[0]) > 260) continue;
                    collisionTris.push({ v0, v1, v2, ny, flags });
                    // If visual `n.rel` was not provided, render the collision mesh directly
                    if (visualTris === 0) {
                        const col: [number, number, number] =
                            ny > 0.7 ? [0.14, 0.48, 0.54] : [0.22, 0.75, 0.82];
                        builder.addTri(v0, v1, v2, col);
                    }
                }
            }
        }
    }

    return {
        geometry: builder.toGeometry(
            stageName,
            "NJ (Sega Ninja)",
            `PSOBB Scene REL // ${visualTris} visual tris, ${collisionTris.length} collision tris`,
            atlas ? { pixels: atlas.pixels, width: atlas.width, height: atlas.height } : null,
        ),
        collisionTris,
    };
}

/**
 * Parses a Wavefront `.obj` or Sega Dreamcast/PC `.nj` (Ninja NJCM/NJTL binary) file into a WebGL geometry buffer.
 */
async function parsePsoOrObjModelFile(file: File): Promise<CustomMeshGeometry> {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext === "obj") {
        const text = await file.text();
        const verts: Array<[number, number, number]> = [];
        const builder = new MeshBuilder();
        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (line.startsWith("v ")) {
                const parts = line.split(/\s+/);
                verts.push([
                    Number.parseFloat(parts[1]) || 0,
                    Number.parseFloat(parts[2]) || 0,
                    Number.parseFloat(parts[3]) || 0,
                ]);
            } else if (line.startsWith("f ")) {
                const parts = line.split(/\s+/).slice(1);
                const idx = parts.map((p) => (Number.parseInt(p.split("/")[0], 10) || 1) - 1);
                for (let i = 1; i + 1 < idx.length; i++) {
                    const a = verts[idx[0]] ?? [0, 0, 0];
                    const b = verts[idx[i]] ?? [0, 0, 0];
                    const c = verts[idx[i + 1]] ?? [0, 0, 0];
                    builder.addTri(a, b, c, [0.38, 0.92, 0.88]);
                }
            }
        }
        return builder.toGeometry(
            file.name,
            "OBJ",
            `Wavefront OBJ // ${verts.length} vertices, ${builder.pos.length / 9} triangles`,
        );
    }

    const buf = await file.arrayBuffer();
    if (ext === "rel") {
        const isCollision = file.name.toLowerCase().endsWith("c.rel");
        const parsed = parsePsoSceneRelBuffers(isCollision ? null : buf, isCollision ? buf : null, file.name);
        return parsed.geometry;
    }

    return parseSegaNinjaNjBuffer(buf, file.name, 0.135);
}

function isEditableDomElement(el: EventTarget | Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    if (
        el.closest(
            '[contenteditable="true"], .mx_BasicMessageComposer_input, .mx_SendWysiwygComposer, .pso-quick-reply-input, .pso-lobby3d-chat-input',
        )
    ) {
        return true;
    }
    return false;
}

// ============================================================================
// MAIN EMBEDDED 3D PSO LOBBY + MINIGAME + RESHADE + ASSET LOADER COMPONENT
// ============================================================================
export function PsoLobby3dLayer({
    localDisplayName,
    localUserId,
    activeSymbolChat,
    remotePlayers,
    speechBubbles = {},
    presentationMode = "unified_stage",
    isChatDockVisible = true,
    guildRooms = [],
    isVoiceCallActive = false,
    onChangePresentationMode,
    onToggleChatDock,
    onSelectGuildRoom,
    onToggleVoiceCall,
    onOpenSymbolMaker,
    onOpenHudTuner,
    onSendLobbyChatMessage,
    onRequestRoomComposerFocus,
    onBroadcastLobbyState,
    incomingWorldAction,
    initialHunterState,
    onPersistHunterState,
    onViewportElementChange,
    isInputSuspended = false,
    castTechniqueRequest,
    onClose,
    onMouseEnter,
    onMouseLeave,
}: PsoLobby3dLayerProps): JSX.Element {
    const modalRootRef = useRef<HTMLDivElement | null>(null);
    const isInputSuspendedRef = useRef(isInputSuspended);
    isInputSuspendedRef.current = isInputSuspended;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const lobbyChatInputRef = useRef<HTMLInputElement | null>(null);
    const modelFileInputRef = useRef<HTMLInputElement | null>(null);

    // Focus Router State Machine: "WORLD_FOCUS" (3D Hunter control) vs "CHAT_FOCUS" (Typing into chat)
    const [focusMode, setFocusMode] = useState<PsoInputFocusMode>("WORLD_FOCUS");
    const focusModeRef = useRef<PsoInputFocusMode>("WORLD_FOCUS");
    const [lobbyChatDraft, setLobbyChatDraft] = useState<string>("");
    const [localSpeechBubble, setLocalSpeechBubble] = useState<{ text: string; sentAt: number } | null>(null);

    // Episode I Pioneer 2 Hunter's Guild Station Proximity & Active Counter Menu
    const [nearbyStation, setNearbyStation] = useState<PsoGuildStationId | null>("teleporter_pad");
    const nearbyStationRef = useRef<PsoGuildStationId | null>("teleporter_pad");
    const [activeStationMenu, setActiveStationMenu] = useState<PsoGuildStationId | null>(null);
    const [selectedRemotePlayer, setSelectedRemotePlayer] = useState<PsoRemoteLobbyPlayer | null>(null);

    // Player & Minigame State (Hydrated from persistent Hunter state so closing & reopening resumes at your exact spot!)
    const [classId, setClassId] = useState<PsoClassModelId>(initialHunterState?.classId ?? "humar");
    const [weaponId, setWeaponId] = useState<PsoWeaponModelId>(initialHunterState?.weaponId ?? "kingdom_key");
    const [inChair, setInChair] = useState<boolean>(initialHunterState?.inChair ?? false);
    const [stageId, setStageId] = useState<PsoLobbyStageId>(initialHunterState?.stageId ?? "bb_lobby_01");
    const [useRealClassNj, setUseRealClassNj] = useState<boolean>(initialHunterState?.useRealClassNj ?? true);
    const [bgmTrack, setBgmTrack] = useState<PsoBgmTrackId>(initialHunterState?.bgmTrack ?? "CITY.ogg");
    const [activeEmote, setActiveEmote] = useState<PsoLobbyEmoteId>("none");
    const activeEmoteRef = useRef<PsoLobbyEmoteId>("none");
    activeEmoteRef.current = activeEmote;
    const activeChatSourceRef = useRef<"lobby_bar" | "external_chat" | null>(null);
    const onBroadcastLobbyStateRef = useRef(onBroadcastLobbyState);
    onBroadcastLobbyStateRef.current = onBroadcastLobbyState;
    const onPersistHunterStateRef = useRef(onPersistHunterState);
    onPersistHunterStateRef.current = onPersistHunterState;
    const onRequestRoomComposerFocusRef = useRef(onRequestRoomComposerFocus);
    onRequestRoomComposerFocusRef.current = onRequestRoomComposerFocus;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const clearEmoteIfActive = useCallback((): void => {
        if (activeEmoteRef.current !== "none") {
            activeEmoteRef.current = "none";
            setActiveEmote("none");
        }
    }, []);
    const [isBgmPlaying, setIsBgmPlaying] = useState<boolean>(false);
    const [spawnBots, setSpawnBots] = useState<boolean>(true);
    const [mesetaCount, setMesetaCount] = useState<number>(initialHunterState?.mesetaCount ?? 4250);
    const [rareDropsFound, setRareDropsFound] = useState<string[]>(
        initialHunterState?.rareDropsFound ?? [
            "🔴 SPECIAL WEAPON (Red Sword +52)",
            "🗝️ KINGDOM KEY [KH Overhaul v1.04]",
        ],
    );

    // ReShade Post-Processing State (Toggled with Home key or button, matching Echelon's thread)
    const [isReShadeMenuOpen, setIsReShadeMenuOpen] = useState<boolean>(false);
    const [reShade, setReShade] = useState<PsoReShadeConfig>(
        initialHunterState?.reShade ?? {
            enabled: true,
            smaa: true,
            vibrance: 1.28,
            lumaSharpen: 1.15,
            reflectiveBump: 0.85,
            magicBloom: 0.92,
            khOverhaulMode: false,
        },
    );

    // PSO(DC) / PSOBB Asset & Model Loader Inspector State (Kion's dashgl/psov2 style)
    const [isAssetViewerOpen, setIsAssetViewerOpen] = useState<boolean>(false);
    const [loadedAssetInfo, setLoadedAssetInfo] = useState<string>(
        "Authentic PSOBB Assets (F:\\Ultima-PSOBB) + KH Pack Ready",
    );
    const customWeaponMeshRef = useRef<CustomMeshGeometry | null>(null);
    const loadedStageMeshRef = useRef<CustomMeshGeometry | null>(null);
    const loadedStageCollisionRef = useRef<PsoCollisionTriangle[]>([]);
    const loadedClassMeshesRef = useRef<Partial<Record<PsoClassModelId, CustomMeshGeometry>>>({});
    const loadedNpcMeshesRef = useRef<Partial<Record<PsoNpcModelId, CustomMeshGeometry>>>({});
    const loadedMotionsRef = useRef<Record<string, { buf: ArrayBuffer; nbFrame: number }>>({});
    const loadedPhotonChairRef = useRef<CustomMeshGeometry | null>(null);
    const loadedCityObjectsRef = useRef<
        Partial<
            Record<
                "warp_big" | "warp_small" | "elv_alcove" | "shopdoor" | "hunter_door" | "med_door" | "aircar",
                CustomMeshGeometry
            >
        >
    >({});
    const [cityEventLayout, setCityEventLayout] = useState<PsoCityEventLayoutId>("e");

    // Mutable 60fps simulation state (initialized from persistent Hunter coordinates!)
    const simRef = useRef({
        px: initialHunterState?.x ?? 0,
        py: 0,
        pz: initialHunterState?.z ?? 4.5,
        pyaw: initialHunterState?.yaw ?? Math.PI,
        camYaw: initialHunterState?.camYaw ?? 0,
        camTargetYaw: null as number | null,
        camDist: 5.4,
        camPitch: 0.24,
        attackTimer: 0,
        comboStep: 0,
        techBurstTimer: 0,
        techCastTotal: 0.65,
        techEffects: [] as PsoActiveTechEffect[],
        keys: new Set<string>(),
        boxes: [
            { id: "b1", x: -4.8, z: -3.2, rotY: 0.2, kind: "green_box", hp: 30, maxHp: 30, dropLoot: null, respawnAt: 0 },
            { id: "b2", x: -3.4, z: -4.2, rotY: 0.8, kind: "red_rare_box", hp: 45, maxHp: 45, dropLoot: null, respawnAt: 0 },
            { id: "b3", x: 3.6, z: -4.0, rotY: 1.4, kind: "kh_chest", hp: 40, maxHp: 40, dropLoot: null, respawnAt: 0 },
            { id: "b4", x: 5.0, z: -2.8, rotY: 2.1, kind: "green_box", hp: 30, maxHp: 30, dropLoot: null, respawnAt: 0 },
            { id: "r1", x: 0.0, z: -6.2, rotY: 0.0, kind: "rappy_target", hp: 60, maxHp: 60, dropLoot: null, respawnAt: 0 },
        ] as PsoItemBoxEntity[],
        floatingTexts: [] as PsoFloatingText[],
        remoteInterp: {} as Record<string, { x: number; z: number; yaw: number }>,
        camDragging: false,
        camDragMoved: false,
        camDragLastX: 0,
        camDragLastY: 0,
        screenLabels: [] as Array<{
            id: string;
            name: string;
            x: number;
            y: number;
            color: string;
            symbolText?: string;
            chatText?: string;
        }>,
    });

    const [gamePack, setGamePack] = useState<PsoCompiledGamePack>(FALLBACK_PROCEDURAL_GAME_PACK);
    const gamePackRef = useRef<PsoCompiledGamePack>(FALLBACK_PROCEDURAL_GAME_PACK);
    gamePackRef.current = gamePack;

    useEffect(() => {
        let cancelled = false;
        void loadCompiledGamePack().then((pack) => {
            if (!cancelled) {
                gamePackRef.current = pack;
                setGamePack(pack);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Keep latest props in a ref so the 60FPS WebGL loop NEVER has to tear down and recreate WebGL buffers when remotePlayers or speechBubbles update!
    const renderPropsRef = useRef({
        activeEmote,
        activeSymbolChat,
        bgmTrack,
        cityEventLayout,
        classId,
        inChair,
        localDisplayName,
        localSpeechBubble,
        localUserId,
        mesetaCount,
        rareDropsFound,
        reShade,
        remotePlayers,
        spawnBots,
        speechBubbles,
        stageId,
        useRealClassNj,
        weaponId,
    });
    renderPropsRef.current = {
        activeEmote,
        activeSymbolChat,
        bgmTrack,
        cityEventLayout,
        classId,
        inChair,
        localDisplayName,
        localSpeechBubble,
        localUserId,
        mesetaCount,
        rareDropsFound,
        reShade,
        remotePlayers,
        spawnBots,
        speechBubbles,
        stageId,
        useRealClassNj,
        weaponId,
    };

    // Sync weapon/class/stage changes coming from the F12 PSOBB Full Game Menu (`initialHunterState`)
    useEffect(() => {
        if (initialHunterState?.classId && initialHunterState.classId !== classId) {
            setClassId(initialHunterState.classId);
        }
        if (initialHunterState?.weaponId && initialHunterState.weaponId !== weaponId) {
            setWeaponId(initialHunterState.weaponId);
        }
        if (initialHunterState?.stageId && initialHunterState.stageId !== stageId) {
            setStageId(initialHunterState.stageId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialHunterState?.classId, initialHunterState?.weaponId, initialHunterState?.stageId]);

    // Persist local Hunter state (position, facing, camera, class, weapon, chair, stage, Meseta) continuously and on unmount!
    useEffect(() => {
        const saveNow = (): void => {
            const sim = simRef.current;
            const rp = renderPropsRef.current;
            onPersistHunterStateRef.current?.({
                x: +sim.px.toFixed(2),
                z: +sim.pz.toFixed(2),
                yaw: +sim.pyaw.toFixed(2),
                camYaw: +sim.camYaw.toFixed(2),
                classId: rp.classId,
                weaponId: rp.weaponId,
                inChair: rp.inChair,
                stageId: rp.stageId,
                useRealClassNj: rp.useRealClassNj,
                bgmTrack: rp.bgmTrack,
                mesetaCount: rp.mesetaCount,
                rareDropsFound: rp.rareDropsFound,
                reShade: rp.reShade,
            });
        };
        const timer = window.setInterval(saveNow, 1000);
        return () => {
            window.clearInterval(timer);
            saveNow();
        };
    }, []);

    // Load 3D Stage `.rel` dynamically from `game-pack.json` (compiled by `extract:psobb`)
    useEffect(() => {
        if (stageId === "pioneer2_holodeck") {
            loadedStageMeshRef.current = null;
            loadedStageCollisionRef.current = [];
            simRef.current.py = 0;
            setLoadedAssetInfo("Pioneer 2 Holodeck (Procedural + KH Keyblade Pack)");
            return;
        }
        const spec = gamePack.stages[stageId];
        if (!spec) {
            loadedStageMeshRef.current = null;
            loadedStageCollisionRef.current = [];
            simRef.current.py = 0;
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const [visRes, colRes, xvmRes] = await Promise.all([
                    fetch(spec.vis).catch(() => null),
                    fetch(spec.col).catch(() => null),
                    fetch(spec.xvm).catch(() => null),
                ]);
                const visBuf = visRes && visRes.ok ? await visRes.arrayBuffer() : null;
                const colBuf = colRes && colRes.ok ? await colRes.arrayBuffer() : null;
                const xvmBuf = xvmRes && xvmRes.ok ? await xvmRes.arrayBuffer() : null;
                if (cancelled) return;
                if (visBuf || colBuf) {
                    const parsed = parsePsoSceneRelBuffers(visBuf, colBuf, spec.label, spec.scale, xvmBuf);
                    loadedStageMeshRef.current = parsed.geometry;
                    loadedStageCollisionRef.current = parsed.collisionTris;
                    simRef.current.py = spec.defaultFloorY;
                    setLoadedAssetInfo(`${spec.label} — ${parsed.geometry.chunkInfo}`);
                }
            } catch {
                // fallback to procedural deck if fetch fails
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [stageId, gamePack]);

    // Preload Class `.nj` Character Models + NPCs + Motions dynamically from `game-pack.json`
    useEffect(() => {
        const classFileMap = gamePack.classModels;
        const npcFileMap = gamePack.npcModels;
        let cancelled = false;
        void (async () => {
            try {
                await Promise.all([
                    ...(
                        Object.entries(classFileMap) as Array<
                            [PsoClassModelId, NonNullable<(typeof classFileMap)["humar"]>]
                        >
                    ).map(async ([cId, info]) => {
                        if (!info) return;
                        const [bdyRes, hedRes, haiRes, xvmRes] = await Promise.all([
                            fetch(`media/pso/chars/${info.bdy}`).catch(() => null),
                            fetch(`media/pso/chars/${info.hed}`).catch(() => null),
                            info.hai ? fetch(`media/pso/chars/${info.hai}`).catch(() => null) : Promise.resolve(null),
                            fetch(`media/pso/chars/${info.xvm}`).catch(() => null),
                        ]);
                        if (!bdyRes || !bdyRes.ok || cancelled) return;
                        const [bdyBuf, hedBuf, haiBuf, xvmBuf] = await Promise.all([
                            bdyRes.arrayBuffer(),
                            hedRes && hedRes.ok ? hedRes.arrayBuffer() : Promise.resolve(null),
                            haiRes && haiRes.ok ? haiRes.arrayBuffer() : Promise.resolve(null),
                            xvmRes && xvmRes.ok ? xvmRes.arrayBuffer() : Promise.resolve(null),
                        ]);
                        if (cancelled) return;
                        loadedClassMeshesRef.current[cId] = parseSegaNinjaNjBuffer(
                            bdyBuf,
                            `${cId.toUpperCase()} (${info.bdy})`,
                            0.135,
                            info.tint,
                            hedBuf,
                            haiBuf,
                            xvmBuf,
                        );
                    }),
                    ...(
                        Object.entries(npcFileMap) as Array<
                            [PsoNpcModelId, NonNullable<(typeof npcFileMap)["npc_trunk"]>]
                        >
                    ).map(async ([npcId, info]) => {
                        if (!info) return;
                        const [njRes, xvmRes] = await Promise.all([
                            fetch(`media/pso/chars/${info.nj}`).catch(() => null),
                            fetch(`media/pso/chars/${info.xvm}`).catch(() => null),
                        ]);
                        if (!njRes || !njRes.ok || cancelled) return;
                        const [njBuf, xvmBuf] = await Promise.all([
                            njRes.arrayBuffer(),
                            xvmRes && xvmRes.ok ? xvmRes.arrayBuffer() : Promise.resolve(null),
                        ]);
                        if (cancelled) return;
                        loadedNpcMeshesRef.current[npcId] = parseSegaNinjaNjBuffer(
                            njBuf,
                            `${npcId.toUpperCase()} (${info.nj})`,
                            0.135,
                            info.tint,
                            null,
                            null,
                            xvmBuf,
                        );
                    }),
                    // Preload Authentic `.njm` Skeletal Animations (from `charamakingmot.bml`, `npcapcmot.bml`, `PlyMotionData.rlc`, `PlyMotionNpcTown.cpt`)
                    ...[
                        "mot_wait_town_m",
                        "mot_wait_town_w",
                        "mot_wait_town_f",
                        "mot_walk_town_m",
                        "mot_walk_town_w",
                        "mot_walk_town_f",
                        "mot_wait_battle_m",
                        "mot_wait_battle_w",
                        "mot_wait_battle_f",
                        "mot_run_m",
                        "mot_run_w",
                        "mot_run_f",
                        "mot_cast_m",
                        "mot_cast_w",
                        "mot_cast_f",
                        "mot_atk1_m",
                        "mot_atk1_w",
                        "mot_atk1_f",
                        "mot_atk2_m",
                        "mot_atk2_w",
                        "mot_atk2_f",
                        "mot_atk3_m",
                        "mot_atk3_w",
                        "mot_atk3_f",
                        "mot_sit_m",
                        "mot_sit_w",
                        "mot_wave_m",
                        "mot_wave_w",
                        "mot_cheer_m",
                        "mot_cheer_w",
                        "mot_dance_m",
                        "mot_dance_w",
                        "mot_bow_m",
                        "mot_bow_w",
                        "mot_npc_town_0",
                        "mot_npc_town_1",
                        "mot_npc_town_2",
                        "mot_npc_town_3",
                    ].map(async (motName) => {
                        const res = await fetch(`media/pso/chars/${motName}.njm`).catch(() => null);
                        if (!res || !res.ok || cancelled) return;
                        const buf = await res.arrayBuffer();
                        if (cancelled || buf.byteLength < 24) return;
                        const view = new DataView(buf);
                        const nbFrame = Math.max(1, view.getUint32(12, true));
                        loadedMotionsRef.current[motName] = { buf, nbFrame };
                    }),
                    // Preload Authentic 3D Photon Chair (`bm_ply_photon_chair.bml`)
                    (async () => {
                        const [njRes, xvmRes] = await Promise.all([
                            fetch("media/pso/chars/obj_photon_chair.nj").catch(() => null),
                            fetch("media/pso/chars/obj_photon_chair.xvm").catch(() => null),
                        ]);
                        if (!njRes || !njRes.ok || cancelled) return;
                        const [njBuf, xvmBuf] = await Promise.all([
                            njRes.arrayBuffer(),
                            xvmRes && xvmRes.ok ? xvmRes.arrayBuffer() : Promise.resolve(null),
                        ]);
                        if (cancelled) return;
                        loadedPhotonChairRef.current = parseSegaNinjaNjBuffer(
                            njBuf,
                            "PHOTON CHAIR (obj_photon_chair.nj)",
                            0.135,
                            [0.32, 0.92, 0.96],
                            null,
                            null,
                            xvmBuf,
                        );
                    })(),
                    // Preload Authentic Pioneer 2 Stage Objects (`bm_obj_city_common.bml` + `bm_obj_city_common.xvm`)
                    (async () => {
                        const xvmRes = await fetch("media/pso/scene/obj_city_common.xvm").catch(() => null);
                        const xvmBuf = xvmRes && xvmRes.ok ? await xvmRes.arrayBuffer() : null;
                        if (cancelled) return;
                        const xjSpecs: Array<{
                            key: "warp_big" | "warp_small" | "elv_alcove" | "shopdoor" | "hunter_door" | "med_door";
                            file: string;
                        }> = [
                            { key: "warp_big", file: "obj_warp_big.xj" },
                            { key: "warp_small", file: "obj_warp_small.xj" },
                            { key: "elv_alcove", file: "obj_elv_alcove.xj" },
                            { key: "shopdoor", file: "obj_shopdoor.xj" },
                            { key: "hunter_door", file: "obj_hunter_door.xj" },
                            { key: "med_door", file: "obj_med_door.xj" },
                        ];
                        await Promise.all([
                            ...xjSpecs.map(async ({ key, file }) => {
                                const r = await fetch(`media/pso/scene/${file}`).catch(() => null);
                                if (!r || !r.ok || cancelled) return;
                                const b = await r.arrayBuffer();
                                if (cancelled) return;
                                loadedCityObjectsRef.current[key] = parsePsoStandaloneXjBuffer(b, file, 0.08, xvmBuf);
                            }),
                            (async () => {
                                const r = await fetch("media/pso/scene/obj_aircar01.nj").catch(() => null);
                                if (!r || !r.ok || cancelled) return;
                                const b = await r.arrayBuffer();
                                if (cancelled) return;
                                loadedCityObjectsRef.current.aircar = parseSegaNinjaNjBuffer(
                                    b,
                                    "obj_aircar01.nj",
                                    0.06,
                                    [0.45, 0.82, 0.95],
                                    null,
                                    null,
                                    xvmBuf,
                                );
                            })(),
                        ]);
                    })(),
                ]);
            } catch {
                // ignore
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [gamePack]);

    const [hudLabels, setHudLabels] = useState<
        Array<{
            id: string;
            name: string;
            x: number;
            y: number;
            color: string;
            symbolText?: string;
            chatText?: string;
            sectionId?: { name: PsoSectionIdName; color: string };
            remotePlayer?: PsoRemoteLobbyPlayer;
            ghostMode?: boolean;
        }>
    >([]);

    // E. Authentic PSOBB Ogg Vorbis Soundtrack (`CITY.ogg`, `LOBBY.ogg`, `GUILD.ogg`, `MEDICAL.ogg`, `SHOP.ogg`, `LABO.ogg`, `slbgm_forest.ogg`) + WebAudio Synth Fallback
    useEffect(() => {
        if (!isBgmPlaying) return;

        if (bgmTrack !== "synth") {
            const audio = new Audio(`media/pso/ogg/${bgmTrack}`);
            audio.loop = true;
            audio.volume = 0.32;
            void audio.play().catch(() => {});
            return () => {
                audio.pause();
                audio.src = "";
            };
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        master.gain.value = 0.09;
        master.connect(ctx.destination);

        // Warm Pioneer 2 Rhodes/Pad Chords (Fmaj9 -> Em7 -> Dm9 -> Cmaj9)
        const chords = [
            [174.61, 220.0, 261.63, 329.63, 392.0],
            [164.81, 196.0, 246.94, 293.66, 392.0],
            [146.83, 174.61, 220.0, 261.63, 329.63],
            [130.81, 164.81, 196.0, 246.94, 293.66],
        ];
        const arps = [523.25, 659.25, 783.99, 987.77, 783.99, 659.25];
        let step = 0;

        const playStep = (): void => {
            if (ctx.state === "suspended") void ctx.resume();
            const now = ctx.currentTime;
            // Every 4 steps (3.2s), trigger warm Pioneer 2 pad chord
            if (step % 4 === 0) {
                const chord = chords[Math.floor(step / 4) % chords.length];
                for (const freq of chord) {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(freq, now);
                    g.gain.setValueAtTime(0.001, now);
                    g.gain.linearRampToValueAtTime(0.11, now + 0.6);
                    g.gain.exponentialRampToValueAtTime(0.001, now + 3.1);
                    osc.connect(g);
                    g.connect(master);
                    osc.start(now);
                    osc.stop(now + 3.2);
                }
            }
            // Gentle crystalline Pioneer 2 arpeggio bell
            const bellOsc = ctx.createOscillator();
            const bellGain = ctx.createGain();
            bellOsc.type = "triangle";
            bellOsc.frequency.setValueAtTime(arps[step % arps.length], now);
            bellGain.gain.setValueAtTime(0.001, now);
            bellGain.gain.linearRampToValueAtTime(0.07, now + 0.04);
            bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
            bellOsc.connect(bellGain);
            bellGain.connect(master);
            bellOsc.start(now);
            bellOsc.stop(now + 0.75);
            step++;
        };

        playStep();
        const timer = window.setInterval(playStep, 800);
        return () => {
            window.clearInterval(timer);
            void ctx.close().catch(() => {});
        };
    }, [bgmTrack, isBgmPlaying]);

    // Apply incoming Multiplayer World Actions (Synchronized Box Hits / Tech Bursts / Emotes from other Hunters!)
    const lastProcessedWorldActionTsRef = useRef<number>(0);
    useEffect(() => {
        if (!incomingWorldAction || incomingWorldAction.ts <= lastProcessedWorldActionTsRef.current) return;
        lastProcessedWorldActionTsRef.current = incomingWorldAction.ts;
        const sim = simRef.current;
        const now = performance.now();

        if (incomingWorldAction.kind === "hit_box" && incomingWorldAction.boxId) {
            const box = sim.boxes.find((b) => b.id === incomingWorldAction.boxId);
            if (box && box.hp > 0) {
                const dmg = incomingWorldAction.dmg ?? 20;
                box.hp = Math.max(0, box.hp - dmg);
                sim.floatingTexts.push({
                    id: `rem-dmg-${now}-${Math.random()}`,
                    x: box.x,
                    y: 1.5,
                    z: box.z,
                    text: `${dmg}`,
                    color: "#8ae3dd",
                    bornAt: now,
                });
                if (box.hp === 0) {
                    box.respawnAt = now + 5500;
                    const isRare = box.kind === "red_rare_box" || box.kind === "kh_chest";
                    const dropLabel = isRare ? "🔴 PARTY SPECIAL WEAPON" : "💎 PARTY 650 MESETA";
                    playPsoSymbolChime(isRare ? "rare" : "rappy");
                    setMesetaCount((m) => m + 650);
                    sim.floatingTexts.push({
                        id: `rem-drop-${now}`,
                        x: box.x,
                        y: 2.1,
                        z: box.z,
                        text: dropLabel,
                        color: isRare ? "#ff3b4e" : "#ffe26a",
                        bornAt: now,
                    });
                }
            }
        } else if (incomingWorldAction.kind === "tech_burst") {
            playPsoSymbolChime("rare");
            const spec = getTechSpec(incomingWorldAction.techName ?? "Shifta");
            sim.techEffects.push({
                id: `rem-tech-${now}`,
                spec,
                x: incomingWorldAction.x ?? 0,
                y: 0,
                z: incomingWorldAction.z ?? 0,
                yaw: incomingWorldAction.yaw ?? 0,
                bornAt: now,
            });
            sim.floatingTexts.push({
                id: `rem-tech-${now}`,
                x: incomingWorldAction.x ?? 0,
                y: 2.3,
                z: incomingWorldAction.z ?? 0,
                text: `${incomingWorldAction.senderName || "HUNTER"}: ${spec.name.toUpperCase()}`,
                color: "#50f296",
                bornAt: now,
            });
        }
    }, [incomingWorldAction]);

    const triggerEmote = useCallback(
        (emote: PsoLobbyEmoteId) => {
            const nextEmote: PsoLobbyEmoteId = activeEmoteRef.current === emote ? "none" : emote;
            activeEmoteRef.current = nextEmote;
            setActiveEmote(nextEmote);
            playPsoSymbolChime("comm");
            const sim = simRef.current;
            const now = performance.now();
            const labels: Record<PsoLobbyEmoteId, string> = {
                none: "",
                wave: "👋 LOBBY ACTION: WAVE",
                dance: "💃 LOBBY ACTION: PIONEER DANCE",
                cheer: "🙌 LOBBY ACTION: CHEER!",
                bow: "🙇 LOBBY ACTION: HUNTER BOW",
            };
            if (nextEmote !== "none") {
                sim.floatingTexts.push({
                    id: `emote-${now}`,
                    x: sim.px,
                    y: 2.35,
                    z: sim.pz,
                    text: labels[nextEmote],
                    color: "#f2c650",
                    bornAt: now,
                });
            }
        },
        [],
    );

    const triggerStationInteract = useCallback(
        (station?: PsoGuildStationId | null): boolean => {
            const target = station ?? nearbyStationRef.current;
            if (!target) return false;
            clearEmoteIfActive();
            playPsoSymbolChime("comm");
            const now = performance.now();
            if (target === "principal_warp_to_office") {
                playPsoSymbolChime("rare");
                simRef.current.px = 0.0;
                simRef.current.py = 0.0;
                simRef.current.pz = -140.5;
                simRef.current.pyaw = Math.PI;
                simRef.current.camYaw = 0;
                simRef.current.camTargetYaw = null;
                simRef.current.floatingTexts.push({
                    id: `warp-prin-${now}`,
                    x: 0.0,
                    y: 2.35,
                    z: -140.5,
                    text: "🏛️ WARPED TO PRINCIPAL TYRELL'S OFFICE (SEC 41)",
                    color: "#c88aff",
                    bornAt: now,
                });
                setActiveStationMenu(null);
                return true;
            }
            if (target === "principal_warp_to_city") {
                playPsoSymbolChime("rare");
                simRef.current.px = 0.0;
                simRef.current.py = 0.0;
                simRef.current.pz = -2.2;
                simRef.current.pyaw = 0;
                simRef.current.camYaw = Math.PI;
                simRef.current.camTargetYaw = null;
                simRef.current.floatingTexts.push({
                    id: `warp-city-${now}`,
                    x: 0.0,
                    y: 2.35,
                    z: -2.2,
                    text: "🏙️ RETURNED TO PIONEER 2 CITY CONCOURSE (SEC 20)",
                    color: "#50f296",
                    bornAt: now,
                });
                setActiveStationMenu(null);
                return true;
            }
            if (target === "principal_tyrell") {
                playPsoSymbolChime("rare");
                simRef.current.floatingTexts.push({
                    id: `tyrell-${now}`,
                    x: simRef.current.px,
                    y: 2.35,
                    z: simRef.current.pz,
                    text: "👑 PRINCIPAL TYRELL: INVESTIGATE RAGOL'S 4 AREAS!",
                    color: "#f2c650",
                    bornAt: now,
                });
                setActiveStationMenu("teleporter_pad");
                return true;
            }
            if (target === "shop_plaza") {
                setActiveStationMenu("bank_counter");
                return true;
            }
            if (target === "medical_center") {
                playPsoSymbolChime("rare");
                simRef.current.floatingTexts.push({
                    id: `med-${now}`,
                    x: simRef.current.px,
                    y: 2.35,
                    z: simRef.current.pz,
                    text: "💚 MEDICAL CENTER: HP & TP 100% RESTORED!",
                    color: "#50f296",
                    bornAt: now,
                });
            }
            setActiveStationMenu((prev) => (prev === target ? null : target));
            return true;
        },
        [clearEmoteIfActive],
    );

    const triggerAttack = useCallback(() => {
        clearEmoteIfActive();
        const sim = simRef.current;
        sim.attackTimer = 0.36;
        sim.comboStep = (sim.comboStep % 3) + 1;
        playPsoSymbolChime("comm");

        const reach = 2.6;
        const hitX = sim.px + Math.sin(sim.pyaw) * 1.35;
        const hitZ = sim.pz + Math.cos(sim.pyaw) * 1.35;
        const dmg = sim.comboStep === 3 ? 32 : sim.comboStep === 2 ? 20 : 15;

        const now = performance.now();
        for (const box of sim.boxes) {
            if (box.hp <= 0) continue;
            const d = Math.hypot(box.x - hitX, box.z - hitZ);
            if (d <= reach) {
                box.hp = Math.max(0, box.hp - dmg);
                sim.floatingTexts.push({
                    id: `dmg-${now}-${Math.random()}`,
                    x: box.x,
                    y: 1.5,
                    z: box.z,
                    text: sim.comboStep === 3 ? `CRITICAL ${dmg}!` : `${dmg}`,
                    color: sim.comboStep === 3 ? "#ff9e2c" : "#ffffff",
                    bornAt: now,
                });

                if (box.hp === 0) {
                    box.respawnAt = now + 5500;
                    const isRare = box.kind === "red_rare_box" || box.kind === "kh_chest" || Math.random() < 0.35;
                    const dropLabel =
                        box.kind === "kh_chest"
                            ? "🗝️ KEYBLADE // OBLIVION"
                            : isRare
                              ? "🔴 SPECIAL WEAPON"
                              : "💎 650 MESETA";
                    playPsoSymbolChime(isRare ? "rare" : "rappy");
                    setMesetaCount((m) => m + (isRare ? 1200 : 650));
                    if (isRare) {
                        setRareDropsFound((prev) => [dropLabel, ...prev.slice(0, 4)]);
                    }
                    sim.floatingTexts.push({
                        id: `drop-${now}-${Math.random()}`,
                        x: box.x,
                        y: 2.1,
                        z: box.z,
                        text: dropLabel,
                        color: isRare ? "#ff3b4e" : "#ffe26a",
                        bornAt: now,
                    });
                }

                // Broadcast synchronized box hit to all Hunters in the room!
                onBroadcastLobbyStateRef.current?.({
                    x: +sim.px.toFixed(2),
                    z: +sim.pz.toFixed(2),
                    yaw: +sim.pyaw.toFixed(2),
                    classId: renderPropsRef.current.classId,
                    weaponId: renderPropsRef.current.weaponId,
                    inChair: renderPropsRef.current.inChair,
                    attacking: true,
                    emote: "none",
                    fastTick: true,
                    worldAction: {
                        kind: "hit_box",
                        boxId: box.id,
                        dmg,
                        senderName: renderPropsRef.current.localDisplayName,
                        ts: Date.now(),
                    },
                });
            }
        }
    }, [clearEmoteIfActive]);

    const lastTechNameRef = useRef("Shifta");
    const triggerTechBurst = useCallback((techName?: string) => {
        const sim = simRef.current;
        const now = performance.now();
        if (isAndroidClass(renderPropsRef.current.classId)) {
            playPsoSymbolChime("alert");
            sim.floatingTexts.push({
                id: `tech-${now}`,
                x: sim.px,
                y: 2.3,
                z: sim.pz,
                text: "Androids can't use techniques",
                color: "#ff8a6a",
                bornAt: now,
            });
            return;
        }
        if (sim.techBurstTimer > 0) return;
        const name = techName ?? lastTechNameRef.current;
        lastTechNameRef.current = name;
        clearEmoteIfActive();
        const spec = getTechSpec(name);
        sim.techCastTotal = techCastDurationSec(spec);
        sim.techBurstTimer = sim.techCastTotal;
        sim.techEffects.push({ id: `tech-${now}`, spec, x: sim.px, y: sim.py, z: sim.pz, yaw: sim.pyaw, bornAt: now });
        playPsoSymbolChime("rare");
        sim.floatingTexts.push({
            id: `tech-${now}`,
            x: sim.px,
            y: 2.3,
            z: sim.pz,
            text: spec.name.toUpperCase(),
            color: "#50f296",
            bornAt: now,
        });
        onBroadcastLobbyStateRef.current?.({
            x: +sim.px.toFixed(2),
            z: +sim.pz.toFixed(2),
            yaw: +sim.pyaw.toFixed(2),
            classId: renderPropsRef.current.classId,
            weaponId: renderPropsRef.current.weaponId,
            inChair: renderPropsRef.current.inChair,
            attacking: false,
            emote: "none",
            fastTick: true,
            worldAction: {
                kind: "tech_burst",
                senderName: renderPropsRef.current.localDisplayName,
                techName: name,
                x: +sim.px.toFixed(2),
                z: +sim.pz.toFixed(2),
                yaw: +sim.pyaw.toFixed(2),
                ts: Date.now(),
            },
        });
    }, [clearEmoteIfActive]);

    const lastCastRequestNonceRef = useRef<number | null>(null);
    useEffect(() => {
        if (!castTechniqueRequest || castTechniqueRequest.nonce === lastCastRequestNonceRef.current) return;
        lastCastRequestNonceRef.current = castTechniqueRequest.nonce;
        triggerTechBurst(castTechniqueRequest.techName);
    }, [castTechniqueRequest, triggerTechBurst]);

    const switchFocusMode = useCallback((nextMode: PsoInputFocusMode, focusTarget?: "lobby_bar" | "room_composer"): void => {
        focusModeRef.current = nextMode;
        setFocusMode(nextMode);
        if (nextMode === "CHAT_FOCUS") {
            simRef.current.keys.clear();
            if (focusTarget === "room_composer") {
                activeChatSourceRef.current = "external_chat";
                onRequestRoomComposerFocusRef.current?.();
            } else {
                activeChatSourceRef.current = "lobby_bar";
                window.setTimeout(() => {
                    lobbyChatInputRef.current?.focus();
                }, 0);
            }
        } else {
            activeChatSourceRef.current = null;
            // Leaving chat focus -> blur any active input/contenteditable and focus the 3D canvas
            if (document.activeElement instanceof HTMLElement && isEditableDomElement(document.activeElement)) {
                document.activeElement.blur();
            }
            canvasRef.current?.focus();
        }
    }, []);

    // The main menu is game UI: it takes input from chat while open and hands chat focus back when it closes.
    const focusBeforeMenuRef = useRef<{ mode: PsoInputFocusMode; target: "lobby_bar" | "room_composer" } | null>(null);
    useEffect(() => {
        const sim = simRef.current;
        for (const k of ["arrowup", "arrowdown", "arrowleft", "arrowright"]) sim.keys.delete(k);
        if (isInputSuspended) {
            focusBeforeMenuRef.current = {
                mode: focusModeRef.current,
                target: activeChatSourceRef.current === "external_chat" ? "room_composer" : "lobby_bar",
            };
            if (focusModeRef.current === "CHAT_FOCUS") switchFocusMode("WORLD_FOCUS");
        } else if (focusBeforeMenuRef.current) {
            const before = focusBeforeMenuRef.current;
            focusBeforeMenuRef.current = null;
            if (before.mode === "CHAT_FOCUS") switchFocusMode("CHAT_FOCUS", before.target);
        }
        // switchFocusMode is stable (useCallback with no deps).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInputSuspended]);

    // When 3D Lobby FIRST mounts, blur any active chat composer and enter WORLD_FOCUS once so WASD immediately controls your Hunter
    useEffect(() => {
        switchFocusMode("WORLD_FOCUS");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cooperative Focus Router:
    // - Clicking the external Matrix chat window OR the in-game `SAY >` bar gives that input clean CHAT_FOCUS without fighting.
    // - Clicking UI buttons/<select> dropdowns inside the 3D Lobby lets them open/click normally without canvasRef stealing focus.
    // - Element's background LoggedInView is prevented from stealing focus *of its own accord* when you haven't clicked it.
    useEffect(() => {
        const onFocusIn = (e: FocusEvent): void => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target === lobbyChatInputRef.current || target.closest(".pso-lobby3d-chat-form")) {
                activeChatSourceRef.current = "lobby_bar";
                focusModeRef.current = "CHAT_FOCUS";
                setFocusMode("CHAT_FOCUS");
                simRef.current.keys.clear();
            } else if (isEditableDomElement(target) && !modalRootRef.current?.contains(target)) {
                // Only allow external Matrix chat composer focus if the user explicitly clicked the chat dock!
                if (activeChatSourceRef.current === "external_chat") {
                    focusModeRef.current = "CHAT_FOCUS";
                    setFocusMode("CHAT_FOCUS");
                    simRef.current.keys.clear();
                } else if (activeChatSourceRef.current === "lobby_bar") {
                    window.setTimeout(() => lobbyChatInputRef.current?.focus(), 0);
                } else {
                    target.blur();
                    canvasRef.current?.focus();
                }
            }
        };

        const onPointerDownGlobal = (e: PointerEvent): void => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest(".pso-lobby3d-chat-form")) {
                activeChatSourceRef.current = "lobby_bar";
                focusModeRef.current = "CHAT_FOCUS";
                setFocusMode("CHAT_FOCUS");
                simRef.current.keys.clear();
            } else if (
                !modalRootRef.current?.contains(target) &&
                (isEditableDomElement(target) ||
                    Boolean(target.closest(".mx_RoomView_wrapper, .mx_MessageComposer, .pso-quick-reply-bar")))
            ) {
                // User explicitly clicked the docked Matrix chat window or composer -> allow external chat focus!
                activeChatSourceRef.current = "external_chat";
                focusModeRef.current = "CHAT_FOCUS";
                setFocusMode("CHAT_FOCUS");
                simRef.current.keys.clear();
            } else if (target === canvasRef.current) {
                // User clicked directly on the 3D WebGL canvas -> return to WORLD_FOCUS
                activeChatSourceRef.current = null;
                if (document.activeElement instanceof HTMLElement && isEditableDomElement(document.activeElement)) {
                    document.activeElement.blur();
                }
                focusModeRef.current = "WORLD_FOCUS";
                setFocusMode("WORLD_FOCUS");
                canvasRef.current?.focus();
            } else if (modalRootRef.current?.contains(target)) {
                // User clicked an in-game UI button, <select> dropdown, slider, or modal inside the 3D Lobby:
                // Switch logical state to WORLD_FOCUS, but DO NOT call canvasRef.current.focus() so <select> dropdowns & buttons work!
                activeChatSourceRef.current = null;
                focusModeRef.current = "WORLD_FOCUS";
                setFocusMode("WORLD_FOCUS");
            }
        };
        window.addEventListener("focusin", onFocusIn, true);
        window.addEventListener("pointerdown", onPointerDownGlobal, true);
        return () => {
            window.removeEventListener("focusin", onFocusIn, true);
            window.removeEventListener("pointerdown", onPointerDownGlobal, true);
        };
    }, []);

    // Keyboard & Focus Router (Capture-phase so Element's LoggedInView NEVER hijacks keys into the background chat composer while 3D Lobby is in WORLD_FOCUS!)
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement | null;
            if (isInputSuspendedRef.current) {
                const isMenuKey =
                    e.key.startsWith("Arrow") ||
                    e.key.startsWith("Page") ||
                    e.key === "Enter" ||
                    e.key === "Escape" ||
                    e.key === "Backspace" ||
                    e.key === "[" ||
                    e.key === "]";
                if (isMenuKey || isEditableDomElement(target)) return;
            }
            const inLobbyChatInput =
                target === lobbyChatInputRef.current || document.activeElement === lobbyChatInputRef.current;
            const inExternalComposer =
                !inLobbyChatInput &&
                !modalRootRef.current?.contains(target) &&
                (isEditableDomElement(target) || isEditableDomElement(document.activeElement));

            // 1. If we are in CHAT_FOCUS (either typing in `SAY >` or typing in the clicked Matrix chat composer):
            if (focusModeRef.current === "CHAT_FOCUS" || inLobbyChatInput || inExternalComposer) {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    switchFocusMode("WORLD_FOCUS");
                    return;
                }

                // If the user is typing in the external Matrix chat composer, let the key event flow naturally to Element's composer!
                if (activeChatSourceRef.current === "external_chat" || inExternalComposer) {
                    return;
                }

                if (/^F([1-9]|1[0-2])$/.test(e.key)) return;

                // Otherwise the user is in the 3D Lobby's `SAY >` bar: keep focus there and stop LoggedInView from stealing keys
                if (document.activeElement !== lobbyChatInputRef.current && lobbyChatInputRef.current) {
                    lobbyChatInputRef.current.focus();
                }
                e.stopPropagation();
                return;
            }

            // 2. Otherwise we are in WORLD_FOCUS (3D Hunter control):
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                switchFocusMode("CHAT_FOCUS", "lobby_bar");
                return;
            }

            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (activeStationMenu || selectedRemotePlayer) {
                    setActiveStationMenu(null);
                    setSelectedRemotePlayer(null);
                    return;
                }
                onCloseRef.current();
                return;
            }

            if (e.key === "f" || e.key === "F") {
                e.preventDefault();
                e.stopPropagation();
                triggerStationInteract();
                return;
            }

            if (e.key === "1") {
                e.preventDefault();
                e.stopPropagation();
                triggerEmote("wave");
                return;
            }
            if (e.key === "2") {
                e.preventDefault();
                e.stopPropagation();
                triggerEmote("dance");
                return;
            }
            if (e.key === "3") {
                e.preventDefault();
                e.stopPropagation();
                triggerEmote("cheer");
                return;
            }
            if (e.key === "4") {
                e.preventDefault();
                e.stopPropagation();
                triggerEmote("bow");
                return;
            }

            const k = e.key.toLowerCase();
            const isMoveKey =
                k === "w" ||
                k === "a" ||
                k === "s" ||
                k === "d";
            const isCamOrbitKey =
                k === "q" ||
                k === "e" ||
                k === "arrowleft" ||
                k === "arrowright" ||
                k === "arrowup" ||
                k === "arrowdown";
            const isWorldControlKey =
                isMoveKey ||
                isCamOrbitKey ||
                k === "r" ||
                k === "c" ||
                k === "z" ||
                k === "x" ||
                k === " " ||
                e.key === "Home";

            // Always block printable keys in WORLD_FOCUS from bubbling to LoggedInView so pressing random keys never yanks focus out of the 3D Lobby into normal chat!
            if (!isWorldControlKey) {
                if (e.key.length === 1) {
                    e.stopPropagation();
                }
                return;
            }

            // Stop propagation in capture phase so LoggedInView.onKeyDown NEVER redirects W/A/S/D/Z/X/Space to the chat composer!
            e.stopPropagation();
            e.preventDefault();

            if (isMoveKey) {
                clearEmoteIfActive();
            }
            simRef.current.keys.add(k);

            if (e.key === "Home") {
                setIsReShadeMenuOpen((prev) => !prev);
            } else if (k === "r" || k === "c") {
                // Authentic PSO L-Trigger Camera Snap behind the Hunter's back (`pyaw + Math.PI`)
                simRef.current.camTargetYaw = simRef.current.pyaw + Math.PI;
            } else if (k === "z") {
                if (nearbyStationRef.current) {
                    triggerStationInteract(nearbyStationRef.current);
                } else {
                    triggerAttack();
                }
            } else if (k === "x") {
                triggerTechBurst();
            } else if (k === " ") {
                clearEmoteIfActive();
                setInChair((prev) => !prev);
            }
        };

        const onKeyUp = (e: KeyboardEvent): void => {
            const k = e.key.toLowerCase();
            if (simRef.current.keys.has(k)) {
                simRef.current.keys.delete(k);
                e.stopPropagation();
            }
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [activeStationMenu, clearEmoteIfActive, selectedRemotePlayer, switchFocusMode, triggerAttack, triggerEmote, triggerStationInteract, triggerTechBurst]);

    // Broadcast our 3D Lobby position + velocity vector (`vx`, `vz`) to other Matrix room users at 5Hz (200ms) while moving
    // Uses `renderPropsRef` and `onBroadcastLobbyStateRef` so state/emote changes NEVER tear down and restart the interval or re-trigger `requestSync`!
    useEffect(() => {
        let lastSentX = NaN;
        let lastSentZ = NaN;
        let lastSentVx = 0;
        let lastSentVz = 0;
        let lastSentYaw = NaN;
        let lastSentClass = renderPropsRef.current.classId;
        let lastSentWeapon = renderPropsRef.current.weaponId;
        let lastSentChair = renderPropsRef.current.inChair;
        let lastSentEmote = renderPropsRef.current.activeEmote;
        let lastSentAt = 0;

        const computeCurrentVelocity = (): { vx: number; vz: number } => {
            const sim = simRef.current;
            const speed = renderPropsRef.current.inChair ? 7.2 : 5.2;
            let mx = 0;
            let mz = 0;
            if (sim.keys.has("w") || sim.keys.has("arrowup")) mz -= 1;
            if (sim.keys.has("s") || sim.keys.has("arrowdown")) mz += 1;
            if (sim.keys.has("a") || sim.keys.has("arrowleft")) mx -= 1;
            if (sim.keys.has("d") || sim.keys.has("arrowright")) mx += 1;
            if (mx === 0 && mz === 0) return { vx: 0, vz: 0 };
            const moveAngle = Math.atan2(mx, mz) + sim.camYaw;
            return {
                vx: +(Math.sin(moveAngle) * speed).toFixed(2),
                vz: +(Math.cos(moveAngle) * speed).toFixed(2),
            };
        };

        const broadcastNow = (force = false, requestSync = false): void => {
            const broadcastFn = onBroadcastLobbyStateRef.current;
            if (!broadcastFn) return;
            const sim = simRef.current;
            const rp = renderPropsRef.current;
            const now = Date.now();
            const { vx, vz } = computeCurrentVelocity();
            const velocityChanged = Math.hypot(vx - lastSentVx, vz - lastSentVz) > 0.2;
            const stateChanged =
                rp.classId !== lastSentClass ||
                rp.weaponId !== lastSentWeapon ||
                rp.inChair !== lastSentChair ||
                rp.activeEmote !== lastSentEmote;
            const moved =
                Math.hypot(sim.px - lastSentX, sim.pz - lastSentZ) > 0.06 ||
                velocityChanged ||
                Math.abs(sim.pyaw - lastSentYaw) > 0.1 ||
                stateChanged ||
                sim.attackTimer > 0;

            // Send immediately if forced or when velocity/state changes, or every 200ms while moving, or every 10s as an idle heartbeat
            if (!force && !moved && now - lastSentAt < 10000) return;

            lastSentX = sim.px;
            lastSentZ = sim.pz;
            lastSentVx = vx;
            lastSentVz = vz;
            lastSentYaw = sim.pyaw;
            lastSentClass = rp.classId;
            lastSentWeapon = rp.weaponId;
            lastSentChair = rp.inChair;
            lastSentEmote = rp.activeEmote;
            lastSentAt = now;

            broadcastFn({
                x: +sim.px.toFixed(2),
                z: +sim.pz.toFixed(2),
                vx,
                vz,
                yaw: +sim.pyaw.toFixed(2),
                classId: rp.classId,
                weaponId: rp.weaponId,
                inChair: rp.inChair,
                attacking: sim.attackTimer > 0,
                emote: rp.activeEmote,
                requestSync,
                fastTick: !requestSync && !stateChanged && (vx !== 0 || vz !== 0 || velocityChanged),
            });
        };

        // Immediately announce our arrival in the 3D Lobby once on mount and ask other connected clients for their positions
        broadcastNow(true, true);

        const timer = window.setInterval(() => {
            broadcastNow(false, false);
        }, 200);
        return () => window.clearInterval(timer);
    }, []);

    // Main 60FPS WebGL Renderer Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
        if (!gl) return;

        const vsSource = `
            attribute vec3 aPos;
            attribute vec3 aNorm;
            attribute vec3 aCol;
            attribute vec2 aUv;
            uniform mat4 uModel;
            uniform mat4 uView;
            uniform mat4 uProj;
            varying vec3 vNorm;
            varying vec3 vCol;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vec4 world = uModel * vec4(aPos, 1.0);
                vWorldPos = world.xyz;
                vNorm = mat3(uModel) * aNorm;
                vCol = aCol;
                vUv = aUv;
                gl_Position = uProj * uView * world;
            }
        `;

        // Fragment shader includes Echelon's ReShade pipeline (Vibrance, ReflectiveBumpmapping, MagicBloom) + XVM Texture Atlas Sampling
        const fsSource = `
            precision mediump float;
            varying vec3 vNorm;
            varying vec3 vCol;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform vec3 uTint;
            uniform float uVibrance;
            uniform float uReflectiveBump;
            uniform float uMagicBloom;
            uniform float uTime;
            uniform float uAlpha;
            uniform float uHasAtlas;
            uniform sampler2D uAtlasTex;

            void main() {
                vec3 N = normalize(vNorm);
                vec3 L = normalize(vec3(0.45, 0.85, 0.52));
                vec3 V = normalize(vec3(0.0, 5.5, 10.0) - vWorldPos);
                vec3 H = normalize(L + V);

                float diff = max(dot(N, L), 0.0);
                float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
                float spec = pow(max(dot(N, H), 0.0), 24.0) * uReflectiveBump;

                vec3 baseColor = vCol * uTint;
                if (uHasAtlas > 0.5 && vUv.x >= 0.0 && vUv.y >= 0.0) {
                    vec4 texel = texture2D(uAtlasTex, vUv);
                    baseColor = texel.rgb * vCol * uTint;
                } else if (vWorldPos.y < 0.08) {
                    // Pioneer 2 holographic floor rings on procedural deck
                    float r = length(vWorldPos.xz);
                    float grid = abs(sin(r * 3.14159 - uTime * 2.2));
                    if (grid > 0.94) {
                        baseColor += vec3(0.16, 0.55, 0.58);
                    }
                }

                vec3 color = baseColor * (0.44 + diff * 0.64) + vec3(0.28, 0.82, 0.88) * rim * 0.24 + vec3(spec * 0.65);

                // ReShade Vibrance pass
                float luma = dot(color, vec3(0.299, 0.587, 0.114));
                float maxC = max(color.r, max(color.g, color.b));
                float minC = min(color.r, min(color.g, color.b));
                float sat = maxC - minC;
                color = mix(vec3(luma), color, 1.0 + (uVibrance - 1.0) * (1.0 - sat));

                // ReShade MagicBloom pass on bright photon edges
                if (luma > 0.68) {
                    color += (color - 0.68) * uMagicBloom * 0.65;
                }

                gl_FragColor = vec4(clamp(color, 0.0, 1.0), uAlpha);
            }
        `;

        const compileShader = (type: number, src: string): WebGLShader | null => {
            const sh = gl.createShader(type);
            if (!sh) return null;
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            return sh;
        };

        const vs = compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
        const prog = gl.createProgram();
        if (!vs || !fs || !prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const aPos = gl.getAttribLocation(prog, "aPos");
        const aNorm = gl.getAttribLocation(prog, "aNorm");
        const aCol = gl.getAttribLocation(prog, "aCol");
        const aUv = gl.getAttribLocation(prog, "aUv");
        const uModel = gl.getUniformLocation(prog, "uModel");
        const uView = gl.getUniformLocation(prog, "uView");
        const uProj = gl.getUniformLocation(prog, "uProj");
        const uTint = gl.getUniformLocation(prog, "uTint");
        const uVibrance = gl.getUniformLocation(prog, "uVibrance");
        const uReflectiveBump = gl.getUniformLocation(prog, "uReflectiveBump");
        const uMagicBloom = gl.getUniformLocation(prog, "uMagicBloom");
        const uTime = gl.getUniformLocation(prog, "uTime");
        const uAlpha = gl.getUniformLocation(prog, "uAlpha");
        const uHasAtlas = gl.getUniformLocation(prog, "uHasAtlas");
        const uAtlasTex = gl.getUniformLocation(prog, "uAtlasTex");

        const builtins = buildBuiltinGeometries();
        const techMeshes = buildTechEffectMeshes();
        const posBuf = gl.createBuffer();
        const normBuf = gl.createBuffer();
        const colBuf = gl.createBuffer();
        const uvBuf = gl.createBuffer();
        const meshAtlasTexCache = new WeakMap<CustomMeshGeometry, WebGLTexture>();

        const drawMesh = (
            mesh: CustomMeshGeometry,
            modelMat: Float32Array,
            tint: [number, number, number] = [1, 1, 1],
            alpha = 0.96,
        ): void => {
            gl.uniformMatrix4fv(uModel, false, modelMat);
            gl.uniform3f(uTint, tint[0], tint[1], tint[2]);
            gl.uniform1f(uAlpha, alpha);

            if (mesh.atlasPixels && mesh.atlasWidth && mesh.atlasHeight) {
                let glTex = meshAtlasTexCache.get(mesh);
                if (!glTex) {
                    const created = gl.createTexture();
                    if (created) {
                        gl.bindTexture(gl.TEXTURE_2D, created);
                        gl.texImage2D(
                            gl.TEXTURE_2D,
                            0,
                            gl.RGBA,
                            mesh.atlasWidth,
                            mesh.atlasHeight,
                            0,
                            gl.RGBA,
                            gl.UNSIGNED_BYTE,
                            mesh.atlasPixels,
                        );
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                        glTex = created;
                        meshAtlasTexCache.set(mesh, created);
                    }
                }
                if (glTex) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, glTex);
                    gl.uniform1i(uAtlasTex, 0);
                    gl.uniform1f(uHasAtlas, 1.0);
                } else {
                    gl.uniform1f(uHasAtlas, 0.0);
                }
            } else {
                gl.uniform1f(uHasAtlas, 0.0);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aNorm);
            gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aCol);
            gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

            if (aUv >= 0 && mesh.uvs && mesh.uvs.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
                gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW);
                gl.enableVertexAttribArray(aUv);
                gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
            } else if (aUv >= 0) {
                gl.disableVertexAttribArray(aUv);
                gl.vertexAttrib2f(aUv, -1, -1);
            }

            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
        };

        let animId = 0;
        let lastTime = performance.now();
        let lastHudSync = 0;

        const render = (now: number): void => {
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            const sim = simRef.current;

            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = Math.max(1, Math.floor(rect.width * dpr));
            const h = Math.max(1, Math.floor(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            gl.viewport(0, 0, w, h);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0.02, 0.09, 0.13, 0.84);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            const rpState = renderPropsRef.current;

            // Helper: sample walkable floor height from authentic PSOBB `c.rel` collision triangles!
            const sampleFloorHeight = (tx: number, tz: number, curY: number): { y: number; hasFloor: boolean } => {
                const tris = loadedStageCollisionRef.current;
                if (!tris.length) return { y: 0, hasFloor: true };
                let bestY = -999;
                let found = false;
                let fallbackY = -999;
                let foundFallback = false;
                for (let i = 0; i < tris.length; i++) {
                    const t = tris[i];
                    if (t.ny < 0.52) continue;
                    const x0 = t.v0[0], z0 = t.v0[2];
                    const x1 = t.v1[0], z1 = t.v1[2];
                    const x2 = t.v2[0], z2 = t.v2[2];
                    const denom = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
                    if (Math.abs(denom) < 1e-6) continue;
                    const u = ((z1 - z2) * (tx - x2) + (x2 - x1) * (tz - z2)) / denom;
                    if (u < -0.04 || u > 1.04) continue;
                    const v = ((z2 - z0) * (tx - x2) + (x0 - x2) * (tz - z2)) / denom;
                    if (v < -0.04 || u + v > 1.04) continue;
                    const wB = 1 - u - v;
                    const y = u * t.v0[1] + v * t.v1[1] + wB * t.v2[1];
                    if (y <= curY + 1.5 && y > bestY) {
                        bestY = y;
                        found = true;
                    }
                    if (y <= curY + 4.5 && y > fallbackY) {
                        fallbackY = y;
                        foundFallback = true;
                    }
                }
                if (found) return { y: bestY, hasFloor: true };
                if (foundFallback) return { y: fallbackY, hasFloor: true };
                return { y: curY, hasFloor: false };
            };

            // Update player movement (WASD moves Hunter; Q/E + Arrow keys + Right/Middle-drag spin/tilt PSO camera!)
            const speed = rpState.inChair ? 7.2 : 5.2;
            let mx = 0;
            let mz = 0;
            if (sim.keys.has("w")) mz -= 1;
            if (sim.keys.has("s")) mz += 1;
            if (sim.keys.has("a")) mx -= 1;
            if (sim.keys.has("d")) mx += 1;

            // Camera spin (PSO Left/Right camera rotation + Pitch tilt + L-Trigger snap behind character)
            if (sim.keys.has("q") || sim.keys.has("arrowleft")) {
                sim.camYaw -= 2.1 * dt;
                sim.camTargetYaw = null;
            }
            if (sim.keys.has("e") || sim.keys.has("arrowright")) {
                sim.camYaw += 2.1 * dt;
                sim.camTargetYaw = null;
            }
            if (sim.keys.has("arrowup")) {
                sim.camPitch = Math.min(0.65, sim.camPitch + 1.1 * dt);
            }
            if (sim.keys.has("arrowdown")) {
                sim.camPitch = Math.max(0.05, sim.camPitch - 1.1 * dt);
            }
            if (sim.camTargetYaw !== null) {
                const diff = Math.atan2(Math.sin(sim.camTargetYaw - sim.camYaw), Math.cos(sim.camTargetYaw - sim.camYaw));
                if (Math.abs(diff) < 0.015) {
                    sim.camYaw = sim.camTargetYaw;
                    sim.camTargetYaw = null;
                } else {
                    sim.camYaw += diff * Math.min(1, dt * 12);
                }
            }

            if (mx !== 0 || mz !== 0) {
                if (activeEmoteRef.current !== "none") {
                    activeEmoteRef.current = "none";
                    setActiveEmote("none");
                }
                const moveAngle = Math.atan2(mx, mz) + sim.camYaw;
                const nextX = sim.px + Math.sin(moveAngle) * speed * dt;
                const nextZ = sim.pz + Math.cos(moveAngle) * speed * dt;
                sim.pyaw = moveAngle;

                if (loadedStageCollisionRef.current.length > 0) {
                    const hit = sampleFloorHeight(nextX, nextZ, sim.py);
                    if (hit.hasFloor) {
                        sim.px = nextX;
                        sim.pz = nextZ;
                        sim.py += (hit.y - sim.py) * Math.min(1, dt * 16);
                    } else {
                        // Allow sliding along X or Z if hitting a wall boundary, or clamp within 26 units
                        const hitX = sampleFloorHeight(nextX, sim.pz, sim.py);
                        const hitZ = sampleFloorHeight(sim.px, nextZ, sim.py);
                        if (hitX.hasFloor) {
                            sim.px = nextX;
                            sim.py = hitX.y;
                        } else if (hitZ.hasFloor) {
                            sim.pz = nextZ;
                            sim.py = hitZ.y;
                        } else if (Math.hypot(nextX, nextZ) < 26) {
                            sim.px = nextX;
                            sim.pz = nextZ;
                        }
                    }
                } else {
                    sim.px = nextX;
                    sim.pz = nextZ;
                    sim.py = 0;
                    const distFromCenter = Math.hypot(sim.px, sim.pz);
                    if (distFromCenter > 12.2) {
                        sim.px = (sim.px / distFromCenter) * 12.2;
                        sim.pz = (sim.pz / distFromCenter) * 12.2;
                    }
                }
            } else if (loadedStageCollisionRef.current.length > 0) {
                const hit = sampleFloorHeight(sim.px, sim.pz, sim.py);
                if (hit.hasFloor) {
                    sim.py += (hit.y - sim.py) * Math.min(1, dt * 12);
                }
            } else {
                sim.py = 0;
            }

            if (sim.attackTimer > 0) sim.attackTimer = Math.max(0, sim.attackTimer - dt);
            if (sim.techBurstTimer > 0) sim.techBurstTimer = Math.max(0, sim.techBurstTimer - dt);

            // Respawn broken boxes
            for (const box of sim.boxes) {
                if (box.hp <= 0 && now >= box.respawnAt) {
                    box.hp = box.maxHp;
                }
                box.rotY += dt * 0.4;
            }

            // Camera Matrices — Authentic PSO Episode I & II Over-the-Shoulder / Over-the-Head Camera Rig
            // In PSO, the camera hovers slightly above the character's head (~2.45 units off the ground) at a shallow
            // downward pitch (~11°–13°) looking at shoulder/head height (`sim.py + 1.48`), and can freely spin 360°!
            const horizDist = Math.cos(sim.camPitch) * sim.camDist;
            const vertDist = Math.sin(sim.camPitch) * sim.camDist;
            const eye: [number, number, number] = [
                sim.px + Math.sin(sim.camYaw) * horizDist,
                sim.py + 1.55 + vertDist,
                sim.pz + Math.cos(sim.camYaw) * horizDist,
            ];
            const center: [number, number, number] = [sim.px, sim.py + 1.45, sim.pz];
            const viewMat = mat4LookAt(eye, center, [0, 1, 0]);
            const projMat = mat4Perspective((50 * Math.PI) / 180, w / h, 0.1, 260.0);

            gl.uniformMatrix4fv(uView, false, viewMat);
            gl.uniformMatrix4fv(uProj, false, projMat);
            gl.uniform1f(uTime, now * 0.001);
            gl.uniform1f(uVibrance, rpState.reShade.enabled ? rpState.reShade.vibrance : 1.0);
            gl.uniform1f(uReflectiveBump, rpState.reShade.enabled ? rpState.reShade.reflectiveBump : 0.2);
            gl.uniform1f(uMagicBloom, rpState.reShade.enabled ? rpState.reShade.magicBloom : 0.0);

            // 1. Draw Authentic PSOBB `.rel` Stage or Pioneer 2 Procedural Deck
            const activeStageMesh = loadedStageMeshRef.current ?? builtins.stage;
            drawMesh(
                activeStageMesh,
                mat4TRS(0, 0, 0, 0, 0, 1, 1, 1),
                rpState.reShade.khOverhaulMode ? [0.95, 0.78, 1.15] : [1, 1, 1],
            );

            // 1B. Draw Stage Objects & Aircars dynamically from `gamePackRef.current` (compiled from `map_city00_00o.dat`)
            if (rpState.stageId === "bb_city00") {
                const cObjs = loadedCityObjectsRef.current;
                const activePack = gamePackRef.current;
                for (const obj of activePack.cityStageObjects) {
                    const mesh = cObjs[obj.kind];
                    if (!mesh) continue;
                    const dyaw = (obj.yawDeg * Math.PI) / 180;
                    if (obj.kind === "shopdoor" || obj.kind === "hunter_door" || obj.kind === "med_door") {
                        const dist = Math.hypot(sim.px - obj.x, sim.pz - obj.z);
                        const openAmt = dist < 4.5 ? Math.min(1, (4.5 - dist) / 2.2) : 0;
                        drawMesh(mesh, mat4TRS(obj.x, obj.y + openAmt * 2.6, obj.z, dyaw, 0, 1, 1, 1));
                    } else {
                        drawMesh(mesh, mat4TRS(obj.x, obj.y, obj.z, dyaw, 0, 1, 1, 1));
                    }
                }
                if (cObjs.aircar) {
                    for (const lane of activePack.cityAircarLanes) {
                        const span = Math.abs(lane.z1 - lane.z0);
                        const progT = ((now * 0.001 * lane.speed + lane.phase * 10) % span) / span;
                        const az = lane.z0 + (lane.z1 - lane.z0) * progT;
                        const ay = lane.y + Math.sin(now * 0.002 + lane.phase) * 0.25;
                        const ayaw = lane.dir > 0 ? 0 : Math.PI;
                        drawMesh(cObjs.aircar, mat4TRS(lane.x, ay, az, ayaw, 0, 1, 1, 1));
                    }
                }
            }

            // 2. Draw Breakable PSO Item Boxes / KH Chests / Rappy (Combat Stages & Holodeck only — not inside Pioneer 2 City or Visual Lobby!)
            if (rpState.stageId !== "bb_city00" && rpState.stageId !== "bb_lobby_01") {
                for (const box of sim.boxes) {
                    if (box.hp <= 0) continue;
                    const mesh =
                        rpState.reShade.khOverhaulMode && box.kind === "green_box"
                            ? builtins.kh_chest
                            : builtins[box.kind] ?? builtins.green_box;
                    const boxFloorY =
                        loadedStageCollisionRef.current.length > 0 ? sampleFloorHeight(box.x, box.z, sim.py).y : 0;
                    drawMesh(mesh, mat4TRS(box.x, boxFloorY, box.z, box.rotY, 0, 1, 1, 1));
                }
            }

            // Helper to draw a Hunter + Orbiting MAG + Weapon + Chair (supports both Authentic PSOBB `.nj` Class Models and Articulated Limbs + Hologram Ghost Mode!)
            const classColors: Record<PsoClassModelId, [number, number, number]> = {
                humar: [1.0, 0.42, 0.35],
                hunewearl: [0.98, 0.44, 0.68],
                hucast: [0.45, 0.78, 1.0],
                hucaseal: [0.88, 0.32, 0.46],
                ramar: [0.38, 0.72, 0.45],
                ramarl: [0.38, 0.92, 0.58],
                racast: [0.95, 0.72, 0.28],
                racaseal: [0.96, 0.78, 0.88],
                fomar: [0.36, 0.62, 0.98],
                fomarl: [0.94, 0.86, 0.54],
                fonewm: [0.72, 0.48, 0.96],
                fonewearl: [0.95, 0.48, 0.85],
            };

            const drawCharacter = (
                x: number,
                y: number,
                z: number,
                yaw: number,
                cId: PsoClassModelId,
                wId: PsoWeaponModelId,
                sitting: boolean,
                swinging: boolean,
                moving = false,
                emote: PsoLobbyEmoteId = "none",
                charName = "Hunter",
                ghostMode = false,
                isNpc = false,
                npcModelId?: PsoNpcModelId,
            ): void => {
                const secId = computePsoSectionId(charName);
                const walkCycle = moving && !sitting ? now * 0.015 : 0;
                const walkBob = moving && !sitting ? Math.abs(Math.sin(walkCycle)) * 0.12 : 0;
                const emoteDanceSpin = emote === "dance" && !moving ? now * 0.006 : 0;
                const emoteCheerJump = emote === "cheer" && !moving ? Math.abs(Math.sin(now * 0.01)) * 0.35 : 0;
                const emoteBowPitch = emote === "bow" && !moving ? 0.48 : 0;

                const bodyYaw = yaw + emoteDanceSpin;
                const baseY = y + (sitting ? 0.15 : 0) + walkBob + emoteCheerJump;
                const sinY = Math.sin(bodyYaw);
                const cosY = Math.cos(bodyYaw);

                // Hologram Ghost / Standby Shader Tint & Alpha when a Hunter closes their 3D window!
                const alpha = ghostMode ? 0.46 + Math.sin(now * 0.005) * 0.1 : 0.96;
                const ghostTint: [number, number, number] = [0.42, 0.98, 0.96];
                const charTint: [number, number, number] = ghostMode
                    ? ghostTint
                    : classColors[cId] ?? [1, 1, 1];

                if (sitting) {
                    const chairMesh = loadedPhotonChairRef.current ?? builtins.chair;
                    const chairY = loadedPhotonChairRef.current ? y + 0.42 : y;
                    drawMesh(
                        chairMesh,
                        mat4TRS(x, chairY, z, bodyYaw, 0, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );
                }

                const realClassMesh = rpState.useRealClassNj
                    ? isNpc && npcModelId
                        ? loadedNpcMeshesRef.current[npcModelId] ?? loadedClassMeshesRef.current[cId]
                        : loadedClassMeshesRef.current[cId]
                    : undefined;
                const legSwing = moving && !sitting ? Math.sin(walkCycle) * 0.68 : sitting ? -1.1 : 0;
                const lShX = x - cosY * 0.44;
                const lShZ = z + sinY * 0.44;
                const rShX = x + cosY * 0.44;
                const rShZ = z - sinY * 0.44;

                let lArmPitch = moving && !sitting ? -legSwing * 0.85 : 0;
                let rArmPitch = moving && !sitting ? legSwing * 0.85 : 0;
                if (emote === "wave" && !moving) {
                    rArmPitch = -2.4 + Math.sin(now * 0.015) * 0.45;
                } else if (emote === "cheer" && !moving) {
                    lArmPitch = -2.6;
                    rArmPitch = -2.6;
                } else if (emote === "dance" && !moving) {
                    lArmPitch = -1.4 + Math.sin(now * 0.014) * 0.8;
                    rArmPitch = -1.4 - Math.sin(now * 0.014) * 0.8;
                }
                if (swinging) {
                    rArmPitch = -1.1 + Math.sin(now * 0.028) * 1.25;
                }

                const isNonCombatHub = rpState.stageId === "bb_city00" || rpState.stageId === "bb_lobby_01";

                if (realClassMesh) {
                    // Render Authentic PSOBB `pl*bdy00.nj` + `pl*hed00.nj` + `pl*hai00.nj` (or `bm_n_*_body.bml` NPC) with 64-Bone `.njm` Skeletal Animations!
                    const meshTint: [number, number, number] = ghostMode ? ghostTint : [1, 1, 1];
                    const motions = loadedMotionsRef.current;
                    const isFemaleClass =
                        cId === "hunewearl" ||
                        cId === "hucaseal" ||
                        cId === "ramarl" ||
                        cId === "racaseal" ||
                        cId === "fomarl" ||
                        cId === "fonewearl";
                    const isForceClass =
                        cId === "fomar" || cId === "fomarl" || cId === "fonewm" || cId === "fonewearl";
                    const g3 = isForceClass ? "f" : isFemaleClass ? "w" : "m";
                    const g2 = isFemaleClass ? "w" : "m";

                    let motName = `mot_wait_town_${g3}`;
                    let animFps = 22;
                    let phaseOffset = (charName.charCodeAt(0) || 0) * 3.7;
                    let customAnimFrame: number | null = null;

                    if (isNpc) {
                        if (moving) {
                            motName = "mot_npc_town_1";
                            animFps = 26;
                        } else {
                            // Pioneer 2 Town NPCs cycle between calm standing (`mot_npc_town_0`) and conversational gestures (`mot_npc_town_2`/`3`)
                            const cycle = Math.floor((now * 0.00025 + (charName.charCodeAt(0) || 0)) % 5);
                            if (cycle === 3 && motions.mot_npc_town_2) {
                                motName = "mot_npc_town_2";
                                animFps = 18;
                            } else if (cycle === 4 && motions.mot_npc_town_3) {
                                motName = "mot_npc_town_3";
                                animFps = 18;
                            } else {
                                motName = "mot_npc_town_0";
                                animFps = 18;
                            }
                        }
                    } else if (sitting) {
                        motName = `mot_sit_${g2}`;
                        animFps = 18;
                    } else if (swinging) {
                        const step = sim.comboStep === 3 ? 3 : sim.comboStep === 2 ? 2 : 1;
                        motName = `mot_atk${step}_${g3}`;
                        const motEntry = motions[motName];
                        const prog = Math.min(1, Math.max(0, 1.0 - sim.attackTimer / 0.36));
                        if (motEntry) {
                            customAnimFrame = prog * (motEntry.nbFrame - 1);
                        }
                    } else if (sim.techBurstTimer > 0 && charName === rpState.localDisplayName) {
                        // The FOmarl/FOnewearl skeleton has its own cast motion; male Forces use the male one.
                        motName = `mot_cast_${cId === "fomarl" || cId === "fonewearl" ? "f" : g2}`;
                        const motEntry = motions[motName];
                        const prog = Math.min(1, Math.max(0, 1.0 - sim.techBurstTimer / sim.techCastTotal));
                        if (motEntry) {
                            customAnimFrame = prog * (motEntry.nbFrame - 1);
                        }
                    } else if (!moving && emote !== "none") {
                        motName = `mot_${emote}_${g2}`;
                        animFps = 28;
                        phaseOffset = 0;
                    } else if (moving) {
                        motName = isNonCombatHub ? `mot_walk_town_${g3}` : `mot_run_${g3}`;
                        animFps = isNonCombatHub ? 32 : 36;
                    } else {
                        motName = isNonCombatHub ? `mot_wait_town_${g3}` : `mot_wait_battle_${g3}`;
                        animFps = 20;
                    }

                    const activeMot =
                        motions[motName] ??
                        motions[`mot_wait_town_${g2}`] ??
                        motions.mot_wait_town_m;

                    if (realClassMesh.skeleton && activeMot) {
                        const frameVal =
                            customAnimFrame !== null
                                ? customAnimFrame
                                : (now * 0.001 * animFps + phaseOffset) % activeMot.nbFrame;
                        applySegaNinjaMotion(realClassMesh, activeMot.buf, frameVal, motName);
                        const skelY = sitting ? y + 0.08 : y;
                        drawMesh(
                            realClassMesh,
                            mat4TRS(x, skelY, z, yaw, 0, 1, 1, 1),
                            meshTint,
                            alpha,
                        );
                    } else {
                        const parts = realClassMesh.articulatedParts;
                        if (parts) {
                            const strideTilt = moving && !sitting ? Math.sin(walkCycle) * 0.05 : emoteBowPitch;
                            drawMesh(parts.torsoHead, mat4TRS(x, baseY, z, bodyYaw, strideTilt, 1, 1, 1), meshTint, alpha);
                            drawMesh(
                                parts.leftLeg,
                                mat4TRS(x, baseY + parts.hipY, z, bodyYaw, legSwing, 1, 1, 1),
                                meshTint,
                                alpha,
                            );
                            drawMesh(
                                parts.rightLeg,
                                mat4TRS(x, baseY + parts.hipY, z, bodyYaw, sitting ? -1.1 : -legSwing, 1, 1, 1),
                                meshTint,
                                alpha,
                            );
                            const lArmPivotX = x + cosY * parts.shoulderX + sinY * parts.shoulderZ;
                            const lArmPivotZ = z - sinY * parts.shoulderX + cosY * parts.shoulderZ;
                            const rArmPivotX = x - cosY * parts.shoulderX + sinY * parts.shoulderZ;
                            const rArmPivotZ = z + sinY * parts.shoulderX + cosY * parts.shoulderZ;
                            drawMesh(
                                parts.leftArm,
                                mat4TRS(lArmPivotX, baseY + parts.shoulderY, lArmPivotZ, bodyYaw, lArmPitch, 1, 1, 1),
                                meshTint,
                                alpha,
                            );
                            drawMesh(
                                parts.rightArm,
                                mat4TRS(rArmPivotX, baseY + parts.shoulderY, rArmPivotZ, bodyYaw, rArmPitch, 1, 1, 1),
                                meshTint,
                                alpha,
                            );
                        } else {
                            const strideTilt = moving && !sitting ? Math.sin(walkCycle) * 0.08 : emoteBowPitch;
                            drawMesh(
                                realClassMesh,
                                mat4TRS(x, baseY, z, bodyYaw, strideTilt, 1, 1, 1),
                                meshTint,
                                alpha,
                            );
                        }
                    }
                } else {
                    // 1. Articulated Torso + Authentic Section ID Badge on Chest!
                    drawMesh(
                        builtins.hunter_torso,
                        mat4TRS(x, baseY, z, bodyYaw, emoteBowPitch, 1, 1, 1),
                        charTint,
                        alpha,
                    );
                    drawMesh(
                        builtins.hunter_badge,
                        mat4TRS(x, baseY, z, bodyYaw, emoteBowPitch, 1, 1, 1),
                        ghostMode ? ghostTint : secId.rgb,
                        alpha,
                    );

                    // 2. Articulated Head
                    const headYaw = bodyYaw + (moving ? 0 : Math.sin(now * 0.002) * 0.12);
                    drawMesh(
                        builtins.hunter_head,
                        mat4TRS(x, baseY + 1.68, z, headYaw, emoteBowPitch, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );

                    // 3. Articulated Left & Right Legs
                    const lHipX = x - cosY * 0.21;
                    const lHipZ = z + sinY * 0.21;
                    const rHipX = x + cosY * 0.21;
                    const rHipZ = z - sinY * 0.21;
                    drawMesh(
                        builtins.hunter_leg,
                        mat4TRS(lHipX, baseY + 0.85, lHipZ, bodyYaw, legSwing, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );
                    drawMesh(
                        builtins.hunter_leg,
                        mat4TRS(rHipX, baseY + 0.85, rHipZ, bodyYaw, sitting ? -1.1 : -legSwing, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );

                    // 4. Articulated Left & Right Arms
                    drawMesh(
                        builtins.hunter_arm,
                        mat4TRS(lShX, baseY + 1.54, lShZ, bodyYaw, lArmPitch, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );
                    drawMesh(
                        builtins.hunter_arm,
                        mat4TRS(rShX, baseY + 1.54, rShZ, bodyYaw, rArmPitch, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );
                }

                // 5. Orbiting Evolution 3D MAG (Playable Hunters only — Pioneer 2 NPCs never have MAGs!)
                if (!isNpc) {
                    const magAngle = now * 0.0026;
                    const magX = x + Math.cos(magAngle) * 0.78;
                    const magZ = z + Math.sin(magAngle) * 0.78;
                    drawMesh(
                        builtins.mag_wing,
                        mat4TRS(magX, baseY + 1.88 + Math.sin(now * 0.005) * 0.1, magZ, magAngle + Math.PI * 0.5, 0, 1, 1, 1),
                        ghostMode ? ghostTint : secId.rgb,
                        alpha,
                    );
                }

                // 6. Equipped 3D Weapon in Right Hand (Playable Hunters in Ragol combat zones or when swinging — never held by NPCs or while walking in Pioneer 2 / Visual Lobby!)
                if (!isNpc && (!isNonCombatHub || swinging)) {
                    const weaponMesh = customWeaponMeshRef.current ?? builtins[wId] ?? builtins.photon_saber;
                    const swingYaw = swinging ? bodyYaw + Math.sin(now * 0.025) * 1.35 : bodyYaw;
                    const rh = realClassMesh?.skeleton?.rightHandPos;
                    let wx: number;
                    let wy: number;
                    let wz: number;
                    if (rh) {
                        const sinBaseY = Math.sin(yaw);
                        const cosBaseY = Math.cos(yaw);
                        wx = x + rh[0] * cosBaseY + rh[2] * sinBaseY;
                        wy = y + rh[1];
                        wz = z - rh[0] * sinBaseY + rh[2] * cosBaseY;
                    } else {
                        const handForward = Math.sin(-rArmPitch) * 0.52;
                        const handDown = Math.cos(rArmPitch) * 0.52;
                        wx = rShX + sinY * handForward;
                        wy = baseY + 1.54 - handDown;
                        wz = rShZ + cosY * handForward;
                    }
                    drawMesh(
                        weaponMesh,
                        mat4TRS(wx, wy, wz, swingYaw, swinging ? 0.55 : 0.15 + rArmPitch * 0.5, 1, 1, 1),
                        ghostMode ? ghostTint : [1, 1, 1],
                        alpha,
                    );
                }
            };

            // 3. Draw Local Player
            const localIsMoving = mx !== 0 || mz !== 0;
            const localSecId = computePsoSectionId(rpState.localDisplayName);
            drawCharacter(
                sim.px,
                sim.py,
                sim.pz,
                sim.pyaw,
                rpState.classId,
                rpState.reShade.khOverhaulMode ? "kingdom_key" : rpState.weaponId,
                rpState.inChair,
                sim.attackTimer > 0,
                localIsMoving,
                rpState.activeEmote,
                rpState.localDisplayName,
                false,
            );

            // 4. Draw Remote Matrix Players (with real-time velocity dead-reckoning + 60FPS articulated walking stride + Hologram Ghost Mode!)
            const labels: Array<{
                id: string;
                name: string;
                x: number;
                y: number;
                color: string;
                symbolText?: string;
                chatText?: string;
                sectionId?: { name: PsoSectionIdName; color: string };
                remotePlayer?: PsoRemoteLobbyPlayer;
                ghostMode?: boolean;
            }> = [];
            const nowWall = Date.now();
            const selfBubble =
                rpState.localSpeechBubble && nowWall - rpState.localSpeechBubble.sentAt < 8000
                    ? rpState.localSpeechBubble.text
                    : rpState.speechBubbles[rpState.localUserId] &&
                        nowWall - rpState.speechBubbles[rpState.localUserId].sentAt < 8000
                      ? rpState.speechBubbles[rpState.localUserId].text
                      : undefined;

            const selfProj = projectToScreen([sim.px, sim.py + 2.55, sim.pz], viewMat, projMat, rect.width, rect.height);
            if (selfProj.visible) {
                labels.push({
                    id: rpState.localUserId || "self",
                    name: `${rpState.localDisplayName} [Lv98]`,
                    x: selfProj.x,
                    y: selfProj.y,
                    color: "#50f296",
                    symbolText: rpState.activeSymbolChat?.spec.name,
                    chatText: selfBubble,
                    sectionId: { name: localSecId.name, color: localSecId.color },
                });
            }

            for (const rp of rpState.remotePlayers) {
                if (rp.userId === rpState.localUserId) continue;
                let interp = sim.remoteInterp[rp.userId];
                const isGhost = Boolean(rp.ghostMode);
                // Extrapolate remote player's current target using their live velocity vector (`vx`, `vz`) up to 350ms ahead!
                const ageSec = isGhost ? 0 : Math.min(0.35, Math.max(0, (nowWall - rp.lastUpdated) / 1000));
                const predX = rp.x + (rp.vx ?? 0) * ageSec;
                const predZ = rp.z + (rp.vz ?? 0) * ageSec;
                const hasVelocity = !isGhost && Math.hypot(rp.vx ?? 0, rp.vz ?? 0) > 0.2;

                let remoteMoving = hasVelocity;
                if (!interp) {
                    interp = { x: predX, z: predZ, yaw: rp.yaw };
                    sim.remoteInterp[rp.userId] = interp;
                } else {
                    const dx = predX - interp.x;
                    const dz = predZ - interp.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist > 0.03) {
                        remoteMoving = !isGhost;
                        const walkSpeed = Math.max(rp.inChair ? 7.2 : 5.4, dist * 3.5);
                        const step = Math.min(dist, walkSpeed * dt);
                        interp.x += (dx / dist) * step;
                        interp.z += (dz / dist) * step;
                        const moveYaw = Math.atan2(dx, dz);
                        const yawDiff = Math.atan2(Math.sin(moveYaw - interp.yaw), Math.cos(moveYaw - interp.yaw));
                        interp.yaw += yawDiff * Math.min(1, dt * 14);
                    } else {
                        interp.x = predX;
                        interp.z = predZ;
                        const yawDiff = Math.atan2(Math.sin(rp.yaw - interp.yaw), Math.cos(rp.yaw - interp.yaw));
                        interp.yaw += yawDiff * Math.min(1, dt * 10);
                    }
                }
                const remoteFloor = loadedStageCollisionRef.current.length > 0
                    ? sampleFloorHeight(interp.x, interp.z, sim.py).y
                    : 0;
                const remoteSecId = computePsoSectionId(rp.displayName);
                drawCharacter(
                    interp.x,
                    remoteFloor,
                    interp.z,
                    interp.yaw,
                    rp.classId,
                    rp.weaponId,
                    rp.inChair,
                    rp.attacking,
                    remoteMoving,
                    rp.emote ?? "none",
                    rp.displayName,
                    isGhost,
                );
                const p = projectToScreen([interp.x, remoteFloor + 2.55, interp.z], viewMat, projMat, rect.width, rect.height);
                const remoteBubble =
                    rpState.speechBubbles[rp.userId] && nowWall - rpState.speechBubbles[rp.userId].sentAt < 8000
                        ? rpState.speechBubbles[rp.userId].text
                        : undefined;
                if (p.visible) {
                    labels.push({
                        id: rp.userId,
                        name: isGhost ? `👻 ${rp.displayName} [STANDBY]` : rp.displayName,
                        x: p.x,
                        y: p.y,
                        color: isGhost ? "#7cf6ff" : "#8ae3dd",
                        symbolText: rp.symbolSpec?.name,
                        chatText: remoteBubble,
                        sectionId: { name: remoteSecId.name, color: remoteSecId.color },
                        remotePlayer: rp,
                        ghostMode: isGhost,
                    });
                }
            }

            // 4b. Technique effects (additive, no depth writes so overlapping glows stack)
            sim.techEffects = sim.techEffects.filter((fx) => isTechEffectAlive(fx, now));
            if (sim.techEffects.length > 0) {
                gl.depthMask(false);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                for (const fx of sim.techEffects) {
                    for (const c of sampleTechEffect(fx, now)) {
                        drawMesh(techMeshes[c.mesh], mat4TRS(c.x, c.y, c.z, c.yaw, c.pitch, c.sx, c.sy, c.sz), c.tint, c.alpha);
                    }
                }
                gl.depthMask(true);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            }

            // 5. Project Station Markers & Teleporters dynamically from `gamePackRef.current` (compiled from `map_city00_00o.dat`)
            const activePack = gamePackRef.current;
            const guildStations =
                activePack.stationsByStage[rpState.stageId] ??
                activePack.stationsByStage.default ??
                [];

            // Draw glowing 3D Teleporter Pads on Pioneer 2 & Ragol stages so both teleporters are unmistakable!
            for (const st of guildStations) {
                if (
                    st.id === "teleporter_pad" ||
                    st.id === "principal_warp_to_office" ||
                    st.id === "principal_warp_to_city"
                ) {
                    const padTint: [number, number, number] =
                        st.id === "principal_warp_to_office" ? [0.78, 0.45, 1.0] : [0.22, 0.96, 0.58];
                    drawMesh(
                        builtins.mag_wing,
                        mat4TRS(st.x, 0.12 + Math.sin(now * 0.004) * 0.05, st.z, now * 0.002, 0, 2.8, 0.4, 2.8),
                        padTint,
                        0.85,
                    );
                }
            }

            let closestStation: PsoGuildStationId | null = null;
            let closestDist = Infinity;
            for (const st of guildStations) {
                const d = Math.hypot(sim.px - st.x, sim.pz - st.z);
                if (d <= st.radius && d < closestDist) {
                    closestDist = d;
                    closestStation = st.id;
                }
                if (d < 42) {
                    const sp = projectToScreen([st.x, st.y, st.z], viewMat, projMat, rect.width, rect.height);
                    if (sp.visible) {
                        labels.push({
                            id: `station-${st.id}`,
                            name: st.title,
                            x: sp.x,
                            y: sp.y,
                            color: st.color,
                        });
                    }
                }
            }
            if (nearbyStationRef.current !== closestStation) {
                nearbyStationRef.current = closestStation;
                setNearbyStation(closestStation);
            }

            // 6. Render NPC Placements dynamically from `gamePackRef.current` (compiled from `map_city00_00e*.dat`)
            if (rpState.stageId === "bb_city00" && rpState.spawnBots) {
                const evtMode = rpState.cityEventLayout;
                const pioneer2Npcs =
                    activePack.cityNpcLayouts[evtMode] ??
                    activePack.cityNpcLayouts.e ??
                    [];
                for (const npc of pioneer2Npcs) {
                    const distToPlayer = Math.hypot(sim.px - npc.x, sim.pz - npc.z);
                    if (distToPlayer > 65) continue;
                    let nx = npc.x;
                    let nz = npc.z;
                    let npcYaw = (npc.yawDeg * Math.PI) / 180;
                    let npcMoving = false;

                    // Authentic Pioneer 2 wandering citizen patrol (`f40 > 0` in `map_city00_00e.dat`):
                    // Citizens walk short back-and-forth patrols using `mot_npc_town_1.njm` and pause in `mot_npc_town_0.njm`
                    if (npc.wanderRadius && npc.wanderRadius > 0) {
                        const seed = (npc.id.charCodeAt(npc.id.length - 1) || 1) * 1.9;
                        const patrolDist = Math.min(1.6, npc.wanderRadius * 0.055);
                        const cycleT = (now * 0.00042 + seed) % (Math.PI * 2);
                        const rawSin = Math.sin(cycleT);
                        const rawCos = Math.cos(cycleT);
                        // Pause briefly at both ends of the patrol when |cos| < 0.28
                        npcMoving = Math.abs(rawCos) >= 0.28;
                        const dirX = Math.sin(npcYaw);
                        const dirZ = Math.cos(npcYaw);
                        nx = npc.x + dirX * rawSin * patrolDist;
                        nz = npc.z + dirZ * rawSin * patrolDist;
                        if (rawCos < 0) {
                            npcYaw += Math.PI;
                        }
                    }

                    drawCharacter(
                        nx,
                        npc.y,
                        nz,
                        npcYaw,
                        npc.c,
                        "photon_saber",
                        false,
                        false,
                        npcMoving,
                        "none",
                        npc.name,
                        false,
                        true,
                        npc.npcModelId,
                    );
                    if (distToPlayer < 26) {
                        const p = projectToScreen([nx, npc.y + 2.55, nz], viewMat, projMat, rect.width, rect.height);
                        if (p.visible) {
                            labels.push({
                                id: npc.id,
                                name: npc.name,
                                x: p.x,
                                y: p.y,
                                color: "#ffe26a",
                            });
                        }
                    }
                }
            }

            if (rpState.spawnBots && rpState.stageId !== "bb_city00") {
                const t = now * 0.0007;
                const bots: Array<{
                    id: string;
                    name: string;
                    x: number;
                    z: number;
                    yaw: number;
                    c: PsoClassModelId;
                    w: PsoWeaponModelId;
                    chair: boolean;
                }> = [
                    {
                        id: "bot-ash",
                        name: "ASH [HUmar Lv124]",
                        x: Math.cos(t) * 3.2,
                        z: Math.sin(t) * 3.2,
                        yaw: -t,
                        c: "humar",
                        w: "red_sword",
                        chair: true,
                    },
                    {
                        id: "bot-rico",
                        name: "RED RING RICO [Lv180]",
                        x: -3.2,
                        z: 2.2,
                        yaw: 0.6,
                        c: "fonewearl",
                        w: "kingdom_key",
                        chair: false,
                    },
                ];
                for (const b of bots) {
                    const botFloor =
                        loadedStageCollisionRef.current.length > 0 ? sampleFloorHeight(b.x, b.z, sim.py).y : 0;
                    drawCharacter(b.x, botFloor, b.z, b.yaw, b.c, b.w, b.chair, false, !b.chair, "none", b.name, false);
                    const p = projectToScreen([b.x, botFloor + 2.55, b.z], viewMat, projMat, rect.width, rect.height);
                    if (p.visible) {
                        labels.push({
                            id: b.id,
                            name: b.name,
                            x: p.x,
                            y: p.y,
                            color: "#efc278",
                        });
                    }
                }
            }

            // Project floating combat / rare-drop numbers
            sim.floatingTexts = sim.floatingTexts.filter((ft) => now - ft.bornAt < 1800);
            for (const ft of sim.floatingTexts) {
                const age = (now - ft.bornAt) / 1000;
                const p = projectToScreen([ft.x, ft.y + age * 1.1, ft.z], viewMat, projMat, rect.width, rect.height);
                if (p.visible) {
                    labels.push({
                        id: ft.id,
                        name: ft.text,
                        x: p.x,
                        y: p.y,
                        color: ft.color,
                    });
                }
            }

            if (now - lastHudSync > 50) {
                lastHudSync = now;
                setHudLabels(labels);
            }

            animId = window.requestAnimationFrame(render);
        };

        animId = window.requestAnimationFrame(render);
        return () => window.cancelAnimationFrame(animId);
    }, []);

    const onSubmitLobbyChat = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        const trimmed = lobbyChatDraft.trim();
        if (!trimmed) {
            // Empty Enter in PSOBB closes the chat bar and returns control to WORLD_FOCUS!
            switchFocusMode("WORLD_FOCUS");
            return;
        }

        const lower = trimmed.toLowerCase();
        // Built-in PSOBB Lobby Slash Commands (/chair, /sit, /shifta, /resta, /attack, /dance)
        if (lower === "/sit" || lower === "/chair" || lower === "/lobby") {
            setInChair((prev) => !prev);
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/shifta" || lower === "/deband" || lower === "/resta" || lower === "/tech") {
            triggerTechBurst();
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/guild" || lower === "/counter" || lower === "/rooms") {
            triggerStationInteract("guild_counter");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/warp" || lower === "/teleporter" || lower === "/tp") {
            simRef.current.px = 0;
            simRef.current.pz = 4.2;
            triggerStationInteract("teleporter_pad");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/bank" || lower === "/symbol") {
            triggerStationInteract("bank_counter");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/heal" || lower === "/med" || lower === "/medical") {
            triggerStationInteract("medical_center");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/wave") {
            triggerEmote("wave");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/dance") {
            triggerEmote("dance");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/cheer") {
            triggerEmote("cheer");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/bow") {
            triggerEmote("bow");
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }
        if (lower === "/bgm" || lower === "/music") {
            setIsBgmPlaying((prev) => !prev);
            setLobbyChatDraft("");
            switchFocusMode("WORLD_FOCUS");
            return;
        }

        // Show immediate 3D overhead speech bubble above local Hunter + send to Matrix room
        setLocalSpeechBubble({ text: trimmed, sentAt: Date.now() });
        setLobbyChatDraft("");
        playPsoSymbolChime("comm");
        await onSendLobbyChatMessage?.(trimmed);
        switchFocusMode("WORLD_FOCUS");
    };

    const onUploadModelFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const geom = await parsePsoOrObjModelFile(file);
            customWeaponMeshRef.current = geom;
            setLoadedAssetInfo(`${geom.name} — ${geom.chunkInfo}`);
            playPsoSymbolChime("rare");
        } catch {
            setLoadedAssetInfo(`Failed to parse ${file.name}`);
        }
    };

    return (
        <div
            ref={modalRootRef}
            className={classNames("pso-lobby3d-modal pso-interactive", {
                "pso-lobby3d-modal--smaa": reShade.enabled && reShade.smaa,
                "pso-lobby3d-modal--world-focus": focusMode === "WORLD_FOCUS",
                "pso-lobby3d-modal--chat-focus": focusMode === "CHAT_FOCUS",
                "pso-lobby3d-modal--unified-stage": presentationMode === "unified_stage",
                "pso-lobby3d-modal--floating-window": presentationMode === "floating_window",
                "pso-lobby3d-modal--chat-dock-open": presentationMode === "unified_stage" && isChatDockVisible,
            })}
            data-testid="pso-lobby3d-layer"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Top Pioneer 2 Ship / Block Header Bar */}
            <div className="pso-lobby3d-header">
                <div className="pso-lobby3d-brand">
                    <span className="pso-window-titlebar-dot" />
                    <span>EPISODE I // PIONEER 2 HUNTER&apos;S GUILD CONCOURSE</span>
                    <button
                        type="button"
                        className={classNames("pso-focus-mode-pill", {
                            "pso-focus-mode-pill--world": focusMode === "WORLD_FOCUS",
                            "pso-focus-mode-pill--chat": focusMode === "CHAT_FOCUS",
                        })}
                        onClick={() =>
                            switchFocusMode(focusMode === "WORLD_FOCUS" ? "CHAT_FOCUS" : "WORLD_FOCUS", "lobby_bar")
                        }
                        title="Click or press Enter/Esc to switch between 3D Hunter Controls (WASD) and Chat Input"
                    >
                        {focusMode === "WORLD_FOCUS"
                            ? "🎮 3D WORLD FOCUS (Enter = Chat)"
                            : "💬 CHAT FOCUS (Esc / Click 3D = Move)"}
                    </button>
                </div>

                <div className="pso-lobby3d-top-actions">
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeStationMenu === "teleporter_pad",
                        })}
                        onClick={() => triggerStationInteract("teleporter_pad")}
                        title="Open Ragol Area Teleporter (Forest 1 / Caves 1 / Mines 1 / Ruins 1 / Principal's Office)"
                    >
                        🟢 Area Teleporter
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeStationMenu === "guild_counter",
                        })}
                        onClick={() => triggerStationInteract("guild_counter")}
                        title="Open Episode I Hunter's Guild Counter (Room / Block Warp & Voice Party)"
                    >
                        💁‍♀️ Guild Counter
                    </button>
                    {onChangePresentationMode && (
                        <button
                            type="button"
                            className={classNames("pso-mini-act-btn", {
                                "pso-mini-act-btn--active": presentationMode === "unified_stage",
                            })}
                            onClick={() =>
                                onChangePresentationMode(
                                    presentationMode === "unified_stage" ? "floating_window" : "unified_stage",
                                )
                            }
                            title="Switch between Snapped Side-by-Side (Game + Chat Snapped) and Overlapping Floating Window"
                        >
                            {presentationMode === "unified_stage" ? "🧲 Snapped Split" : "🪟 Floating 3D"}
                        </button>
                    )}
                    {presentationMode === "unified_stage" && onToggleChatDock && (
                        <button
                            type="button"
                            className={classNames("pso-mini-act-btn", {
                                "pso-mini-act-btn--active": isChatDockVisible,
                            })}
                            onClick={onToggleChatDock}
                            title="Show or hide the snapped Element Room Chat alongside the 3D Guild Stage"
                        >
                            💬 Chat: {isChatDockVisible ? "SNAPPED" : "HIDDEN"}
                        </button>
                    )}
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": isBgmPlaying,
                        })}
                        onClick={() => setIsBgmPlaying((prev) => !prev)}
                        title="Toggle Pioneer 2 'Day Dawns' Ambient BGM Synth (/bgm)"
                    >
                        🎵 BGM: {isBgmPlaying ? "ON" : "OFF"}
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": reShade.khOverhaulMode,
                        })}
                        onClick={() =>
                            setReShade((prev) => ({
                                ...prev,
                                khOverhaulMode: !prev.khOverhaulMode,
                            }))
                        }
                        title="Toggle Kingdom Hearts PSOBB Overhaul Pack (Keyblades + Stained Glass Chests)"
                    >
                        🗝️ KH: {reShade.khOverhaulMode ? "ON" : "OFF"}
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": isReShadeMenuOpen,
                        })}
                        onClick={() => setIsReShadeMenuOpen((prev) => !prev)}
                        title="Open ReShade Post-Processing Shader Menu (Home Key)"
                    >
                        ✨ ReShade
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": isAssetViewerOpen,
                        })}
                        onClick={() => setIsAssetViewerOpen((prev) => !prev)}
                        title="Open PSO(DC)/PSOBB .NJ & .OBJ 3D Model Loader"
                    >
                        📦 .NJ Loader
                    </button>
                    <button
                        type="button"
                        className="pso-orb-btn pso-orb-btn--b"
                        onClick={onClose}
                        title="Return to Classic Element Chat (0% 3D GPU Overhead)"
                    >
                        B
                    </button>
                </div>
            </div>

            {/* Main 3D WebGL Viewport + Projected 3D Nameplates & Rare Drop Feed */}
            <div className="pso-lobby3d-viewport-wrap" ref={onViewportElementChange}>
                <canvas
                    ref={canvasRef}
                    tabIndex={0}
                    className="pso-lobby3d-canvas"
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseDown={(e) => {
                        if (focusModeRef.current !== "WORLD_FOCUS") {
                            switchFocusMode("WORLD_FOCUS");
                        }
                        simRef.current.camDragging = true;
                        simRef.current.camDragMoved = false;
                        simRef.current.camDragLastX = e.clientX;
                        simRef.current.camDragLastY = e.clientY;
                    }}
                    onMouseMove={(e) => {
                        const sim = simRef.current;
                        if (!sim.camDragging) return;
                        const dx = e.clientX - sim.camDragLastX;
                        const dy = e.clientY - sim.camDragLastY;
                        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                            sim.camDragMoved = true;
                        }
                        sim.camDragLastX = e.clientX;
                        sim.camDragLastY = e.clientY;
                        sim.camYaw -= dx * 0.0085;
                        sim.camPitch = Math.max(0.04, Math.min(0.68, sim.camPitch + dy * 0.0055));
                        sim.camTargetYaw = null;
                    }}
                    onMouseUp={(e) => {
                        const sim = simRef.current;
                        const wasDrag = sim.camDragMoved;
                        sim.camDragging = false;
                        sim.camDragMoved = false;
                        if (!wasDrag && e.button === 0) {
                            triggerAttack();
                        } else if (!wasDrag && e.button === 2) {
                            // Right-click tap snaps camera behind character like PSO L-Trigger!
                            sim.camTargetYaw = sim.pyaw + Math.PI;
                        }
                    }}
                    onMouseLeave={() => {
                        simRef.current.camDragging = false;
                    }}
                    onWheel={(e) => {
                        e.preventDefault();
                        const sim = simRef.current;
                        sim.camDist = Math.max(2.6, Math.min(11.5, sim.camDist + e.deltaY * 0.004));
                    }}
                    style={{
                        filter: reShade.enabled
                            ? `contrast(${(1 + (reShade.lumaSharpen - 1) * 0.25).toFixed(2)}) saturate(${reShade.vibrance.toFixed(2)})`
                            : "none",
                    }}
                />

                {/* 3D Projected Overhead Hunter Nameplates, Speech Balloons & Floating Numbers */}
                <div className="pso-lobby3d-overlay-labels">
                    {hudLabels.map((lbl) => (
                        <div
                            key={lbl.id}
                            className={classNames("pso-lobby3d-nametag", {
                                "pso-lobby3d-nametag--clickable": Boolean(lbl.remotePlayer),
                            })}
                            style={{
                                left: `${lbl.x}px`,
                                top: `${lbl.y}px`,
                                color: lbl.color,
                            }}
                            onClick={(e) => {
                                if (lbl.remotePlayer) {
                                    e.stopPropagation();
                                    playPsoSymbolChime("comm");
                                    setSelectedRemotePlayer(lbl.remotePlayer);
                                }
                            }}
                            title={lbl.remotePlayer ? `Click to open ${lbl.remotePlayer.displayName}'s PSO Guild Card` : undefined}
                        >
                            {lbl.chatText && (
                                <div className="pso-lobby3d-speech-balloon">
                                    <span className="pso-lobby3d-speech-text">{lbl.chatText}</span>
                                    <span className="pso-lobby3d-speech-tail" />
                                </div>
                            )}
                            {lbl.symbolText && (
                                <div className="pso-lobby3d-symbol-pill">🐤 {lbl.symbolText}</div>
                            )}
                            <span className="pso-lobby3d-nametag-row">
                                {lbl.sectionId && (
                                    <span
                                        className="pso-section-id-dot"
                                        style={{ backgroundColor: lbl.sectionId.color }}
                                        title={`Section ID: ${lbl.sectionId.name}`}
                                    />
                                )}
                                <span>▸ {lbl.name}</span>
                            </span>
                        </div>
                    ))}
                </div>

                {/* PSOBB HUNTER GUILD CARD MODAL (Opened by clicking a remote Hunter's nameplate) */}
                {selectedRemotePlayer && (
                    <div className="pso-guild-card-modal" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="pso-guild-counter-header">
                            <span>🃏 HUNTER&apos;S GUILD CARD // PIONEER 2 REGISTRY</span>
                            <button
                                type="button"
                                className="pso-orb-btn pso-orb-btn--b"
                                onClick={() => setSelectedRemotePlayer(null)}
                            >
                                B
                            </button>
                        </div>
                        {(() => {
                            const sec = computePsoSectionId(selectedRemotePlayer.displayName);
                            return (
                                <div className="pso-guild-card-body">
                                    <div className="pso-guild-card-row">
                                        <span className="pso-guild-card-label">HUNTER NAME:</span>
                                        <strong style={{ color: "#50f296" }}>{selectedRemotePlayer.displayName}</strong>
                                    </div>
                                    <div className="pso-guild-card-row">
                                        <span className="pso-guild-card-label">MATRIX ID:</span>
                                        <span>{selectedRemotePlayer.userId}</span>
                                    </div>
                                    <div className="pso-guild-card-row">
                                        <span className="pso-guild-card-label">SECTION ID:</span>
                                        <strong style={{ color: sec.color }}>◆ {sec.name}</strong>
                                    </div>
                                    <div className="pso-guild-card-row">
                                        <span className="pso-guild-card-label">CLASS / WEAPON:</span>
                                        <span>
                                            {selectedRemotePlayer.classId.toUpperCase()} //{" "}
                                            {selectedRemotePlayer.weaponId.replace(/_/g, " ").toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="pso-guild-counter-actions-bar">
                                        <button
                                            type="button"
                                            className="pso-mini-act-btn pso-mini-act-btn--active"
                                            onClick={() => {
                                                setLobbyChatDraft(`@${selectedRemotePlayer.displayName}: `);
                                                setSelectedRemotePlayer(null);
                                                switchFocusMode("CHAT_FOCUS", "lobby_bar");
                                            }}
                                        >
                                            💬 Direct Mention in SAY &gt;
                                        </button>
                                        <button
                                            type="button"
                                            className="pso-mini-act-btn"
                                            onClick={() => {
                                                simRef.current.px = selectedRemotePlayer.x;
                                                simRef.current.pz = selectedRemotePlayer.z + 1.1;
                                                playPsoSymbolChime("rare");
                                                setSelectedRemotePlayer(null);
                                            }}
                                        >
                                            🟢 Warp Beside Hunter
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Top-Left Loot & Meseta Readout inside 3D Lobby */}
                <div className="pso-lobby3d-loot-box">
                    <div className="pso-lobby3d-loot-title">MESETA: {mesetaCount.toLocaleString()} 💎</div>
                    {rareDropsFound.slice(0, 3).map((item, i) => (
                        <div key={i} className="pso-lobby3d-rare-line">
                            {item}
                        </div>
                    ))}
                </div>

                {/* EPISODE I PIONEER 2 STATION PROXIMITY ACTION BANNER */}
                {nearbyStation && !activeStationMenu && (
                    <div className="pso-guild-proximity-banner">
                        <span className="pso-key-badge pso-key-badge--yellow">F / Z</span>
                        <span className="pso-guild-proximity-text">
                            {nearbyStation === "guild_counter" &&
                                "HUNTER'S GUILD COUNTER — Select Matrix Room / Block & Voice Party"}
                            {nearbyStation === "teleporter_pad" &&
                                "RAGOL AREA TELEPORTER — Select Forest 1 / Caves 1 / Mines 1 / Ruins 1 or Pioneer 2 Warp"}
                            {nearbyStation === "principal_warp_to_office" &&
                                "PRINCIPAL'S OFFICE TELEPORTER PAD — Press F to Warp to Principal Tyrell's Office (Sec 41)"}
                            {nearbyStation === "principal_warp_to_city" &&
                                "PIONEER 2 RETURN TELEPORTER PAD — Press F to Return to Central Concourse (Sec 20)"}
                            {nearbyStation === "principal_tyrell" &&
                                "PRINCIPAL COLIN TYRELL & IRENE — Government Mission & Ragol Area Briefing"}
                            {nearbyStation === "shop_plaza" &&
                                "PIONEER 2 SHOPPING PLAZA & TEKKER — Weapon / Armor / Tool / Tech Shops"}
                            {nearbyStation === "bank_counter" &&
                                "CHECK ROOM & SYMBOL BANK — Open Symbol Chat Maker & Presets"}
                            {nearbyStation === "medical_center" &&
                                "PIONEER 2 MEDICAL CENTER — Restore 100% HP/TP & Open HUD/Audio Tuner"}
                        </span>
                        <button
                            type="button"
                            className="pso-mini-act-btn pso-mini-act-btn--active"
                            onClick={() => triggerStationInteract(nearbyStation)}
                        >
                            {nearbyStation === "principal_warp_to_office" || nearbyStation === "principal_warp_to_city"
                                ? "Activate Teleporter [F]"
                                : "Open Counter [F]"}
                        </button>
                    </div>
                )}

                {/* EPISODE I HUNTER'S GUILD COUNTER / STATION MODAL */}
                {activeStationMenu && (
                    <div className="pso-guild-counter-panel" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="pso-guild-counter-header">
                            <span>
                                {activeStationMenu === "guild_counter" &&
                                    "💁‍♀️ EPISODE I // HUNTER'S GUILD COUNTER — ROOM & BLOCK SELECT"}
                                {activeStationMenu === "teleporter_pad" &&
                                    "🟢 PIONEER 2 TELEPORTER — WARP TO MATRIX ROOM OR STATION"}
                                {activeStationMenu === "bank_counter" &&
                                    "🏦 PIONEER 2 CHECK ROOM — SYMBOL CHAT & LOADOUT BANK"}
                                {activeStationMenu === "medical_center" &&
                                    "🏥 PIONEER 2 MEDICAL CENTER — HP/TP RESTORED & AUDIO TUNER"}
                            </span>
                            <button
                                type="button"
                                className="pso-orb-btn pso-orb-btn--b"
                                onClick={() => setActiveStationMenu(null)}
                                title="Close Station Menu (Esc)"
                            >
                                B
                            </button>
                        </div>

                        {/* Station Switcher Tabs */}
                        <div className="pso-guild-station-tabs">
                            <button
                                type="button"
                                className={classNames("pso-mini-act-btn", {
                                    "pso-mini-act-btn--active": activeStationMenu === "guild_counter",
                                })}
                                onClick={() => setActiveStationMenu("guild_counter")}
                            >
                                💁‍♀️ Guild Counter
                            </button>
                            <button
                                type="button"
                                className={classNames("pso-mini-act-btn", {
                                    "pso-mini-act-btn--active": activeStationMenu === "teleporter_pad",
                                })}
                                onClick={() => setActiveStationMenu("teleporter_pad")}
                            >
                                🟢 Teleporter Pad
                            </button>
                            <button
                                type="button"
                                className={classNames("pso-mini-act-btn", {
                                    "pso-mini-act-btn--active": activeStationMenu === "bank_counter",
                                })}
                                onClick={() => setActiveStationMenu("bank_counter")}
                            >
                                🏦 Check Room
                            </button>
                            <button
                                type="button"
                                className={classNames("pso-mini-act-btn", {
                                    "pso-mini-act-btn--active": activeStationMenu === "medical_center",
                                })}
                                onClick={() => setActiveStationMenu("medical_center")}
                            >
                                🏥 Medical Center
                            </button>
                        </div>

                        {(activeStationMenu === "guild_counter" || activeStationMenu === "teleporter_pad") && (
                            <div className="pso-guild-counter-body">
                                <div className="pso-guild-room-list-title">
                                    🌍 SELECT RAGOL AREA TELEPORTER (4 EPISODE I AREAS + PIONEER 2 WARPS):
                                </div>
                                <div className="pso-guild-counter-actions-bar" style={{ flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                                    <button
                                        type="button"
                                        className={classNames("pso-mini-act-btn", {
                                            "pso-mini-act-btn--active": stageId === "bb_forest01",
                                        })}
                                        onClick={() => {
                                            setStageId("bb_forest01");
                                            setBgmTrack("slbgm_forest.ogg");
                                            playPsoSymbolChime("rare");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🌲 Area 1: Forest 1
                                    </button>
                                    <button
                                        type="button"
                                        className={classNames("pso-mini-act-btn", {
                                            "pso-mini-act-btn--active": stageId === "bb_cave01",
                                        })}
                                        onClick={() => {
                                            setStageId("bb_cave01");
                                            playPsoSymbolChime("rare");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🌋 Area 2: Caves 1
                                    </button>
                                    <button
                                        type="button"
                                        className={classNames("pso-mini-act-btn", {
                                            "pso-mini-act-btn--active": stageId === "bb_machine01",
                                        })}
                                        onClick={() => {
                                            setStageId("bb_machine01");
                                            playPsoSymbolChime("rare");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🤖 Area 3: Mines 1
                                    </button>
                                    <button
                                        type="button"
                                        className={classNames("pso-mini-act-btn", {
                                            "pso-mini-act-btn--active": stageId === "bb_ruins01",
                                        })}
                                        onClick={() => {
                                            setStageId("bb_ruins01");
                                            playPsoSymbolChime("rare");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🏛️ Area 4: Ruins 1
                                    </button>
                                    <button
                                        type="button"
                                        className={classNames("pso-mini-act-btn", {
                                            "pso-mini-act-btn--active": stageId === "bb_city00",
                                        })}
                                        onClick={() => {
                                            setStageId("bb_city00");
                                            setBgmTrack("CITY.ogg");
                                            simRef.current.px = 0;
                                            simRef.current.py = 0;
                                            simRef.current.pz = 0;
                                            playPsoSymbolChime("comm");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🏙️ Pioneer 2 Concourse
                                    </button>
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            if (stageId !== "bb_city00") {
                                                setStageId("bb_city00");
                                                setBgmTrack("CITY.ogg");
                                            }
                                            window.setTimeout(() => {
                                                simRef.current.px = 0.0;
                                                simRef.current.py = 0.0;
                                                simRef.current.pz = -140.5;
                                                simRef.current.pyaw = Math.PI;
                                                simRef.current.camYaw = 0;
                                            }, 60);
                                            playPsoSymbolChime("rare");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        👑 Principal&apos;s Office (Sec 41)
                                    </button>
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            if (stageId !== "bb_city00") {
                                                setStageId("bb_city00");
                                                setBgmTrack("CITY.ogg");
                                            }
                                            window.setTimeout(() => {
                                                // OBJ[22..25] Ragol Return Spawn facing OBJ[08] (type=67) Main Ragol Teleporter at (28.80, 0.08, 2.08)
                                                simRef.current.px = 22.86;
                                                simRef.current.py = 0.0;
                                                simRef.current.pz = 1.8;
                                                simRef.current.pyaw = Math.PI * 0.5;
                                                simRef.current.camYaw = -Math.PI * 0.5;
                                            }, 60);
                                            playPsoSymbolChime("comm");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🟢 Main Ragol Teleporter (Sec 20 E)
                                    </button>
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            if (stageId !== "bb_city00") {
                                                setStageId("bb_city00");
                                                setBgmTrack("CITY.ogg");
                                            }
                                            window.setTimeout(() => {
                                                // Sec 30 Shopping Plaza & The Tekker (Weapon/Armor/Tool Shops + Tekker)
                                                simRef.current.px = -13.2;
                                                simRef.current.py = 0.0;
                                                simRef.current.pz = 16.16;
                                                simRef.current.pyaw = 0;
                                                simRef.current.camYaw = Math.PI;
                                            }, 60);
                                            playPsoSymbolChime("comm");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        ⚔️ Shopping Plaza &amp; Tekker (Sec 30)
                                    </button>
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            if (stageId !== "bb_city00") {
                                                setStageId("bb_city00");
                                                setBgmTrack("CITY.ogg");
                                            }
                                            window.setTimeout(() => {
                                                // OBJ[14..17] Hunter's Guild Initial Spawn in Sec 10
                                                simRef.current.px = 15.93;
                                                simRef.current.py = 0.0;
                                                simRef.current.pz = 22.82;
                                                simRef.current.pyaw = 0;
                                                simRef.current.camYaw = Math.PI;
                                            }, 60);
                                            playPsoSymbolChime("comm");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        💁‍♀️ Hunter&apos;s Guild (Sec 10)
                                    </button>
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            if (stageId !== "bb_city00") {
                                                setStageId("bb_city00");
                                                setBgmTrack("CITY.ogg");
                                            }
                                            window.setTimeout(() => {
                                                // Sec 40 Pioneer 2 Medical Center Counter
                                                simRef.current.px = 17.02;
                                                simRef.current.py = 0.0;
                                                simRef.current.pz = -18.5;
                                                simRef.current.pyaw = Math.PI;
                                                simRef.current.camYaw = 0;
                                            }, 60);
                                            playPsoSymbolChime("comm");
                                            setActiveStationMenu(null);
                                        }}
                                    >
                                        🏥 Medical Center (Sec 40)
                                    </button>
                                    {onToggleVoiceCall && (
                                        <button
                                            type="button"
                                            className={classNames("pso-mini-act-btn", {
                                                "pso-mini-act-btn--active": isVoiceCallActive,
                                            })}
                                            onClick={() => {
                                                playPsoSymbolChime("rare");
                                                onToggleVoiceCall();
                                            }}
                                        >
                                            {isVoiceCallActive
                                                ? "🎙️ Leave Pioneer 2 Voice Comms"
                                                : "🎙️ Join Pioneer 2 Voice Comms"}
                                        </button>
                                    )}
                                </div>

                                <div className="pso-guild-room-list-title">
                                    SELECT SHIP / BLOCK (MATRIX ROOMS &amp; DMs — {guildRooms.length} AVAILABLE):
                                </div>
                                <div className="pso-guild-room-list">
                                    {guildRooms.map((rm, idx) => (
                                        <button
                                            key={rm.roomId}
                                            type="button"
                                            className={classNames("pso-guild-room-row", {
                                                "pso-guild-room-row--current": rm.isCurrent,
                                            })}
                                            onClick={() => {
                                                playPsoSymbolChime("rare");
                                                // Teleport Hunter onto the Green Spawn Pad when warping to a room
                                                simRef.current.px = 0;
                                                simRef.current.pz = 4.2;
                                                onSelectGuildRoom?.(rm.roomId);
                                                setActiveStationMenu(null);
                                            }}
                                        >
                                            <span className="pso-guild-room-block">
                                                BLOCK {String(idx + 1).padStart(2, "0")}
                                            </span>
                                            <span className="pso-guild-room-name">{rm.name}</span>
                                            <span className="pso-guild-room-meta">
                                                {(rm.unreadCount ?? 0) > 0 ? `🔔 ${rm.unreadCount} NEW • ` : ""}
                                                {rm.memberCount} Hunters {rm.isCurrent ? " [CURRENT]" : " [WARP ▸]"}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeStationMenu === "bank_counter" && (
                            <div className="pso-guild-counter-body">
                                <p className="pso-guild-station-desc">
                                    Welcome to the Pioneer 2 Check Room &amp; Symbol Chat Bank. Customize your 12-part
                                    vector Symbol Chat face or inspect your Meseta &amp; Rare Drop storage.
                                </p>
                                <div className="pso-guild-counter-actions-bar">
                                    {onOpenSymbolMaker && (
                                        <button
                                            type="button"
                                            className="pso-mini-act-btn pso-mini-act-btn--active"
                                            onClick={() => {
                                                setActiveStationMenu(null);
                                                onOpenSymbolMaker();
                                            }}
                                        >
                                            🐤 Open Symbol Chat Maker
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            setActiveStationMenu(null);
                                            setIsAssetViewerOpen(true);
                                        }}
                                    >
                                        📦 Open .NJ / .OBJ Weapon Model Bank
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeStationMenu === "medical_center" && (
                            <div className="pso-guild-counter-body">
                                <p className="pso-guild-station-desc">
                                    💚 Pioneer 2 Medical Center: Your Hunter&apos;s HP &amp; TP have been 100% restored.
                                    You can also calibrate your HUD layout, glass opacity, and ReShade shaders here.
                                </p>
                                <div className="pso-guild-counter-actions-bar">
                                    {onOpenHudTuner && (
                                        <button
                                            type="button"
                                            className="pso-mini-act-btn pso-mini-act-btn--active"
                                            onClick={() => {
                                                setActiveStationMenu(null);
                                                onOpenHudTuner();
                                            }}
                                        >
                                            ⚙ Open PSOBB HUD Tuner
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="pso-mini-act-btn"
                                        onClick={() => {
                                            setActiveStationMenu(null);
                                            setIsReShadeMenuOpen(true);
                                        }}
                                    >
                                        ✨ Open ReShade Shader Calibrator
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ECHELON RESHADE POST-PROCESSING OVERLAY PANEL (Home Key) */}
                {isReShadeMenuOpen && (
                    <div className="pso-reshade-panel">
                        <div className="pso-parts-red-header">ReShade v4.2 // PSO Preset</div>
                        <label className="pso-tuner-checkbox">
                            <input
                                type="checkbox"
                                checked={reShade.enabled}
                                onChange={(e) => setReShade((p) => ({ ...p, enabled: e.target.checked }))}
                            />
                            <span>Enable Post-Processing Shaders</span>
                        </label>
                        <label className="pso-tuner-checkbox">
                            <input
                                type="checkbox"
                                checked={reShade.smaa}
                                onChange={(e) => setReShade((p) => ({ ...p, smaa: e.target.checked }))}
                            />
                            <span>1. SMAA Anti-Aliasing</span>
                        </label>
                        <div className="pso-tuner-row">
                            <label>2. Vibrance ({Math.round(reShade.vibrance * 100)}%)</label>
                            <input
                                type="range"
                                min="0.8"
                                max="1.6"
                                step="0.05"
                                value={reShade.vibrance}
                                onChange={(e) =>
                                    setReShade((p) => ({ ...p, vibrance: Number.parseFloat(e.target.value) }))
                                }
                            />
                        </div>
                        <div className="pso-tuner-row">
                            <label>3. ReflectiveBumpmapping ({Math.round(reShade.reflectiveBump * 100)}%)</label>
                            <input
                                type="range"
                                min="0"
                                max="1.4"
                                step="0.05"
                                value={reShade.reflectiveBump}
                                onChange={(e) =>
                                    setReShade((p) => ({ ...p, reflectiveBump: Number.parseFloat(e.target.value) }))
                                }
                            />
                        </div>
                        <div className="pso-tuner-row">
                            <label>4. MagicBloom ({Math.round(reShade.magicBloom * 100)}%)</label>
                            <input
                                type="range"
                                min="0"
                                max="1.5"
                                step="0.05"
                                value={reShade.magicBloom}
                                onChange={(e) =>
                                    setReShade((p) => ({ ...p, magicBloom: Number.parseFloat(e.target.value) }))
                                }
                            />
                        </div>
                    </div>
                )}

                {/* KION PSOv2 / SEGA NINJA (.NJ), SCENE (.REL) & WAVEFRONT (.OBJ) ASSET & STAGE LOADER PANEL */}
                {isAssetViewerOpen && (
                    <div className="pso-asset-loader-panel">
                        <div className="pso-parts-red-header">PSOBB Asset &amp; Stage Porting (F:\Ultima-PSOBB)</div>
                        <div className="pso-asset-status">{loadedAssetInfo}</div>
                        <div className="pso-tuner-row">
                            <label>1. 3D Stage Map (`.rel` from `F:\Ultima-PSOBB\data\scene`):</label>
                            <select
                                className="pso-lobby3d-select"
                                value={stageId}
                                onChange={(e) => {
                                    const nextStage = e.target.value as PsoLobbyStageId;
                                    setStageId(nextStage);
                                    if (nextStage === "bb_lobby_01") setBgmTrack("LOBBY.ogg");
                                    else if (nextStage === "bb_city00") setBgmTrack("CITY.ogg");
                                    else if (nextStage === "bb_forest01") setBgmTrack("slbgm_forest.ogg");
                                    else if (nextStage === "bb_labo00") setBgmTrack("LABO.ogg");
                                }}
                            >
                                <option value="bb_city00">🏙️ PSOBB Pioneer 2 City + Principal&apos;s Office (map_city00_00n/c.rel)</option>
                                <option value="bb_lobby_01">🏛️ PSOBB Visual Lobby 01 (map_lobby_01n/c.rel)</option>
                                <option value="bb_forest01">🌲 Area 1: Ragol Forest 1 (map_forest01n/c.rel)</option>
                                <option value="bb_cave01">🌋 Area 2: Ragol Caves 1 (map_cave01_00n/c.rel)</option>
                                <option value="bb_machine01">🤖 Area 3: Ragol Mines 1 (map_machine01_00n/c.rel)</option>
                                <option value="bb_ruins01">🏛️ Area 4: Ragol Ruins 1 (map_ruins01_00n/c.rel)</option>
                                <option value="bb_labo00">🔬 PSOBB Episode II Lab (map_labo00_00n/c.rel)</option>
                                <option value="pioneer2_holodeck">🟢 Pioneer 2 Holodeck (Procedural Stage)</option>
                            </select>
                        </div>
                        <div className="pso-tuner-row">
                            <label>2. BGM Track (`.ogg` from `F:\Ultima-PSOBB\data\ogg`):</label>
                            <select
                                className="pso-lobby3d-select"
                                value={bgmTrack}
                                onChange={(e) => {
                                    setBgmTrack(e.target.value as PsoBgmTrackId);
                                    setIsBgmPlaying(true);
                                }}
                            >
                                <option value="CITY.ogg">🎵 CITY.ogg — Pioneer 2 &quot;Day Dawns&quot;</option>
                                <option value="LOBBY.ogg">🎵 LOBBY.ogg — PSOBB Visual Lobby</option>
                                <option value="GUILD.ogg">🎵 GUILD.ogg — Hunter&apos;s Guild Counter</option>
                                <option value="MEDICAL.ogg">🎵 MEDICAL.ogg — Medical Center</option>
                                <option value="SHOP.ogg">🎵 SHOP.ogg — Pioneer 2 Item Shop</option>
                                <option value="LABO.ogg">🎵 LABO.ogg — Episode II Lab</option>
                                <option value="slbgm_forest.ogg">🎵 slbgm_forest.ogg — Ragol Forest</option>
                                <option value="synth">🎹 WebAudio Rhodes Pad Synth</option>
                            </select>
                        </div>
                        <div className="pso-tuner-row">
                            <label>3. Pioneer 2 Event / Mode NPC Layout (`map_city00_00e*.dat`):</label>
                            <select
                                className="pso-lobby3d-select"
                                value={cityEventLayout}
                                onChange={(e) => setCityEventLayout(e.target.value as PsoCityEventLayoutId)}
                            >
                                <option value="e">🌐 map_city00_00e.dat — Online Multi-Mode (21 NPCs + Momoka)</option>
                                <option value="e_s">👤 map_city00_00e_s.dat — Online Solo / One-Person (16 NPCs, No Sec 41)</option>
                                <option value="e_d">📖 map_city00_00e_d.dat — Offline / Story Default (15 NPCs, Guild Officer)</option>
                                <option value="e_c1">⏱️ map_city00_00e_c1.dat — Challenge Mode (16 NPCs + Patrol Guard)</option>
                            </select>
                        </div>
                        <label className="pso-tuner-checkbox">
                            <input
                                type="checkbox"
                                checked={useRealClassNj}
                                onChange={(e) => setUseRealClassNj(e.target.checked)}
                            />
                            <span>Use Authentic PSOBB `.nj` Class &amp; NPC Meshes (`pl*bdy00.nj` + `bm_n_*_body.bml`)</span>
                        </label>
                        <div className="pso-asset-btn-row">
                            <button
                                type="button"
                                className="pso-mini-act-btn"
                                onClick={() => modelFileInputRef.current?.click()}
                            >
                                📂 Load Custom .NJ / .REL / .OBJ...
                            </button>
                            <button
                                type="button"
                                className="pso-mini-act-btn"
                                onClick={() => {
                                    customWeaponMeshRef.current = null;
                                    setLoadedAssetInfo("Restored Built-in PSO / KH Weapon Models");
                                }}
                            >
                                Reset Weapon
                            </button>
                            <input
                                ref={modelFileInputRef}
                                type="file"
                                accept=".nj,.xj,.gj,.rel,.obj"
                                style={{ display: "none" }}
                                onChange={(e) => void onUploadModelFile(e)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Direct PSOBB In-Lobby Chat Bar (Enter to Focus/Send, Esc to Return to 3D World) */}
            <form className="pso-lobby3d-chat-form" onSubmit={(e) => void onSubmitLobbyChat(e)}>
                <span className="pso-lobby3d-chat-prompt">SAY &gt;</span>
                <input
                    ref={lobbyChatInputRef}
                    type="text"
                    className="pso-lobby3d-chat-input"
                    placeholder="Press Enter to chat in Lobby + Room (or /sit, /shifta)... Esc returns to 3D WASD"
                    value={lobbyChatDraft}
                    onFocus={() => {
                        focusModeRef.current = "CHAT_FOCUS";
                        setFocusMode("CHAT_FOCUS");
                        simRef.current.keys.clear();
                    }}
                    onChange={(e) => setLobbyChatDraft(e.target.value)}
                />
                <button type="submit" className="pso-mini-act-btn pso-mini-act-btn--active">
                    Send (Enter)
                </button>
                {focusMode === "CHAT_FOCUS" && (
                    <button
                        type="button"
                        className="pso-mini-act-btn"
                        onClick={() => switchFocusMode("WORLD_FOCUS")}
                        title="Return keyboard control to 3D Hunter (Esc)"
                    >
                        🎮 Control 3D (Esc)
                    </button>
                )}
            </form>

            {/* Bottom Controls & Weapon / Class Selector Bar */}
            <div className="pso-lobby3d-footer">
                <div className="pso-lobby3d-controls-hint">
                    <span className="pso-key-badge pso-key-badge--cyan">WASD</span> Move
                    <span className="pso-key-badge pso-key-badge--cyan">QE / Arrows / Drag</span> Spin Cam
                    <span className="pso-key-badge pso-key-badge--purple">R / C</span> Snap Cam
                    <span className="pso-key-badge pso-key-badge--yellow">F</span> Guild
                    <span className="pso-key-badge pso-key-badge--green">Z / Click</span> Combo
                    <span className="pso-key-badge pso-key-badge--red">X</span> Shifta
                    <span className="pso-key-badge pso-key-badge--yellow">Space</span> Chair
                </div>

                <div className="pso-lobby3d-loadout">
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeEmote === "wave",
                        })}
                        onClick={() => triggerEmote("wave")}
                        title="Lobby Emote: Wave (Key 1 or /wave — clears on move/action)"
                    >
                        👋 Wave
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeEmote === "dance",
                        })}
                        onClick={() => triggerEmote("dance")}
                        title="Lobby Emote: Pioneer Dance (Key 2 or /dance — clears on move/action)"
                    >
                        💃 Dance
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeEmote === "cheer",
                        })}
                        onClick={() => triggerEmote("cheer")}
                        title="Lobby Emote: Cheer (Key 3 or /cheer — clears on move/action)"
                    >
                        🙌 Cheer
                    </button>
                    <button
                        type="button"
                        className={classNames("pso-mini-act-btn", {
                            "pso-mini-act-btn--active": activeEmote === "bow",
                        })}
                        onClick={() => triggerEmote("bow")}
                        title="Lobby Emote: Bow (Key 4 or /bow — clears on move/action)"
                    >
                        🙇 Bow
                    </button>
                    <select
                        className="pso-lobby3d-select"
                        value={stageId}
                        onChange={(e) => {
                            const nextStage = e.target.value as PsoLobbyStageId;
                            setStageId(nextStage);
                            if (nextStage === "bb_lobby_01") setBgmTrack("LOBBY.ogg");
                            else if (nextStage === "bb_city00") setBgmTrack("CITY.ogg");
                            else if (nextStage === "bb_forest01") setBgmTrack("slbgm_forest.ogg");
                            else if (nextStage === "bb_labo00") setBgmTrack("LABO.ogg");
                            canvasRef.current?.focus();
                        }}
                        title="Switch 3D Stage (Authentic PSOBB .REL Maps from F:\Ultima-PSOBB)"
                    >
                        <option value="bb_lobby_01">🏛️ Map: Visual Lobby 01</option>
                        <option value="bb_city00">🏙️ Map: Pioneer 2 City</option>
                        <option value="bb_forest01">🌲 Map: Ragol Forest 1</option>
                        <option value="bb_labo00">🔬 Map: Episode II Lab</option>
                        <option value="pioneer2_holodeck">🟢 Map: Holodeck</option>
                    </select>
                    <select
                        className="pso-lobby3d-select"
                        value={classId}
                        onChange={(e) => {
                            clearEmoteIfActive();
                            setClassId(e.target.value as PsoClassModelId);
                            canvasRef.current?.focus();
                        }}
                        title="Select PSOBB Hunter Class (All 12 Authentic .NJ Models)"
                    >
                        <option value="humar">HUmar (plAbdy00.nj)</option>
                        <option value="hunewearl">HUnewearl (plBbdy00.nj)</option>
                        <option value="hucast">HUcast (plCbdy00.nj)</option>
                        <option value="hucaseal">HUcaseal (plJbdy00.nj)</option>
                        <option value="ramar">RAmar (plDbdy00.nj)</option>
                        <option value="ramarl">RAmarl (plLbdy00.nj)</option>
                        <option value="racast">RAcast (plEbdy00.nj)</option>
                        <option value="racaseal">RAcaseal (plFbdy00.nj)</option>
                        <option value="fomar">FOmar (plKbdy00.nj)</option>
                        <option value="fomarl">FOmarl (plGbdy00.nj)</option>
                        <option value="fonewm">FOnewm (plHbdy00.nj)</option>
                        <option value="fonewearl">FOnewearl (plIbdy00.nj)</option>
                    </select>
                    <select
                        className="pso-lobby3d-select"
                        value={weaponId}
                        onChange={(e) => {
                            clearEmoteIfActive();
                            customWeaponMeshRef.current = null;
                            setWeaponId(e.target.value as PsoWeaponModelId);
                            canvasRef.current?.focus();
                        }}
                    >
                        <option value="kingdom_key">🗝️ Kingdom Key (KH Overhaul)</option>
                        <option value="red_sword">🗡️ Red Sword (+52)</option>
                        <option value="photon_saber">⚔️ DB&apos;s Photon Saber</option>
                        <option value="dark_flow">🌌 Dark Flow</option>
                    </select>
                    <button
                        type="button"
                        className="pso-mini-act-btn"
                        onClick={() => setSpawnBots((prev) => !prev)}
                    >
                        NPCs: {spawnBots ? "ON" : "OFF"}
                    </button>
                </div>
            </div>
        </div>
    );
}
