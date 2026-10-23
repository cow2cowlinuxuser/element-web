/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pso_hud_compact_chat_pos";
const CHAT_BOX_SELECTOR = ".mx_RoomView_wrapper";
const HANDLE_SIZE = 18;

interface Point {
    x: number;
    y: number;
}

function readSavedPos(): Point | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const pos = raw ? (JSON.parse(raw) as Partial<Point>) : null;
        return typeof pos?.x === "number" && typeof pos?.y === "number" ? { x: pos.x, y: pos.y } : null;
    } catch {
        return null;
    }
}

function writeSavedPos(pos: Point | null): void {
    try {
        if (pos) localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

function clampToViewport(pos: Point, box: DOMRect): Point {
    return {
        x: Math.round(Math.max(0, Math.min(window.innerWidth - box.width, pos.x))),
        y: Math.round(Math.max(0, Math.min(window.innerHeight - box.height, pos.y))),
    };
}

interface Props {
    /** Keeps the chat box where it was placed but hides the handle, e.g. while the chat is folded away. */
    hidden: boolean;
}

/**
 * The same move handle as the 4-hex cluster, riding the top edge of the compact chat box. Drag to place the box
 * anywhere in the window; double-click to send it back to its default corner.
 */
export function PsoCompactChatDragHandle({ hidden }: Props): JSX.Element | null {
    const [pos, setPos] = useState<Point | null>(readSavedPos);
    const [handleAt, setHandleAt] = useState<Point | null>(null);

    useEffect(() => {
        const body = document.body;
        body.classList.toggle("pso-compact-chat-placed", !!pos);
        if (pos) {
            body.style.setProperty("--pso-compact-chat-left", `${pos.x}px`);
            body.style.setProperty("--pso-compact-chat-top", `${pos.y}px`);
        }
        return () => {
            body.classList.remove("pso-compact-chat-placed");
            body.style.removeProperty("--pso-compact-chat-left");
            body.style.removeProperty("--pso-compact-chat-top");
        };
    }, [pos]);

    const measure = useCallback((): void => {
        const box = document.querySelector(CHAT_BOX_SELECTOR)?.getBoundingClientRect();
        setHandleAt((prev) => {
            if (!box || box.width === 0) return prev === null ? prev : null;
            const next = { x: Math.round(box.left + box.width / 2 - HANDLE_SIZE / 2), y: Math.round(box.top - HANDLE_SIZE / 2) };
            return prev?.x === next.x && prev?.y === next.y ? prev : next;
        });
    }, []);

    // The room view remounts when switching rooms and re-anchors on window resize, so keep re-measuring.
    useEffect(() => {
        measure();
        const timer = window.setInterval(measure, 500);
        window.addEventListener("resize", measure);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("resize", measure);
        };
    }, [measure, pos, hidden]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
        e.stopPropagation();
        e.preventDefault();
        const box = document.querySelector(CHAT_BOX_SELECTOR)?.getBoundingClientRect();
        if (!box) return;
        const startX = e.clientX;
        const startY = e.clientY;
        let last: Point = { x: box.left, y: box.top };

        const onMove = (ev: PointerEvent): void => {
            last = clampToViewport({ x: box.left + ev.clientX - startX, y: box.top + ev.clientY - startY }, box);
            setPos(last);
            setHandleAt({ x: Math.round(last.x + box.width / 2 - HANDLE_SIZE / 2), y: Math.round(last.y - HANDLE_SIZE / 2) });
        };
        const onUp = (): void => {
            writeSavedPos(last);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    };

    const onDoubleClick = (): void => {
        writeSavedPos(null);
        setPos(null);
    };

    if (hidden || !handleAt) return null;
    return (
        <div
            className="pso-compact-chat-drag-handle pso-interactive"
            style={{ left: `${handleAt.x}px`, top: `${Math.max(0, handleAt.y)}px` }}
            title="Drag to move the chat • Double-click to snap it back"
            data-testid="pso-compact-chat-drag-handle"
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
        >
            ✥
        </div>
    );
}
