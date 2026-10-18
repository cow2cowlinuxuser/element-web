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
