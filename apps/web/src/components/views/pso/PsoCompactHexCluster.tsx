/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useState } from "react";
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
    blank: { tex: 7, rect: [100, 0, 50, 43] },
} as const satisfies Record<string, { tex: number; rect: readonly [number, number, number, number] }>;

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

interface Props {
    isChatHidden: boolean;
    onToggleChat: () => void;
    onRestore: () => void;
    onRefresh: () => void;
}

interface Slot {
    position: "top" | "left" | "right" | "bottom";
    sprite: SpriteKey;
    /** Frame colour of this position in the game's cluster; used when the sheet isn't extracted. */
    rim: string;
    glyph: string;
    title?: string;
    testId?: string;
    onClick?: () => void;
    lit?: boolean;
}

/**
 * Compact-mode replacement for the 4-hex diamond, drawn from the game's own HUD cluster frame and icons:
 * chat (fold the chat box away or back), restore the full window, refresh Element, and a spare blank hex.
 */
export function PsoCompactHexCluster({ isChatHidden, onToggleChat, onRestore, onRefresh }: Props): JSX.Element {
    const sprites = useHudSprites();
    const slots: Slot[] = [
        {
            position: "top",
            sprite: "chat",
            rim: "#e8c03a",
            glyph: "💬",
            title: isChatHidden ? "Show chat" : "Hide chat",
            testId: "pso-compact-hex-chat",
            onClick: onToggleChat,
            lit: !isChatHidden,
        },
        {
            position: "left",
            sprite: "restore",
            rim: "#3a6ee8",
            glyph: "⇤",
            title: "Restore full window (Alt+C)",
            testId: "pso-compact-hex-restore",
            onClick: onRestore,
        },
        {
            position: "right",
            sprite: "refresh",
            rim: "#e83a3a",
            glyph: "⤵",
            title: "Refresh Element (keeps your session and room)",
            testId: "pso-compact-hex-refresh",
            onClick: onRefresh,
        },
        { position: "bottom", sprite: "blank", rim: "#3ae85b", glyph: "" },
    ];

    return (
        <div
            className={classNames("pso-compact-hex-cluster", { "pso-compact-hex-cluster--sprites": !!sprites.frame })}
            data-testid="pso-compact-hex-cluster"
        >
            {sprites.frame && <img className="pso-compact-hex-frame" src={sprites.frame} alt="" draggable={false} />}
            {slots.map((slot) => {
                const face = sprites[slot.sprite] ? (
                    <img src={sprites[slot.sprite]} alt="" draggable={false} />
                ) : (
                    <>
                        <svg viewBox="0 0 50 43" aria-hidden="true">
                            <polygon
                                points="12.5,1.5 37.5,1.5 48.5,21.5 37.5,41.5 12.5,41.5 1.5,21.5"
                                fill="rgba(40, 46, 50, 0.92)"
                                stroke={slot.rim}
                                strokeWidth="2.5"
                            />
                        </svg>
                        {slot.glyph && <span>{slot.glyph}</span>}
                    </>
                );
                const className = classNames("pso-compact-hex", `pso-compact-hex--${slot.position}`, {
                    "pso-compact-hex--lit": slot.lit,
                });
                if (!slot.onClick) {
                    return (
                        <div key={slot.position} className={className} aria-hidden="true">
                            {face}
                        </div>
                    );
                }
                return (
                    <button
                        key={slot.position}
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
