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
    sampleTechEffect,
    type PsoActiveTechEffect,
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
            for (const c of calls) expect(meshes[c.mesh].vertexCount).toBeGreaterThan(0);
        }
    });
});
