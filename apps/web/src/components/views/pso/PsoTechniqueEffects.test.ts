/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
    buildTechEffectMeshes,
    getTechSpec,
    isAndroidClass,
    isTechEffectAlive,
    PSO_TECH_XJ_ASSETS,
    sampleTechEffect,
    type PsoActiveTechEffect,
    type PsoTechMeshKey,
    type PsoTechXjKey,
} from "./PsoTechniqueEffects";

function effectFor(name: string): PsoActiveTechEffect {
    return { id: name, spec: getTechSpec(name), x: 0, y: 0, z: 0, yaw: 0, bornAt: 0 };
}

describe("PsoTechniqueEffects", () => {
    it("maps techniques to element families and tiers", () => {
        expect(getTechSpec("Foie")).toMatchObject({ family: "foie", tier: 0 });
        expect(getTechSpec("Gibarta")).toMatchObject({ family: "barta", tier: 1 });
        expect(getTechSpec("Razonde")).toMatchObject({ family: "zonde", tier: 2 });
        expect(getTechSpec("Deband").family).toBe("buff");
        expect(getTechSpec("Jellen").family).toBe("debuff");
    });

    it("only androids are barred from techniques", () => {
        expect(["hucast", "hucaseal", "racast", "racaseal"].every(isAndroidClass)).toBe(true);
        expect(["humar", "fomarl", "ramarl", "fonewm"].some(isAndroidClass)).toBe(false);
    });

    it("plays charge motes before release, then the technique, then expires", () => {
        const fx = effectFor("Foie");
        const chargeCalls = sampleTechEffect(fx, fx.spec.releaseSec * 500);
        expect(chargeCalls.length).toBeGreaterThan(0);
        expect(chargeCalls.every((c) => c.mesh === "orb")).toBe(true);

        const flight = sampleTechEffect(fx, (fx.spec.releaseSec + 0.2) * 1000);
        expect(flight.some((c) => c.z > 1)).toBe(true);

        const end = (fx.spec.releaseSec + fx.spec.effectSec) * 1000 + 1;
        expect(isTechEffectAlive(fx, end)).toBe(false);
    });

    it("every technique produces geometry for meshes that exist", () => {
        const meshes = buildTechEffectMeshes();
        for (const name of ["Foie", "Gifoie", "Rafoie", "Barta", "Gibarta", "Rabarta", "Zonde", "Gizonde", "Razonde", "Grants", "Megid", "Resta", "Anti", "Shifta", "Zalure", "Ryuker", "Reverser"]) {
            const fx = effectFor(name);
            const calls = sampleTechEffect(fx, (fx.spec.releaseSec + 0.3) * 1000);
            expect(calls.length).toBeGreaterThan(0);
            for (const c of calls) {
                expect(c.mesh.startsWith("xj_")).toBe(false);
                expect(meshes[c.mesh as PsoTechMeshKey].vertexCount).toBeGreaterThan(0);
            }
        }
    });

    it("uses the client's meshes and motions once they have loaded", () => {
        const all = new Set(Object.keys(PSO_TECH_XJ_ASSETS) as PsoTechXjKey[]);
        const at = (name: string, secsAfterRelease: number): ReturnType<typeof sampleTechEffect> => {
            const fx = effectFor(name);
            return sampleTechEffect(fx, (fx.spec.releaseSec + secsAfterRelease) * 1000, all);
        };

        expect(at("Foie", 0.2).map((c) => c.mesh)).toContain("xj_foie");
        expect(at("Rafoie", 0.2).map((c) => c.mesh)).toEqual(expect.arrayContaining(["xj_rafoie", "xj_rafoie_shock", "xj_ringwave"]));

        const spikes = at("Barta", 0.5).filter((c) => c.mesh === "xj_barta");
        expect(spikes.length).toBeGreaterThan(1);
        expect(spikes[0].motionFrame).toBe(9);

        const gibarta = at("Gibarta", 0.5).find((c) => c.mesh === "xj_gibarta");
        expect(gibarta?.motionFrame).toBeCloseTo(15);

        // Procedural ground rings become the client's ring wave, sized to the same radius.
        const resta = at("Resta", 0.3);
        expect(resta.some((c) => c.mesh === "ring" && c.pitch === 0)).toBe(false);
        expect(resta.some((c) => c.mesh === "xj_ringwave")).toBe(true);
    });
});
