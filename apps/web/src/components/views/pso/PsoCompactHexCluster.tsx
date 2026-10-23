/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type Ref, useEffect, useState } from "react";
import classNames from "classnames";

import { loadPsoUiSprite } from "./PsoGamePackLoader";

/** The in-game HUD sheet; only present when the user has extracted their own PSOBB assets. */
const HUD_SHEET = "media/pso/ui/f256_hyouji.xvm";

/** Texture index and `[x, y, w, h]` pixel rect of each sprite inside `f256_hyouji.xvm`. */
const SPRITES = {
    frame: { tex: 2, rect: [0, 0, 150, 107] },
    chat: { tex: 6, rect: [150, 129, 50, 43] },
    restore: { tex: 6, rect: [200, 129, 50, 43] },
    refresh: { tex: 6, rect: [100, 86, 50, 43] },
    gear: { tex: 7, rect: [0, 172, 50, 43] },
    blank: { tex: 7, rect: [100, 0, 50, 43] },
} as const satisfies Record<string, { tex: number; rect: readonly [number, number, number, number] }>;

export type PsoHexSpriteKey = Exclude<keyof typeof SPRITES, "frame" | "blank">;

type SpriteKey = keyof typeof SPRITES;

function useHudSprites(): Partial<Record<SpriteKey, string>> {
    const [sprites, setSprites] = useState<Partial<Record<SpriteKey, string>>>({});
    useEffect(() => {
        let cancelled = false;
        void (async (): Promise<void> => {
            const next: Partial<Record<SpriteKey, string>> = {};
            for (const key of Object.keys(SPRITES) as SpriteKey[]) {
                const url = await loadPsoUiSprite(HUD_SHEET, SPRITES[key].tex, SPRITES[key].rect);
                if (url) next[key] = url;
            }
            if (!cancelled) setSprites(next);
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return sprites;
}

type Position = "top" | "left" | "right" | "bottom";

/** Frame colour of each position in the game's cluster; used when the sheet isn't extracted. */
const RIMS: Record<Position, string> = {
    top: "#e8c03a",
    left: "#3a6ee8",
    right: "#e83a3a",
    bottom: "#3ae85b",
};

const GLYPHS: Record<PsoHexSpriteKey, string> = {
    chat: "💬",
    restore: "⇤",
    refresh: "⤵",
    gear: "⚙",
};

export interface PsoHexSlot {
    sprite: PsoHexSpriteKey;
    title: string;
    testId?: string;
    onClick: () => void;
    lit?: boolean;
    buttonRef?: Ref<HTMLButtonElement>;
}

interface Props {
    /** Positions left out render as the game's blank hex. */
    slots: Partial<Record<Position, PsoHexSlot>>;
}

const POSITIONS: Position[] = ["top", "left", "right", "bottom"];

/** The 4-hex diamond, drawn from the game's own HUD cluster frame and icons. */
export function PsoCompactHexCluster({ slots }: Props): JSX.Element {
    const sprites = useHudSprites();

    return (
        <div
            className={classNames("pso-compact-hex-cluster", { "pso-compact-hex-cluster--sprites": !!sprites.frame })}
            data-testid="pso-compact-hex-cluster"
        >
            {sprites.frame && <img className="pso-compact-hex-frame" src={sprites.frame} alt="" draggable={false} />}
            {POSITIONS.map((position) => {
                const slot = slots[position];
                const sprite = sprites[slot?.sprite ?? "blank"];
                const face = sprite ? (
                    <img src={sprite} alt="" draggable={false} />
                ) : (
                    <>
                        <svg viewBox="0 0 50 43" aria-hidden="true">
                            <polygon
                                points="12.5,1.5 37.5,1.5 48.5,21.5 37.5,41.5 12.5,41.5 1.5,21.5"
                                fill="rgba(40, 46, 50, 0.92)"
                                stroke={RIMS[position]}
                                strokeWidth="2.5"
                            />
                        </svg>
                        {slot && <span>{GLYPHS[slot.sprite]}</span>}
                    </>
                );
                const className = classNames("pso-compact-hex", `pso-compact-hex--${position}`, {
                    "pso-compact-hex--lit": slot?.lit,
                });
                if (!slot) {
                    return (
                        <div key={position} className={className} aria-hidden="true">
                            {face}
                        </div>
                    );
                }
                return (
                    <button
                        key={position}
                        ref={slot.buttonRef}
                        type="button"
                        className={className}
                        onClick={slot.onClick}
                        title={slot.title}
                        aria-label={slot.title}
                        data-testid={slot.testId}
                    >
                        {face}
                    </button>
                );
            })}
        </div>
    );
}
