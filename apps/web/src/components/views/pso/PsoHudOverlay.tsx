/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import {
    ClientEvent,
    EventType,
    type IRoomTimelineData,
    type MatrixEvent,
    MatrixEventEvent,
    type Room,
    RoomEvent,
} from "matrix-js-sdk/src/matrix";

import { SDKContext } from "../../../contexts/SDKContext";
import { CallStore, CallStoreEvent } from "../../../stores/CallStore";
import { type Call, CallEvent } from "../../../models/Call";
import { useEventEmitterState, useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import { useLiveParticipants } from "../../../hooks/useCall";
import { OwnProfileStore } from "../../../stores/OwnProfileStore";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import RightPanelStore from "../../../stores/right-panel/RightPanelStore";
import {
    DEFAULT_SYMBOL_PRESETS,
    ensureThirtySymbolPresets,
    playPsoSymbolChime,
    PsoSymbolChatBalloon,
    PsoSymbolChatEditorModal,
    type PsoSymbolChatSpec,
} from "./PsoSymbolChatMaker";
import {
    PsoLobby3dLayer,
    type PsoGuildRoomEntry,
    type PsoLobbyPresentationMode,
    type PsoLobbySpeechBubble,
    type PsoLobbyWorldAction,
    type PsoPersistedHunterState,
    type PsoRemoteLobbyPlayer,
} from "./PsoLobby3dLayer";

const STORAGE_KEYS = {
    GLASS_ALPHA: "pso_hud_glass_alpha",
    SCANLINE_ALPHA: "pso_hud_scanline_alpha",
    BACKDROP_MODE: "pso_hud_backdrop_mode",
    CUSTOM_WALLPAPER: "pso_hud_custom_wallpaper",
    SEND_SYMBOL_TO_ROOM: "pso_hud_send_symbol_to_room",
    AUTO_REDACT_SYMBOL: "pso_hud_auto_redact_symbol",
    SYMBOL_PRESETS: "pso_hud_symbol_presets_v1",
    ACTIVE_SYMBOL_INDEX: "pso_hud_active_symbol_idx",
    CUSTOM_SYMBOL_SHEET: "pso_hud_custom_symbol_sheet_png",
    DIAMOND_POS: "pso_hud_diamond_cluster_pos",
    POST_SYMBOL_TEXT_LOG: "pso_hud_post_symbol_text_log",
    COMPACT_CHAT: "pso_hud_compact_chat_mode",
    COMPACT_OVERLAYS_HIDDEN: "pso_hud_compact_overlays_hidden",
    CLICK_THROUGH: "pso_hud_click_through_glass",
    PIN_ALWAYS_ON_TOP: "pso_hud_pin_always_on_top",
    HEX_SLOTS: "pso_hud_hex_action_slots",
    LOBBY_PRESENTATION_MODE: "pso_hud_lobby_presentation_mode_v2",
    LOBBY_CHAT_DOCK_VISIBLE: "pso_hud_lobby_chat_dock_visible_v2",
    SAVED_HUNTER_STATE: "pso_lobby_saved_hunter_v1",
    GHOST_STANDBY_ENABLED: "pso_lobby_ghost_standby_enabled",
    DEAFEN: "matrix-setting-mute-all-audio",
} as const;

export type PsoBackdropMode = "pioneer2" | "custom" | "transparent";

export type PsoSnapZone =
    | "maximize"
    | "left"
    | "right"
    | "top-left"
    | "bottom-left"
    | "top-right"
    | "bottom-right"
    | null;

export type PsoHexActionId =
    | "symbol_rappy"
    | "symbol_editor"
    | "pso_lobby_3d"
    | "tech_resta"
    | "tech_shifta"
    | "tech_deband"
    | "screen_share"
    | "mute_mic"
    | "deafen_audio"
    | "join_leave_voice"
    | "click_through"
    | "compact_chat"
    | "stream_overlay"
    | "transparent_mode"
    | "snap_left"
    | "snap_right"
    | "spotlight_search"
    | "party_inspector"
    | "quick_comm";

export interface PsoHexActionDef {
    id: PsoHexActionId;
    shortName: string;
    icon: string;
    label: string;
    color: string;
    active?: boolean;
    danger?: boolean;
}

export const HEX_PRESETS: Record<"minimal" | "overlay" | "classic", PsoHexActionId[]> = {
    minimal: ["mute_mic", "deafen_audio", "join_leave_voice", "click_through", "quick_comm"],
    overlay: ["mute_mic", "deafen_audio", "symbol_rappy", "symbol_editor", "pso_lobby_3d", "click_through"],
    classic: [
        "symbol_rappy",
        "symbol_editor",
        "pso_lobby_3d",
        "tech_resta",
        "tech_shifta",
        "screen_share",
        "mute_mic",
        "deafen_audio",
        "click_through",
        "compact_chat",
    ],
};

interface SymbolChatNotice {
    id: number;
    sender: string;
    subtitle: string;
    variant: "rappy" | "resta" | "shifta" | "deband" | "message";
    body?: string;
    symbolSpec?: PsoSymbolChatSpec;
}

const PARTY_GEM_PALETTE = [
    { name: "Green", fill: "#3be85b", rim: "#b7ffc4", dark: "#0a4a18" },
    { name: "Yellow", fill: "#f5c838", rim: "#fff0ab", dark: "#594106" },
    { name: "Blue", fill: "#388ef5", rim: "#b5d8ff", dark: "#092d5e" },
    { name: "Purple", fill: "#c158f5", rim: "#eccaff", dark: "#400d5e" },
] as const;

function readInitialSymbolPresets(): PsoSymbolChatSpec[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SYMBOL_PRESETS);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return ensureThirtySymbolPresets(parsed as PsoSymbolChatSpec[]);
            }
        }
    } catch {
        // ignore
    }
    return DEFAULT_SYMBOL_PRESETS;
}

function readNumberSetting(key: string, fallback: number): number {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = Number.parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function readInitialDeafened(): boolean {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.DEAFEN) ?? "false") === true;
    } catch {
        return false;
    }
}

function readInitialHexSlots(): PsoHexActionId[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.HEX_SLOTS);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed as PsoHexActionId[];
            }
        }
    } catch {
        // ignore
    }
    return HEX_PRESETS.classic;
}

/**
 * Calculates official PSO Swatch Internet Time (@beats, UTC+1) and local HH:MM.
 */
function computeBeatTime(now: Date = new Date()): { clock: string; beat: string } {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const utcSeconds =
        ((now.getUTCHours() + 1) % 24) * 3600 +
        now.getUTCMinutes() * 60 +
        now.getUTCSeconds() +
        now.getUTCMilliseconds() / 1000;
    const beats = Math.floor((utcSeconds / 86.4) % 1000);
    return {
        clock: `${hh}:${mm}`,
        beat: String(beats).padStart(3, "0"),
    };
}

function sendElectronIpc(name: string, ...args: unknown[]): void {
    try {
        const anyWin = window as unknown as {
            electron?: { send?: (channel: string, payload: unknown) => void };
        };
        anyWin.electron?.send?.("ipcCall", {
            id: Date.now() + Math.random(),
            name,
            args,
        });
    } catch {
        // Ignore if not running inside Electron desktop shell
    }
}

function isEditableElement(el: Element | null): boolean {
    if (!el) return false;
    const htmlEl = el as HTMLElement;
    return (
        htmlEl.tagName === "INPUT" ||
        htmlEl.tagName === "TEXTAREA" ||
        htmlEl.isContentEditable ||
        htmlEl.getAttribute("role") === "textbox" ||
        Boolean(htmlEl.closest(".mx_BasicMessageComposer_input, .pso-quick-reply-input"))
    );
}

const SNAP_ZONE_LABELS: Record<Exclude<PsoSnapZone, null>, string> = {
    "maximize": "SNAP // FULLSCREEN MAXIMIZE",
    "left": "SNAP // LEFT HALF",
    "right": "SNAP // RIGHT HALF",
    "top-left": "SNAP // TOP-LEFT QUARTER",
    "bottom-left": "SNAP // BOTTOM-LEFT QUARTER",
    "top-right": "SNAP // TOP-RIGHT QUARTER",
    "bottom-right": "SNAP // BOTTOM-RIGHT QUARTER",
};

/**
 * Sends a custom PSO HUD packet (`io.pso.lobby_state` or `io.pso.symbol_chat`) directly via
 * `client.http.authedRequest` rather than `client.sendEvent`.
 *
 * Why this is critical:
 * 1. `client.sendEvent` queues local echoes in `room.getPendingEvents()` via `MatrixScheduler`.
 *    If a 3D movement packet is rate-limited or dropped, `sendEvent` marks it `EventStatus.NOT_SENT`,
 *    which triggers Element's red "Some of your messages have not been sent" bar with no visible message!
 * 2. In E2EE rooms, `client.sendEvent` wraps custom events in `m.room.encrypted`, advancing the Megolm
 *    ratchet on every step and causing "Unable to decrypt message" bubbles in the timeline if any device
 *    misses a key. Sending with the explicit `io.pso.*` wire type (just like `m.reaction`) keeps the
 *    timeline 100% clean, avoids E2EE ratchet churn, and never touches `room.getPendingEvents()`.
 */
function sanitizeMatrixJsonNumbers(val: unknown): unknown {
    if (typeof val === "number") {
        if (!Number.isFinite(val)) return 0;
        // If float is within 1e-6 of an integer, return integer; otherwise scale or round or keep only if inside spec object?
        // Wait: Canonical JSON in Matrix Room v10+ FORBIDS ALL floating-point numbers (any number with a fractional part) in room PDU events!
        // Only integers in [-2^53+1, 2^53-1] are permitted in room events!
        return Math.round(val);
    }
    if (Array.isArray(val)) {
        return val.map(sanitizeMatrixJsonNumbers);
    }
    if (val && typeof val === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            out[k] = sanitizeMatrixJsonNumbers(v);
        }
        return out;
    }
    return val;
}

async function sendPsoRoomPacket(
    client: NonNullable<React.ContextType<typeof SDKContext>["client"]>,
    roomId: string,
    eventType: "io.pso.lobby_state" | "io.pso.symbol_chat",
    content: Record<string, unknown>,
): Promise<void> {
    const txnId = client.makeTxnId();
    const path = `/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`;
    const ls = content.lobbyState as Record<string, unknown> | undefined;
    const safeContent =
        eventType === "io.pso.lobby_state" && ls
            ? (sanitizeMatrixJsonNumbers({
                  ...content,
                  lobbyState: {
                      ...ls,
                      x100: Math.round(Number(ls.x ?? 0) * 100),
                      z100: Math.round(Number(ls.z ?? 0) * 100),
                      yaw100: Math.round(Number(ls.yaw ?? 0) * 100),
                      vx100: Math.round(Number(ls.vx ?? 0) * 100),
                      vz100: Math.round(Number(ls.vz ?? 0) * 100),
                  },
              }) as Record<string, unknown>)
            : (sanitizeMatrixJsonNumbers(content) as Record<string, unknown>);
    await client.http.authedRequest("PUT" as any, path, undefined, safeContent);
}

/**
 * Ephemeral To-Device Fast Path (`PUT /_matrix/client/v3/sendToDevice/io.pso.lobby_fast/{txnId}`)
 *
 * Bypasses the Matrix room DAG, timeline persistence, and homeserver event state checks entirely!
 * Delivers 5Hz (200ms) real-time 3D position + velocity (`vx, vz`) + world action packets directly
 * to online Hunters in the room/call in <50ms.
 */
async function sendPsoFastToDevice(
    client: NonNullable<React.ContextType<typeof SDKContext>["client"]>,
    roomId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const room = client.getRoom(roomId);
    if (!room) return;
    const myUserId = client.getUserId();
    const members = room
        .getJoinedMembers()
        .map((m) => m.userId)
        .filter((uid) => uid && uid !== myUserId)
        .slice(0, 24);
    if (members.length === 0) return;

    const messages: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const uid of members) {
        messages[uid] = { "*": payload };
    }
    const txnId = client.makeTxnId();
    const path = `/sendToDevice/${encodeURIComponent("io.pso.lobby_fast")}/${encodeURIComponent(txnId)}`;
    await client.http.authedRequest("PUT" as any, path, undefined, { messages });
}

export function PsoHudOverlay(): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const client = sdkContext.client;

    const [glassAlpha, setGlassAlpha] = useState<number>(() => readNumberSetting(STORAGE_KEYS.GLASS_ALPHA, 0.48));
    const [scanlineAlpha, setScanlineAlpha] = useState<number>(() =>
        readNumberSetting(STORAGE_KEYS.SCANLINE_ALPHA, 0.24),
    );
    const [backdropMode, setBackdropMode] = useState<PsoBackdropMode>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.BACKDROP_MODE) as PsoBackdropMode | null;
            if (saved === "pioneer2" || saved === "custom" || saved === "transparent") {
                return saved;
            }
        } catch {
            // ignore
        }
        return "pioneer2";
    });
    const [customWallpaper, setCustomWallpaper] = useState<string | null>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.CUSTOM_WALLPAPER);
        } catch {
            return null;
        }
    });
    const [sendSymbolToRoom, setSendSymbolToRoom] = useState<boolean>(() => {
        try {
            const val = localStorage.getItem(STORAGE_KEYS.SEND_SYMBOL_TO_ROOM);
            return val === null ? true : val === "true";
        } catch {
            return true;
        }
    });
    const [autoRedactSymbol, setAutoRedactSymbol] = useState<boolean>(() => {
        try {
            const val = localStorage.getItem(STORAGE_KEYS.AUTO_REDACT_SYMBOL);
            return val === null ? true : val === "true";
        } catch {
            return true;
        }
    });
    const [symbolPresets, setSymbolPresets] = useState<PsoSymbolChatSpec[]>(() => readInitialSymbolPresets());
    const [activeSymbolPresetIdx, setActiveSymbolPresetIdx] = useState<number>(() => {
        try {
            const raw = Number.parseInt(localStorage.getItem(STORAGE_KEYS.ACTIVE_SYMBOL_INDEX) ?? "0", 10);
            return Number.isFinite(raw) && raw >= 0 && raw < 30 ? raw : 0;
        } catch {
            return 0;
        }
    });
    const [customSymbolSheetUrl, setCustomSymbolSheetUrl] = useState<string | null>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.CUSTOM_SYMBOL_SHEET);
        } catch {
            return null;
        }
    });
    const [diamondPos, setDiamondPos] = useState<{ x: number; y: number } | null>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.DIAMOND_POS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
                    return { x: parsed.x, y: parsed.y };
                }
            }
        } catch {
            // ignore
        }
        return null;
    });
    const [isDraggingDiamond, setIsDraggingDiamond] = useState<boolean>(false);
    const [postSymbolTextLog, setPostSymbolTextLog] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.POST_SYMBOL_TEXT_LOG) === "true";
        } catch {
            return false;
        }
    });
    const [isSymbolEditorOpen, setIsSymbolEditorOpen] = useState<boolean>(false);
    const [isLobby3dOpen, setIsLobby3dOpen] = useState<boolean>(false);
    const [lobbyPresentationMode, setLobbyPresentationMode] = useState<PsoLobbyPresentationMode>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.LOBBY_PRESENTATION_MODE);
            if (raw === "floating_window" || raw === "unified_stage") return raw;
        } catch {
            // ignore
        }
        return "unified_stage";
    });
    const [isLobbyChatDockVisible, setIsLobbyChatDockVisible] = useState<boolean>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.LOBBY_CHAT_DOCK_VISIBLE);
            return raw === null ? true : raw === "true";
        } catch {
            return true;
        }
    });
    const [remoteLobbyPlayers, setRemoteLobbyPlayers] = useState<Record<string, PsoRemoteLobbyPlayer>>({});
    const [lobbySpeechBubbles, setLobbySpeechBubbles] = useState<Record<string, PsoLobbySpeechBubble>>({});
    const [incomingWorldAction, setIncomingWorldAction] = useState<PsoLobbyWorldAction | null>(null);
    const [savedHunterState, setSavedHunterState] = useState<Partial<PsoPersistedHunterState>>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.SAVED_HUNTER_STATE);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") return parsed;
            }
        } catch {
            // ignore
        }
        return {};
    });
    const [ghostStandbyEnabled, setGhostStandbyEnabled] = useState<boolean>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.GHOST_STANDBY_ENABLED);
            return raw === null ? true : raw === "true";
        } catch {
            return true;
        }
    });
    const lastLocalLobbyStateRef = useRef<Omit<PsoRemoteLobbyPlayer, "userId" | "displayName" | "lastUpdated"> | null>(
        typeof savedHunterState.x === "number"
            ? {
                  x: savedHunterState.x,
                  z: savedHunterState.z ?? 4.5,
                  vx: 0,
                  vz: 0,
                  yaw: savedHunterState.yaw ?? Math.PI,
                  classId: savedHunterState.classId ?? "humar",
                  weaponId: savedHunterState.weaponId ?? "kingdom_key",
                  inChair: savedHunterState.inChair ?? false,
                  attacking: false,
                  emote: "none",
                  ghostMode: true,
                  stageId: savedHunterState.stageId ?? "bb_lobby_01",
              }
            : null,
    );
    const lobbySendInFlightRef = useRef<boolean>(false);
    const lastRoomPacketSentAtRef = useRef<number>(0);

    // Live Matrix Homeserver Ping / Latency & WebAudio Mic dB / Peaking Meter
    const [pingMs, setPingMs] = useState<number>(24);
    const [pingPercent, setPingPercent] = useState<number>(100);
    const [micLevelPct, setMicLevelPct] = useState<number>(0);
    const [isMicPeaking, setIsMicPeaking] = useState<boolean>(false);
    const [speakingPeakMap, setSpeakingPeakMap] = useState<Record<string, boolean>>({});
    const speakingStartRef = useRef<Record<string, number>>({});

    const [isStreamOverlay, setIsStreamOverlay] = useState<boolean>(false);
    const [isCompactChat, setIsCompactChat] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.COMPACT_CHAT) === "true";
        } catch {
            return false;
        }
    });
    const [isCompactOverlaysHidden, setIsCompactOverlaysHidden] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.COMPACT_OVERLAYS_HIDDEN) === "true";
        } catch {
            return false;
        }
    });
    const [isClickThroughGlass, setIsClickThroughGlass] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.CLICK_THROUGH) === "true";
        } catch {
            return false;
        }
    });
    const [pinAlwaysOnTop, setPinAlwaysOnTop] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEYS.PIN_ALWAYS_ON_TOP) === "true";
        } catch {
            return false;
        }
    });
    const [hexSlots, setHexSlots] = useState<PsoHexActionId[]>(() => readInitialHexSlots());
    const [showHexCustomizer, setShowHexCustomizer] = useState<boolean>(false);
    const [snapPreviewZone, setSnapPreviewZone] = useState<PsoSnapZone>(null);

    const [isTunerOpen, setIsTunerOpen] = useState<boolean>(false);
    const [isQuickReplyOpen, setIsQuickReplyOpen] = useState<boolean>(false);
    const [quickReplyText, setQuickReplyText] = useState<string>("");
    const [activeHexAction, setActiveHexAction] = useState<PsoHexActionId>("symbol_rappy");
    const [beatTime, setBeatTime] = useState<{ clock: string; beat: string }>(() => computeBeatTime());
    const [symbolNotice, setSymbolNotice] = useState<SymbolChatNotice | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const quickReplyInputRef = useRef<HTMLInputElement | null>(null);
    const tunerPopoverRef = useRef<HTMLDivElement | null>(null);
    const tunerToggleRef = useRef<HTMLButtonElement | null>(null);
    const noticeTimeoutRef = useRef<number | null>(null);
    const lastIgnoreMouseRef = useRef<boolean>(false);
    const isDraggingWindowRef = useRef<boolean>(false);

    const activeCall = useEventEmitterState(
        CallStore.instance,
        CallStoreEvent.ConnectedCalls,
        useCallback((): Call | null => {
            const calls = [...CallStore.instance.connectedCalls];
            return calls[0] ?? null;
        }, []),
    );

    const liveParticipants = useLiveParticipants(activeCall);
    const localParticipant = liveParticipants.find((p) => p.local);

    const callMuteState = useTypedEventEmitterState(
        activeCall ?? undefined,
        CallEvent.DeviceMute,
        useCallback(
            () => ({
                audioMuted: activeCall?.audioMuted ?? false,
                videoMuted: activeCall?.videoMuted ?? true,
                deafened: activeCall?.deafened ?? readInitialDeafened(),
            }),
            [activeCall],
        ),
    );

    const [idleAudioMuted, setIdleAudioMuted] = useState(false);
    const [idleDeafened, setIdleDeafened] = useState<boolean>(() => readInitialDeafened());

    const isAudioMuted = activeCall
        ? localParticipant
            ? !localParticipant.audioEnabled
            : callMuteState.audioMuted
        : idleAudioMuted;
    const isDeafened = activeCall ? callMuteState.deafened : idleDeafened;
    const isLocalSharing = Boolean(localParticipant?.screenSharing);

    const profile = useEventEmitterState(
        OwnProfileStore.instance,
        UPDATE_EVENT,
        useCallback(() => {
            const userId = client?.getUserId() ?? "";
            const displayName = OwnProfileStore.instance.displayName || userId.replace(/^@|:.*$/g, "") || "Shichimiya";
            const avatarUrl = OwnProfileStore.instance.getHttpAvatarUrl(64) ?? null;
            return { userId, displayName, avatarUrl };
        }, [client]),
    );

    const saveSymbolPresets = useCallback((nextPresets: PsoSymbolChatSpec[]): void => {
        setSymbolPresets(nextPresets);
        try {
            localStorage.setItem(STORAGE_KEYS.SYMBOL_PRESETS, JSON.stringify(nextPresets));
        } catch {
            // ignore
        }
    }, []);

    const selectSymbolPresetIndex = useCallback((idx: number): void => {
        setActiveSymbolPresetIdx(idx);
        try {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SYMBOL_INDEX, String(idx));
        } catch {
            // ignore
        }
    }, []);

    const saveCustomSymbolSheet = useCallback((dataUrl: string | null): void => {
        setCustomSymbolSheetUrl(dataUrl);
        try {
            if (dataUrl) {
                localStorage.setItem(STORAGE_KEYS.CUSTOM_SYMBOL_SHEET, dataUrl);
            } else {
                localStorage.removeItem(STORAGE_KEYS.CUSTOM_SYMBOL_SHEET);
            }
        } catch {
            // ignore
        }
    }, []);

    const saveDiamondPos = useCallback((pos: { x: number; y: number } | null): void => {
        setDiamondPos(pos);
        try {
            if (pos) {
                localStorage.setItem(STORAGE_KEYS.DIAMOND_POS, JSON.stringify(pos));
            } else {
                localStorage.removeItem(STORAGE_KEYS.DIAMOND_POS);
            }
        } catch {
            // ignore
        }
    }, []);

    // Close the Gear (HUD Tuner) popover whenever the user clicks outside of it (Note: data-testid is stripped in prod builds by babel-plugin-jsx-remove-data-test-id, so always use refs + class selectors!)
    useEffect(() => {
        if (!isTunerOpen) return;
        const onPointerDownOutside = (e: PointerEvent | MouseEvent): void => {
            const target = e.target as Node | null;
            if (!target) return;
            const el = target instanceof Element ? target : target.parentElement;
            if (
                tunerPopoverRef.current?.contains(target) ||
                tunerToggleRef.current?.contains(target) ||
                el?.closest(".pso-tuner-popover") ||
                el?.closest(".pso-tri-hex--diamond-bottom")
            ) {
                return;
            }
            setIsTunerOpen(false);
        };
        window.addEventListener("pointerdown", onPointerDownOutside, true);
        return () => window.removeEventListener("pointerdown", onPointerDownOutside, true);
    }, [isTunerOpen]);

    // Measure live Matrix Homeserver latency (mapped to the PSO HP bar)
    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        const measurePing = async (): Promise<void> => {
            const baseUrl = client.baseUrl;
            if (!baseUrl) return;
            const t0 = performance.now();
            try {
                await fetch(`${baseUrl}/_matrix/client/versions`, { cache: "no-store" });
                if (cancelled) return;
                const rtt = Math.max(4, Math.round(performance.now() - t0));
                setPingMs(rtt);
                const health = Math.max(12, Math.min(100, Math.round(100 - Math.max(0, rtt - 25) * 0.25)));
                setPingPercent(health);
            } catch {
                if (!cancelled) {
                    setPingMs(999);
                    setPingPercent(15);
                }
            }
        };
        void measurePing();
        const interval = window.setInterval(() => void measurePing(), 8000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [client]);

    // Live WebAudio Microphone RMS & Mean dB Peaking Detector (Shifta Red = Peaking / Too Loud, Deband Blue = Shield / Gate)
    useEffect(() => {
        if (isAudioMuted) {
            setMicLevelPct(0);
            setIsMicPeaking(false);
            return;
        }
        let cancelled = false;
        let audioCtx: AudioContext | null = null;
        let stream: MediaStream | null = null;
        let rafTimer: number | null = null;

        const startMicMeter = async (): Promise<void> => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                    video: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                const AudioCtx =
                    window.AudioContext ||
                    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                audioCtx = new AudioCtx();
                const source = audioCtx.createMediaStreamSource(stream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.65;
                source.connect(analyser);
                const buf = new Float32Array(analyser.fftSize);

                const sample = (): void => {
                    if (cancelled) return;
                    analyser.getFloatTimeDomainData(buf);
                    let sumSq = 0;
                    let maxAbs = 0;
                    for (let i = 0; i < buf.length; i++) {
                        const v = buf[i];
                        sumSq += v * v;
                        const abs = Math.abs(v);
                        if (abs > maxAbs) maxAbs = abs;
                    }
                    const rms = Math.sqrt(sumSq / buf.length);
                    const db = 20 * Math.log10(Math.max(rms, 0.0001));
                    // Normalize -55dB..0dB -> 0..100%
                    const pct = Math.max(0, Math.min(100, Math.round(((db + 55) / 55) * 100)));
                    setMicLevelPct(pct);
                    // Mean dB peaking warning (Shifta Red badge): RMS > -11 dBFS or peak > 0.72
                    setIsMicPeaking(db > -11 || maxAbs > 0.72);
                };

                rafTimer = window.setInterval(sample, 100);
            } catch {
                // Fallback if microphone device isn't granted yet: derive from localParticipant.speaking
            }
        };

        if (activeCall || isCompactChat || isStreamOverlay) {
            void startMicMeter();
        }

        return () => {
            cancelled = true;
            if (rafTimer !== null) window.clearInterval(rafTimer);
            if (stream) stream.getTracks().forEach((t) => t.stop());
            if (audioCtx) void audioCtx.close().catch(() => {});
        };
    }, [activeCall, isAudioMuted, isCompactChat, isStreamOverlay]);

    // Track remote participant sustained speaking / peaking so their Shifta red badge lights up when loud/sustained
    useEffect(() => {
        const now = Date.now();
        const nextMap: Record<string, boolean> = {};
        for (const p of liveParticipants) {
            if (p.speaking && p.audioEnabled) {
                if (!speakingStartRef.current[p.id]) {
                    speakingStartRef.current[p.id] = now;
                }
                nextMap[p.id] = now - speakingStartRef.current[p.id] > 1400;
            } else {
                delete speakingStartRef.current[p.id];
                nextMap[p.id] = false;
            }
        }
        setSpeakingPeakMap(nextMap);
    }, [liveParticipants]);

    const showSymbolNotice = useCallback((notice: Omit<SymbolChatNotice, "id">, durationMs = 4500) => {
        if (noticeTimeoutRef.current !== null) {
            window.clearTimeout(noticeTimeoutRef.current);
        }
        setSymbolNotice({
            ...notice,
            id: Date.now(),
        });
        noticeTimeoutRef.current = window.setTimeout(() => {
            setSymbolNotice(null);
            noticeTimeoutRef.current = null;
        }, durationMs);
    }, []);

    // Live Swatch @beat clock update
    const handlePersistHunterState = useCallback((state: PsoPersistedHunterState) => {
        setSavedHunterState(state);
        try {
            localStorage.setItem(STORAGE_KEYS.SAVED_HUNTER_STATE, JSON.stringify(state));
        } catch {
            // ignore
        }
    }, []);

    // When the 3D Lobby window closes (or while closed with Ghost Standby enabled), keep our Hunter persistent as a Ghost Avatar (`ghostMode: true`) so others still see us and our chat balloons!
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.GHOST_STANDBY_ENABLED, String(ghostStandbyEnabled));
        } catch {
            // ignore
        }

        if (isLobby3dOpen || !ghostStandbyEnabled || !lastLocalLobbyStateRef.current) return;

        lastLocalLobbyStateRef.current = {
            ...lastLocalLobbyStateRef.current,
            vx: 0,
            vz: 0,
            attacking: false,
            ghostMode: true,
        };

        const broadcastGhostPresence = (): void => {
            const roomId = sdkContext.roomViewStore.getRoomId() ?? activeCall?.roomId ?? null;
            if (!client || !roomId || !lastLocalLobbyStateRef.current) return;
            const payload = {
                roomId,
                lobbyState: {
                    ...lastLocalLobbyStateRef.current,
                    vx: 0,
                    vz: 0,
                    attacking: false,
                    ghostMode: true,
                },
                senderName: profile.displayName,
                ts: Date.now(),
            };
            void sendPsoFastToDevice(client, roomId, payload).catch(() => {});
            void sendPsoRoomPacket(client, roomId, "io.pso.lobby_state", payload).catch(() => {});
        };

        broadcastGhostPresence();
        const interval = window.setInterval(broadcastGhostPresence, 20000);
        return () => window.clearInterval(interval);
    }, [isLobby3dOpen, ghostStandbyEnabled, client, sdkContext, activeCall?.roomId, profile.displayName]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setBeatTime(computeBeatTime());
        }, 5000);
        return () => window.clearInterval(timer);
    }, []);

    // Sync CSS Custom Properties, body classes, transparency, and Always-On-Top state
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty("--pso-glass-alpha", String(glassAlpha));
        root.style.setProperty("--pso-scanline-alpha", String(scanlineAlpha));
        document.body.classList.add("pso-hud-theme");
        document.body.classList.toggle("pso-stream-overlay-mode", isStreamOverlay);
        document.body.classList.toggle("pso-compact-chat-mode", isCompactChat);
        document.body.classList.toggle("pso-compact-overlays-hidden", isCompactChat && isCompactOverlaysHidden);
        document.body.classList.toggle("pso-click-through-glass", isClickThroughGlass);
        document.body.classList.toggle(
            "pso-unified-guild-stage",
            isLobby3dOpen && lobbyPresentationMode === "unified_stage",
        );
        document.body.classList.toggle(
            "pso-unified-guild-chat-dock",
            isLobby3dOpen && lobbyPresentationMode === "unified_stage" && isLobbyChatDockVisible,
        );
        document.body.classList.toggle(
            "pso-unified-guild-chat-hidden",
            isLobby3dOpen && lobbyPresentationMode === "unified_stage" && !isLobbyChatDockVisible,
        );

        const isTransparent =
            isStreamOverlay || isCompactChat || isClickThroughGlass || backdropMode === "transparent";
        document.body.classList.toggle("pso-transparent-desktop", isTransparent);
        sendElectronIpc("setPsoTransparentMode", isTransparent);

        const shouldPinTop = isStreamOverlay || isCompactChat || isClickThroughGlass || pinAlwaysOnTop;
        sendElectronIpc("setPsoAlwaysOnTop", shouldPinTop);

        try {
            localStorage.setItem(STORAGE_KEYS.GLASS_ALPHA, String(glassAlpha));
            localStorage.setItem(STORAGE_KEYS.SCANLINE_ALPHA, String(scanlineAlpha));
            localStorage.setItem(STORAGE_KEYS.BACKDROP_MODE, backdropMode);
            localStorage.setItem(STORAGE_KEYS.COMPACT_CHAT, String(isCompactChat));
            localStorage.setItem(STORAGE_KEYS.COMPACT_OVERLAYS_HIDDEN, String(isCompactOverlaysHidden));
            localStorage.setItem(STORAGE_KEYS.CLICK_THROUGH, String(isClickThroughGlass));
            localStorage.setItem(STORAGE_KEYS.PIN_ALWAYS_ON_TOP, String(pinAlwaysOnTop));
            localStorage.setItem(STORAGE_KEYS.HEX_SLOTS, JSON.stringify(hexSlots));
            localStorage.setItem(STORAGE_KEYS.LOBBY_PRESENTATION_MODE, lobbyPresentationMode);
            localStorage.setItem(STORAGE_KEYS.LOBBY_CHAT_DOCK_VISIBLE, String(isLobbyChatDockVisible));
        } catch {
            // ignore storage errors
        }
    }, [
        glassAlpha,
        scanlineAlpha,
        backdropMode,
        isStreamOverlay,
        isCompactChat,
        isCompactOverlaysHidden,
        isClickThroughGlass,
        pinAlwaysOnTop,
        hexSlots,
        isLobby3dOpen,
        lobbyPresentationMode,
        isLobbyChatDockVisible,
    ]);

    // Smart hit-testing for Mouse & Keyboard Click-Through to windows behind the glass
    useEffect(() => {
        const passThroughActive = isStreamOverlay || isCompactChat || isClickThroughGlass;
        if (!passThroughActive) {
            if (lastIgnoreMouseRef.current) {
                lastIgnoreMouseRef.current = false;
                sendElectronIpc("setPsoIgnoreMouseEvents", false);
            }
            return;
        }

        const evaluatePointerPassThrough = (clientX: number, clientY: number): void => {
            if (isDraggingWindowRef.current) {
                if (lastIgnoreMouseRef.current) {
                    lastIgnoreMouseRef.current = false;
                    sendElectronIpc("setPsoIgnoreMouseEvents", false);
                }
                return;
            }

            const el = document.elementFromPoint(clientX, clientY);
            const overHudControl = Boolean(el?.closest(".pso-interactive"));
            const overComposer = Boolean(
                el?.closest(".mx_MessageComposer, .pso-quick-reply-bar, .mx_BasicMessageComposer"),
            );
            const overCompactChatWindow = Boolean(el?.closest(".mx_RoomView_wrapper"));

            let shouldCaptureMouse = false;
            if (overHudControl || isTunerOpen || isQuickReplyOpen || isSymbolEditorOpen || isLobby3dOpen) {
                shouldCaptureMouse = true;
            } else if (isStreamOverlay) {
                shouldCaptureMouse = false;
            } else if (isClickThroughGlass) {
                // In Click-Through Glass mode, pass clicks through all glass panels except the message composer & HUD controls
                shouldCaptureMouse = overComposer;
            } else if (isCompactChat) {
                // In Compact Chat mode (without Click-Through lock), capture inside the floating chatbox, pass through outside it
                shouldCaptureMouse = overCompactChatWindow;
            }

            const shouldIgnore = !shouldCaptureMouse;
            if (shouldIgnore !== lastIgnoreMouseRef.current) {
                lastIgnoreMouseRef.current = shouldIgnore;
                sendElectronIpc("setPsoIgnoreMouseEvents", shouldIgnore);
                if (shouldIgnore && !isEditableElement(document.activeElement)) {
                    sendElectronIpc("psoReleaseFocusToBackground");
                }
            }
        };

        const onMouseMove = (e: MouseEvent): void => {
            evaluatePointerPassThrough(e.clientX, e.clientY);
        };

        window.addEventListener("mousemove", onMouseMove, { passive: true });
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            if (lastIgnoreMouseRef.current) {
                lastIgnoreMouseRef.current = false;
                sendElectronIpc("setPsoIgnoreMouseEvents", false);
            }
        };
    }, [isStreamOverlay, isCompactChat, isClickThroughGlass, isTunerOpen, isQuickReplyOpen, isSymbolEditorOpen, isLobby3dOpen]);

    // Release keyboard focus back to the background window after sending a message in the room composer when pass-through is active
    useEffect(() => {
        const passThroughActive = isStreamOverlay || isCompactChat || isClickThroughGlass;
        if (!passThroughActive) return;

        const onComposerKeyUp = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                sendElectronIpc("psoReleaseFocusToBackground");
            } else if (e.key === "Enter" && !e.shiftKey && isClickThroughGlass) {
                // After hitting Enter to send a message while Click-Through Glass is locked on, return keyboard focus to the game/window behind
                window.setTimeout(() => {
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                    sendElectronIpc("psoReleaseFocusToBackground");
                }, 60);
            }
        };

        window.addEventListener("keyup", onComposerKeyUp, true);
        return () => window.removeEventListener("keyup", onComposerKeyUp, true);
    }, [isStreamOverlay, isCompactChat, isClickThroughGlass]);

    // Listen for main-process psoHudEvent messages (Snap preview zones & Global Shortcuts when background window has focus)
    useEffect(() => {
        const anyWin = window as unknown as {
            electron?: {
                on?: (channel: string, listener: (_ev: unknown, payload: { type?: string; zone?: PsoSnapZone }) => void) => void;
            };
        };
        if (!anyWin.electron?.on) return;

        const handler = (_ev: unknown, payload: { type?: string; zone?: PsoSnapZone }): void => {
            if (!payload || typeof payload !== "object") return;
            switch (payload.type) {
                case "snapPreview":
                    setSnapPreviewZone(payload.zone ?? null);
                    break;
                case "toggleClickThrough":
                    setIsClickThroughGlass((prev) => {
                        const next = !prev;
                        if (next) {
                            sendElectronIpc("psoReleaseFocusToBackground");
                        }
                        return next;
                    });
                    break;
                case "toggleCompactChat":
                    setIsCompactChat((prev) => {
                        const next = !prev;
                        if (next && isStreamOverlay) {
                            setIsStreamOverlay(false);
                        }
                        return next;
                    });
                    break;
                case "toggleStreamOverlay":
                    setIsStreamOverlay((prev) => !prev);
                    break;
                case "toggleQuickReply":
                    setIsQuickReplyOpen((prev) => {
                        const next = !prev;
                        if (next) {
                            sendElectronIpc("setPsoIgnoreMouseEvents", false);
                            sendElectronIpc("psoFocusWindow");
                            window.setTimeout(() => quickReplyInputRef.current?.focus(), 50);
                        } else {
                            sendElectronIpc("psoReleaseFocusToBackground");
                        }
                        return next;
                    });
                    break;
            }
        };

        anyWin.electron.on("psoHudEvent", handler);
    }, [isStreamOverlay]);

    // Listen for incoming room timeline & E2EE decrypted events (including custom non-message `io.pso.symbol_chat` & `io.pso.lobby_state` events)
    useEffect(() => {
        if (!client) return;
        const mountedAt = Date.now();
        const seenEventIds = new Set<string>();
        const livePendingEvents = new WeakSet<MatrixEvent>();

        const processPsoEvent = (event: MatrixEvent): void => {
            if (event.isRedacted()) return;

            // IMPORTANT: In matrix-js-sdk, `event.isEncrypted()` remains `true` FOREVER even after decryption!
            // Before decryption, `event.getType()` is `"m.room.encrypted"` (`EventType.RoomMessageEncrypted`).
            // After decryption, `event.getType()` changes to the decrypted clearEvent type (`"io.pso.symbol_chat"` or `"m.room.message"`).
            if (
                event.isBeingDecrypted() ||
                event.getType() === EventType.RoomMessageEncrypted ||
                (event.isEncrypted() && event.getClearContent() === null)
            ) {
                if (!event.isDecryptionFailure()) {
                    void client.decryptEventIfNeeded(event);
                }
                return;
            }

            const eventId = event.getId();
            const eventType = event.getType();
            const senderId = event.getSender() || "hunter";
            const isOwnEvent = senderId === client.getUserId();
            const rawContent = (event.getClearContent() ?? event.getContent() ?? {}) as Record<string, any>;

            // 1. Custom Ephemeral PSO Symbol Chat Event (Zero chat log clutter, just like Element Call reactions!)
            if (eventType === "io.pso.symbol_chat") {
                if (eventId && seenEventIds.has(eventId)) return;
                if (eventId) seenEventIds.add(eventId);

                const customSymbol = (rawContent.spec ?? rawContent["io.pso.symbol_chat"]) as
                    | PsoSymbolChatSpec
                    | undefined;
                const senderName =
                    (typeof rawContent.senderName === "string" && rawContent.senderName) ||
                    event.sender?.name ||
                    senderId ||
                    "Hunter";

                if (customSymbol && Array.isArray(customSymbol.layers) && !isOwnEvent) {
                    playPsoSymbolChime(customSymbol.chime ?? "rappy");
                    setRemoteLobbyPlayers((prev) =>
                        prev[senderId]
                            ? { ...prev, [senderId]: { ...prev[senderId], symbolSpec: customSymbol } }
                            : prev,
                    );
                    showSymbolNotice(
                        {
                            sender: senderName,
                            subtitle: `SYMBOL CHAT // ${customSymbol.name}`,
                            variant: "rappy",
                            symbolSpec: customSymbol,
                        },
                        5500,
                    );
                }
                return;
            }

            // 2. Custom Ephemeral 3D Pioneer 2 Lobby State Event (Zero chat log clutter!)
            if (eventType === "io.pso.lobby_state" || eventType === "io.pso.lobby_fast") {
                const rawLobbyState = rawContent.lobbyState as
                    | (Omit<PsoRemoteLobbyPlayer, "userId" | "displayName" | "lastUpdated"> & {
                          x100?: number;
                          z100?: number;
                          yaw100?: number;
                          vx100?: number;
                          vz100?: number;
                          requestSync?: boolean;
                          worldAction?: PsoLobbyWorldAction;
                      })
                    | undefined;
                const lobbyState = rawLobbyState
                    ? {
                          ...rawLobbyState,
                          x: typeof rawLobbyState.x100 === "number" ? rawLobbyState.x100 / 100 : rawLobbyState.x,
                          z: typeof rawLobbyState.z100 === "number" ? rawLobbyState.z100 / 100 : rawLobbyState.z,
                          yaw: typeof rawLobbyState.yaw100 === "number" ? rawLobbyState.yaw100 / 100 : rawLobbyState.yaw,
                          vx: typeof rawLobbyState.vx100 === "number" ? rawLobbyState.vx100 / 100 : rawLobbyState.vx,
                          vz: typeof rawLobbyState.vz100 === "number" ? rawLobbyState.vz100 / 100 : rawLobbyState.vz,
                      }
                    : undefined;
                const senderName =
                    (typeof rawContent.senderName === "string" && rawContent.senderName) ||
                    event.sender?.name ||
                    senderId ||
                    "Hunter";
                if (lobbyState && typeof lobbyState.x === "number" && !isOwnEvent) {
                    setRemoteLobbyPlayers((prev) => ({
                        ...prev,
                        [senderId]: {
                            ...lobbyState,
                            userId: senderId,
                            displayName: senderName,
                            lastUpdated: Date.now(),
                        },
                    }));
                    if (lobbyState.worldAction) {
                        setIncomingWorldAction(lobbyState.worldAction);
                    }
                    // If the other player just opened their 3D Lobby (`requestSync: true`) and we have a known 3D state, immediately reply with our coordinates so both Hunters appear right away!
                    if (lobbyState.requestSync && lastLocalLobbyStateRef.current) {
                        const targetRoomId =
                            event.getRoomId() ??
                            (typeof rawContent.roomId === "string" ? rawContent.roomId : null) ??
                            sdkContext.roomViewStore.getRoomId() ??
                            activeCall?.roomId ??
                            null;
                        if (targetRoomId) {
                            const replyPayload = {
                                roomId: targetRoomId,
                                lobbyState: { ...lastLocalLobbyStateRef.current, requestSync: false },
                                senderName: profile.displayName,
                                ts: Date.now(),
                            };
                            void sendPsoFastToDevice(client, targetRoomId, replyPayload).catch(() => {});
                            void sendPsoRoomPacket(client, targetRoomId, "io.pso.lobby_state", replyPayload).catch(
                                () => {},
                            );
                        }
                    }
                }
                return;
            }

            // 3. Standard RoomMessage fallback (if someone also attaches io.pso.symbol_chat to a regular message)
            if (eventType !== EventType.RoomMessage) return;
            if (eventId && seenEventIds.has(eventId)) return;
            if (eventId) seenEventIds.add(eventId);

            const body = typeof rawContent.body === "string" ? rawContent.body : "";
            const customSymbol = rawContent["io.pso.symbol_chat"] as PsoSymbolChatSpec | undefined;
            const lobbyState = rawContent["io.pso.lobby_state"] as
                | Omit<PsoRemoteLobbyPlayer, "userId" | "displayName" | "lastUpdated">
                | undefined;
            const senderName = event.sender?.name || senderId || "Hunter";

            if (lobbyState && typeof lobbyState.x === "number") {
                if (!isOwnEvent) {
                    setRemoteLobbyPlayers((prev) => ({
                        ...prev,
                        [senderId]: {
                            ...lobbyState,
                            userId: senderId,
                            displayName: senderName,
                            lastUpdated: Date.now(),
                        },
                    }));
                }
                return;
            }

            if (customSymbol && Array.isArray(customSymbol.layers)) {
                if (!isOwnEvent) {
                    playPsoSymbolChime(customSymbol.chime ?? "rappy");
                    setRemoteLobbyPlayers((prev) =>
                        prev[senderId]
                            ? { ...prev, [senderId]: { ...prev[senderId], symbolSpec: customSymbol } }
                            : prev,
                    );
                    showSymbolNotice(
                        {
                            sender: senderName,
                            subtitle: `SYMBOL CHAT // ${customSymbol.name}`,
                            variant: "rappy",
                            symbolSpec: customSymbol,
                            body,
                        },
                        5500,
                    );
                }
                return;
            }

            if (!body) return;

            // Record 3D overhead speech bubble for any Hunter in the room when they send a chat message!
            setLobbySpeechBubbles((prev) => ({
                ...prev,
                [senderId]: {
                    text: body.length > 96 ? `${body.slice(0, 96)}…` : body,
                    senderName,
                    sentAt: Date.now(),
                },
            }));

            // If we sent a normal Element chat message while our 3D Lobby window is closed and Ghost Standby is enabled,
            // refresh our Ghost Hunter's presence so everyone in the 3D Lobby sees our overhead speech balloon above our Ghost!
            if (isOwnEvent && !isLobby3dOpen && ghostStandbyEnabled && lastLocalLobbyStateRef.current) {
                const targetRoomId =
                    event.getRoomId() ?? sdkContext.roomViewStore.getRoomId() ?? activeCall?.roomId ?? null;
                if (targetRoomId) {
                    const ghostPayload = {
                        roomId: targetRoomId,
                        lobbyState: {
                            ...lastLocalLobbyStateRef.current,
                            vx: 0,
                            vz: 0,
                            attacking: false,
                            ghostMode: true,
                        },
                        senderName: profile.displayName,
                        ts: Date.now(),
                    };
                    void sendPsoFastToDevice(client, targetRoomId, ghostPayload).catch(() => {});
                }
            }

            if (body.includes("🐤") || body.toLowerCase().includes("symbol chat")) {
                if (!isOwnEvent) {
                    playPsoSymbolChime("rappy");
                }
                showSymbolNotice({
                    sender: senderName,
                    subtitle: "SYMBOL CHAT // EP.IV",
                    variant: "rappy",
                    symbolSpec: DEFAULT_SYMBOL_PRESETS[0],
                    body,
                });
            } else if (isStreamOverlay || isCompactChat) {
                showSymbolNotice({
                    sender: senderName,
                    subtitle: "COMM LOG // INCOMING",
                    variant: "message",
                    body,
                });
            }
        };

        const onRoomTimeline = (
            event: MatrixEvent,
            _room: Room | undefined,
            toStartOfTimeline: boolean | undefined,
            removed: boolean,
            data: IRoomTimelineData,
        ): void => {
            if (removed || toStartOfTimeline || (data && !data.liveEvent)) return;
            // Ignore initial sync flood in the first 2.5 seconds after app boot
            if (Date.now() - mountedAt < 2500) return;

            livePendingEvents.add(event);
            processPsoEvent(event);
        };

        const onEventDecrypted = (event: MatrixEvent): void => {
            if (!livePendingEvents.has(event)) return;
            processPsoEvent(event);
        };

        // Automatically cancel any stuck `io.pso.*` pending events from earlier sessions so they never trigger the red "Some of your messages have not been sent" bar
        const purgeStuckPsoPendingEvents = (): void => {
            for (const room of client.getRooms()) {
                for (const ev of [...room.getPendingEvents()]) {
                    const evType = ev.getType() || "";
                    const wireType = ev.getWireType() || "";
                    const content = (ev.getClearContent() ?? ev.getContent() ?? {}) as Record<string, unknown>;
                    if (
                        evType.startsWith("io.pso.") ||
                        wireType.startsWith("io.pso.") ||
                        content.lobbyState !== undefined ||
                        content.spec !== undefined
                    ) {
                        try {
                            client.cancelPendingEvent(ev);
                        } catch {
                            // ignore
                        }
                    }
                }
            }
        };
        purgeStuckPsoPendingEvents();

        const onToDeviceEvent = (event: MatrixEvent): void => {
            if (event.getType() === "io.pso.lobby_fast" || event.getType() === "io.pso.symbol_chat") {
                processPsoEvent(event);
            }
        };

        client.on(RoomEvent.Timeline, onRoomTimeline);
        client.on(MatrixEventEvent.Decrypted, onEventDecrypted);
        client.on(ClientEvent.ToDeviceEvent, onToDeviceEvent);
        return () => {
            client.off(RoomEvent.Timeline, onRoomTimeline);
            client.off(MatrixEventEvent.Decrypted, onEventDecrypted);
            client.off(ClientEvent.ToDeviceEvent, onToDeviceEvent);
        };
    }, [activeCall?.roomId, client, isCompactChat, isStreamOverlay, profile.displayName, sdkContext.roomViewStore, showSymbolNotice]);

    const sendRoomTextIfEnabled = useCallback(
        async (text: string, forceSend = false): Promise<void> => {
            if (!forceSend && !sendSymbolToRoom) return;
            const roomId = sdkContext.roomViewStore.getRoomId();
            if (!client || !roomId) return;
            try {
                await client.sendTextMessage(roomId, text);
            } catch {
                // ignore send errors if room is read-only
            }
        },
        [client, sdkContext.roomViewStore, sendSymbolToRoom],
    );

    const transmitSymbolChat = useCallback(
        async (spec: PsoSymbolChatSpec): Promise<void> => {
            playPsoSymbolChime(spec.chime ?? "rappy");
            showSymbolNotice(
                {
                    sender: profile.displayName,
                    subtitle: `SYMBOL CHAT // ${spec.name.toUpperCase()}`,
                    variant: "rappy",
                    symbolSpec: spec,
                },
                5500,
            );

            if (!sendSymbolToRoom) return;
            const roomId = sdkContext.roomViewStore.getRoomId() ?? activeCall?.roomId ?? null;
            if (!client || !roomId) return;

            try {
                // 1. Send custom Matrix packet `io.pso.symbol_chat` directly via HTTP PUT (zero pending-event queue & zero E2EE ratchet clutter!)
                try {
                    await sendPsoRoomPacket(client, roomId, "io.pso.symbol_chat", {
                        spec,
                        senderName: profile.displayName,
                        ts: Date.now(),
                    });
                } catch {
                    // Fallback if custom event type is restricted by room power levels: send message with auto-redact
                    const fallbackRes = await client.sendMessage(roomId, {
                        msgtype: "m.notice" as any,
                        body: `🐤 [Symbol Chat: ${spec.name}]`,
                        "io.pso.symbol_chat": spec,
                    } as any);
                    if (fallbackRes?.event_id) {
                        window.setTimeout(() => {
                            void client
                                .redactEvent(roomId, fallbackRes.event_id, undefined, {
                                    reason: "PSO Ephemeral Symbol Chat expired",
                                })
                                .catch(() => {});
                        }, 6000);
                    }
                    return;
                }

                // 2. Optional: Only if the user explicitly toggled "Also post text line in chat", send a chat message
                if (postSymbolTextLog) {
                    const res = await client.sendMessage(roomId, {
                        msgtype: "m.text" as any,
                        body: `🐤 [Symbol Chat: ${spec.name}]`,
                        "io.pso.symbol_chat": spec,
                    } as any);

                    if (autoRedactSymbol && res?.event_id) {
                        window.setTimeout(() => {
                            void client
                                .redactEvent(roomId, res.event_id, undefined, {
                                    reason: "PSO Ephemeral Symbol Chat expired",
                                })
                                .catch(() => {});
                        }, 9000);
                    }
                }
            } catch {
                // Ignore if room is read-only
            }
        },
        [
            activeCall?.roomId,
            autoRedactSymbol,
            client,
            postSymbolTextLog,
            profile.displayName,
            sdkContext.roomViewStore,
            sendSymbolToRoom,
            showSymbolNotice,
        ],
    );

    const onToggleMute = useCallback((): void => {
        if (activeCall) {
            void activeCall.setDeviceMute({ audio_enabled: isAudioMuted });
        } else {
            setIdleAudioMuted((prev) => !prev);
        }
    }, [activeCall, isAudioMuted]);

    const onToggleDeafen = useCallback((): void => {
        const nextDeafened = !isDeafened;
        setIdleDeafened(nextDeafened);
        try {
            localStorage.setItem(STORAGE_KEYS.DEAFEN, JSON.stringify(nextDeafened));
        } catch {
            // ignore
        }
        if (activeCall) {
            void activeCall.setDeviceMute({ deafened: nextDeafened });
        }
    }, [activeCall, isDeafened]);

    const onJoinOrLeaveVoice = useCallback((): void => {
        if (activeCall) {
            void activeCall.disconnect();
            showSymbolNotice({
                sender: profile.displayName,
                subtitle: "COMM LINK // CLOSED",
                variant: "message",
                body: "📴 Disconnected from voice channel.",
            });
            return;
        }
        const roomId = sdkContext.roomViewStore.getRoomId();
        if (roomId) {
            defaultDispatcher.dispatch<ViewRoomPayload>({
                action: Action.ViewRoom,
                room_id: roomId,
                view_call: true,
                metricsTrigger: "RoomList",
            });
            showSymbolNotice({
                sender: profile.displayName,
                subtitle: "COMM LINK // OPENING",
                variant: "message",
                body: "📞 Opening room voice/video link...",
            });
        }
    }, [activeCall, profile.displayName, sdkContext.roomViewStore, showSymbolNotice]);

    const executeHexAction = useCallback(
        (actionId: PsoHexActionId): void => {
            setActiveHexAction(actionId);
            switch (actionId) {
                case "symbol_rappy": {
                    const activeSpec = symbolPresets[activeSymbolPresetIdx] ?? DEFAULT_SYMBOL_PRESETS[0];
                    void transmitSymbolChat(activeSpec);
                    break;
                }
                case "symbol_editor": {
                    setIsSymbolEditorOpen((prev) => !prev);
                    break;
                }
                case "pso_lobby_3d": {
                    setIsLobby3dOpen((prev) => !prev);
                    break;
                }
                case "tech_resta": {
                    showSymbolNotice({
                        sender: profile.displayName,
                        subtitle: "TECHNIQUE // RESTA Lv30",
                        variant: "resta",
                        body: "💚 Resta Lv30 — Party HP Restored (+1345)!",
                    });
                    void sendRoomTextIfEnabled("💚 [PSO Technique: Resta Lv30 — Party HP Restored!]");
                    break;
                }
                case "tech_shifta": {
                    showSymbolNotice({
                        sender: profile.displayName,
                        subtitle: "TECHNIQUE // SHIFTA Lv30",
                        variant: "shifta",
                        body: "🔺 Shifta Lv30 — ATP Attack Boost Active!",
                    });
                    void sendRoomTextIfEnabled("🔺 [PSO Technique: Shifta Lv30 — Attack Boost!]");
                    break;
                }
                case "tech_deband": {
                    showSymbolNotice({
                        sender: profile.displayName,
                        subtitle: "TECHNIQUE // DEBAND Lv30",
                        variant: "deband",
                        body: "🛡️ Deband Lv30 — DFP Defense Barrier Active!",
                    });
                    void sendRoomTextIfEnabled("🛡️ [PSO Technique: Deband Lv30 — Defense Boost!]");
                    break;
                }
                case "screen_share": {
                    if (activeCall) {
                        void activeCall.toggleScreenSharing();
                    } else {
                        showSymbolNotice({
                            sender: profile.displayName,
                            subtitle: "TELEPIPE // RYUKER",
                            variant: "message",
                            body: "🌀 Telepipe Deployed — Ready for Screen Share / Stream!",
                        });
                    }
                    break;
                }
                case "mute_mic": {
                    onToggleMute();
                    break;
                }
                case "deafen_audio": {
                    onToggleDeafen();
                    break;
                }
                case "join_leave_voice": {
                    onJoinOrLeaveVoice();
                    break;
                }
                case "click_through": {
                    setIsClickThroughGlass((prev) => {
                        const next = !prev;
                        showSymbolNotice({
                            sender: profile.displayName,
                            subtitle: next ? "GLASS CLICK-THRU // ON" : "GLASS CLICK-THRU // OFF",
                            variant: "message",
                            body: next
                                ? "🖱️ Mouse & keyboard now pass through glass to windows behind (Alt+G to toggle)."
                                : "🖱️ Normal Element window interaction restored.",
                        });
                        if (next) {
                            window.setTimeout(() => sendElectronIpc("psoReleaseFocusToBackground"), 40);
                        }
                        return next;
                    });
                    break;
                }
                case "compact_chat": {
                    setIsCompactChat((prev) => {
                        const next = !prev;
                        if (next && isStreamOverlay) {
                            setIsStreamOverlay(false);
                        }
                        if (!next) {
                            setIsCompactOverlaysHidden(false);
                        }
                        if (next) {
                            window.setTimeout(() => sendElectronIpc("psoReleaseFocusToBackground"), 40);
                        }
                        return next;
                    });
                    break;
                }
                case "stream_overlay": {
                    setIsStreamOverlay((prev) => {
                        const next = !prev;
                        if (next) {
                            window.setTimeout(() => sendElectronIpc("psoReleaseFocusToBackground"), 40);
                        }
                        return next;
                    });
                    break;
                }
                case "transparent_mode": {
                    setBackdropMode((prev) => (prev === "transparent" ? "pioneer2" : "transparent"));
                    break;
                }
                case "snap_left": {
                    sendElectronIpc("psoWindowSnapTo", "left");
                    break;
                }
                case "snap_right": {
                    sendElectronIpc("psoWindowSnapTo", "right");
                    break;
                }
                case "spotlight_search": {
                    if (isStreamOverlay) {
                        setIsStreamOverlay(false);
                    }
                    defaultDispatcher.dispatch({ action: Action.OpenSpotlight });
                    break;
                }
                case "party_inspector": {
                    if (isStreamOverlay) {
                        setIsStreamOverlay(false);
                    }
                    RightPanelStore.instance.togglePanel(sdkContext.roomViewStore.getRoomId());
                    break;
                }
                case "quick_comm": {
                    setIsQuickReplyOpen((prev) => {
                        const next = !prev;
                        if (next) {
                            sendElectronIpc("setPsoIgnoreMouseEvents", false);
                            sendElectronIpc("psoFocusWindow");
                            window.setTimeout(() => quickReplyInputRef.current?.focus(), 40);
                        } else if (isClickThroughGlass || isCompactChat || isStreamOverlay) {
                            sendElectronIpc("psoReleaseFocusToBackground");
                        }
                        return next;
                    });
                    break;
                }
            }
        },
        [
            activeCall,
            activeSymbolPresetIdx,
            isClickThroughGlass,
            isCompactChat,
            isStreamOverlay,
            onJoinOrLeaveVoice,
            onToggleDeafen,
            onToggleMute,
            profile.displayName,
            sdkContext.roomViewStore,
            sendRoomTextIfEnabled,
            showSymbolNotice,
            symbolPresets,
            transmitSymbolChat,
        ],
    );

    const allHexActions = useMemo<PsoHexActionDef[]>(
        () => [
            {
                id: "mute_mic",
                shortName: "Mute Mic",
                icon: isAudioMuted ? "🔇" : "🎙️",
                label: isAudioMuted ? "Unmute Mic" : "Mute Mic",
                color: isAudioMuted ? "#e05555" : "#50d282",
                danger: isAudioMuted,
            },
            {
                id: "deafen_audio",
                shortName: "Deafen",
                icon: isDeafened ? "🔕" : "🎧",
                label: isDeafened ? "Undeafen Audio" : "Deafen Audio",
                color: isDeafened ? "#e05555" : "#58cfc9",
                danger: isDeafened,
            },
            {
                id: "join_leave_voice",
                shortName: "Voice Call",
                icon: activeCall ? "📴" : "📞",
                label: activeCall ? "Leave Voice Call" : "Join / Open Room Voice Call",
                color: activeCall ? "#e05555" : "#50d282",
                active: Boolean(activeCall),
                danger: Boolean(activeCall),
            },
            {
                id: "screen_share",
                shortName: "Screen Share",
                icon: "🌀",
                label: "Telepipe / Toggle Screen Share",
                color: isLocalSharing ? "#efc278" : "#8ae3dd",
                active: isLocalSharing,
            },
            {
                id: "click_through",
                shortName: "Click-Thru",
                icon: "🖱️",
                label: "Toggle Click-Through Glass — Pass Mouse & Keys Behind Window (Alt+G)",
                color: isClickThroughGlass ? "#efc278" : "#8ae3dd",
                active: isClickThroughGlass,
            },
            {
                id: "compact_chat",
                shortName: "Compact Chat",
                icon: "▤",
                label: "Toggle Compact Text-Only Chatbox (Alt+C)",
                color: isCompactChat ? "#efc278" : "#58cfc9",
                active: isCompactChat,
            },
            {
                id: "stream_overlay",
                shortName: "Stream HUD",
                icon: "⟁",
                label: "Toggle Stream Overlay Mode (Alt+O)",
                color: isStreamOverlay ? "#efc278" : "#d99438",
                active: isStreamOverlay,
            },
            {
                id: "transparent_mode",
                shortName: "OS Glass",
                icon: "🪟",
                label: "Toggle OS Transparent Desktop Mode",
                color: backdropMode === "transparent" ? "#efc278" : "#8ae3dd",
                active: backdropMode === "transparent",
            },
            {
                id: "snap_left",
                shortName: "Snap Left",
                icon: "◧",
                label: "Snap Window to Left Half of Monitor",
                color: "#8ae3dd",
            },
            {
                id: "snap_right",
                shortName: "Snap Right",
                icon: "◨",
                label: "Snap Window to Right Half of Monitor",
                color: "#8ae3dd",
            },
            {
                id: "quick_comm",
                shortName: "Quick SAY",
                icon: "💬",
                label: "Quick Comm Input Bar (Alt+0)",
                color: "#efc278",
                active: isQuickReplyOpen,
            },
            {
                id: "spotlight_search",
                shortName: "Search",
                icon: "🔍",
                label: "Radar / Search Rooms",
                color: "#8ae3dd",
            },
            {
                id: "party_inspector",
                shortName: "Inspector",
                icon: "👥",
                label: "Toggle Party Inspector / Right Panel",
                color: "#8ae3dd",
            },
            {
                id: "symbol_rappy",
                shortName: "Rappy No!",
                icon: "🐤",
                label: "Transmit Active Symbol Chat Balloon",
                color: "#efc278",
            },
            {
                id: "symbol_editor",
                shortName: "Symbol Maker",
                icon: "🎨",
                label: "Open PSO Symbol Chat Parts Maker & Presets",
                color: "#ff8ab5",
                active: isSymbolEditorOpen,
            },
            {
                id: "pso_lobby_3d",
                shortName: "3D Lobby",
                icon: "🕹️",
                label: "Open 3D WebGL Pioneer 2 Lobby + Box-Smash Minigame + ReShade + .NJ Model Loader",
                color: "#50f296",
                active: isLobby3dOpen,
            },
            {
                id: "tech_resta",
                shortName: "Resta",
                icon: "💚",
                label: "Resta Lv30 Party Heal",
                color: "#50d282",
            },
            {
                id: "tech_shifta",
                shortName: "Shifta",
                icon: "🔺",
                label: "Shifta Lv30 ATP Boost",
                color: "#e85d56",
            },
            {
                id: "tech_deband",
                shortName: "Deband",
                icon: "🛡️",
                label: "Deband Lv30 DFP Barrier",
                color: "#58cfc9",
            },
        ],
        [
            activeCall,
            backdropMode,
            isAudioMuted,
            isClickThroughGlass,
            isCompactChat,
            isDeafened,
            isLocalSharing,
            isLobby3dOpen,
            isQuickReplyOpen,
            isStreamOverlay,
            isSymbolEditorOpen,
        ],
    );

    const equippedHexDefs = useMemo(() => {
        const map = new Map(allHexActions.map((a) => [a.id, a]));
        return hexSlots.map((id) => map.get(id)).filter((a): a is PsoHexActionDef => Boolean(a));
    }, [allHexActions, hexSlots]);

    const toggleEquipHexAction = useCallback((id: PsoHexActionId): void => {
        setHexSlots((prev) => {
            if (prev.includes(id)) {
                return prev.filter((item) => item !== id);
            }
            if (prev.length >= 10) {
                return [...prev.slice(0, 9), id];
            }
            return [...prev, id];
        });
    }, []);

    // Keyboard shortcuts: Alt+1..Alt+0 for Equipped Hex Quickbar, Alt+O / Alt+C / Alt+G, F11
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === "F11") {
                e.preventDefault();
                sendElectronIpc("psoWindowToggleFullScreen");
                return;
            }
            if (e.altKey && (e.key === "g" || e.key === "G")) {
                e.preventDefault();
                executeHexAction("click_through");
                return;
            }
            if (e.altKey && (e.key === "o" || e.key === "O")) {
                e.preventDefault();
                setIsStreamOverlay((prev) => !prev);
                return;
            }
            if (e.altKey && (e.key === "c" || e.key === "C")) {
                e.preventDefault();
                setIsCompactChat((prev) => !prev);
                return;
            }

            const editable = isEditableElement(e.target as Element | null);
            if ((e.altKey || (isStreamOverlay && !editable && !e.ctrlKey && !e.metaKey)) && /^[0-9]$/.test(e.key)) {
                e.preventDefault();
                const digit = Number.parseInt(e.key, 10);
                if (digit === 0) {
                    const tenth = equippedHexDefs[9];
                    executeHexAction(tenth ? tenth.id : "quick_comm");
                } else {
                    const targetAction = equippedHexDefs[digit - 1];
                    if (targetAction) {
                        executeHexAction(targetAction.id);
                    }
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [equippedHexDefs, executeHexAction, isStreamOverlay]);

    const onWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : null;
            if (dataUrl) {
                setCustomWallpaper(dataUrl);
                setBackdropMode("custom");
                try {
                    localStorage.setItem(STORAGE_KEYS.CUSTOM_WALLPAPER, dataUrl);
                    localStorage.setItem(STORAGE_KEYS.BACKDROP_MODE, "custom");
                } catch {
                    // ignore quota errors
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const onQuickReplySubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        const trimmed = quickReplyText.trim();
        if (!trimmed) return;
        setQuickReplyText("");
        showSymbolNotice({
            sender: profile.displayName,
            subtitle: "COMM LOG // TRANSMITTED",
            variant: "message",
            body: trimmed,
        });
        await sendRoomTextIfEnabled(trimmed, true);
        if (isClickThroughGlass || isCompactChat || isStreamOverlay) {
            setIsQuickReplyOpen(false);
            window.setTimeout(() => sendElectronIpc("psoReleaseFocusToBackground"), 40);
        }
    };

    const onHudMouseEnter = (): void => {
        if (isStreamOverlay || isCompactChat || isClickThroughGlass) {
            lastIgnoreMouseRef.current = false;
            sendElectronIpc("setPsoIgnoreMouseEvents", false);
        }
    };

    const onHudMouseLeave = (): void => {
        if ((isStreamOverlay || isClickThroughGlass) && !isQuickReplyOpen && !isTunerOpen) {
            lastIgnoreMouseRef.current = true;
            sendElectronIpc("setPsoIgnoreMouseEvents", true);
            if (!isEditableElement(document.activeElement)) {
                sendElectronIpc("psoReleaseFocusToBackground");
            }
        }
    };

    // Custom Titlebar Drag with Windows Aero Snap (Top = Fullscreen/Maximize, Left = Left Half, Right = Right Half, Corners = Quarter)
    const onTitlebarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest(".pso-window-titlebar-actions, button")) return;
        if (e.detail >= 2) {
            isDraggingWindowRef.current = false;
            return;
        }

        isDraggingWindowRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        sendElectronIpc("psoWindowDragStart");
    }, []);

    const onTitlebarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
        if (!isDraggingWindowRef.current) return;
        if ((e.buttons & 1) === 0) {
            isDraggingWindowRef.current = false;
            setSnapPreviewZone(null);
            sendElectronIpc("psoWindowDragEnd");
            return;
        }
        sendElectronIpc("psoWindowDragMove");
    }, []);

    const onTitlebarPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
        if (!isDraggingWindowRef.current) return;
        isDraggingWindowRef.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        setSnapPreviewZone(null);
        sendElectronIpc("psoWindowDragEnd");
    }, []);

    const startEdgeResize = useCallback((edge: string, e: React.MouseEvent): void => {
        e.preventDefault();
        isDraggingWindowRef.current = true;
        let lastX = e.screenX;
        let lastY = e.screenY;

        const onMouseMove = (moveEvt: MouseEvent): void => {
            const dx = moveEvt.screenX - lastX;
            const dy = moveEvt.screenY - lastY;
            if (dx === 0 && dy === 0) return;
            lastX = moveEvt.screenX;
            lastY = moveEvt.screenY;
            sendElectronIpc("psoWindowResizeEdge", edge, dx, dy);
        };

        const onMouseUp = (): void => {
            isDraggingWindowRef.current = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }, []);

    const hudLayerContent = (
        <div
            className={classNames("pso-hud-layer", {
                "pso-hud-layer--stream-overlay": isStreamOverlay,
            })}
            data-testid="pso-hud-overlay"
        >
            {/* SNAP PREVIEW OVERLAY WHEN DRAGGING TITLEBAR TO MONITOR EDGES */}
            {snapPreviewZone && (
                <div
                    className={`pso-snap-preview-box pso-snap-preview-box--${snapPreviewZone}`}
                    aria-hidden="true"
                >
                    <span className="pso-snap-preview-label">{SNAP_ZONE_LABELS[snapPreviewZone]}</span>
                </div>
            )}

            {/* FRAMELESS WINDOW DRAG TITLEBAR + SNAP / CLICK-THRU / WINDOW CONTROLS + RESIZE EDGES */}
            {!isStreamOverlay && !(isCompactChat && isCompactOverlaysHidden) && (
                <>
                    <div
                        className="pso-window-titlebar pso-interactive"
                        onPointerDown={onTitlebarPointerDown}
                        onPointerMove={onTitlebarPointerMove}
                        onPointerUp={onTitlebarPointerUp}
                        onPointerCancel={onTitlebarPointerUp}
                        onDoubleClick={() => sendElectronIpc("psoWindowToggleMaximize")}
                    >
                        <div className="pso-window-titlebar-brand">
                            <span className="pso-window-titlebar-dot" />
                            <span className="pso-window-titlebar-title">
                                ELEMENT // PIONEER 2 COMM-LINK
                            </span>
                            {snapPreviewZone && (
                                <span className="pso-window-titlebar-badge">
                                    {SNAP_ZONE_LABELS[snapPreviewZone]}
                                </span>
                            )}
                            {isClickThroughGlass && (
                                <button
                                    type="button"
                                    className="pso-window-titlebar-badge pso-window-titlebar-badge--active"
                                    onClick={() => executeHexAction("click_through")}
                                    title="Click to disable Click-Through Glass (Alt+G)"
                                >
                                    🖱️ CLICK-THRU ACTIVE (Alt+G)
                                </button>
                            )}
                            {isCompactChat && (
                                <button
                                    type="button"
                                    className="pso-window-titlebar-badge pso-window-titlebar-badge--active"
                                    onClick={() => setIsCompactOverlaysHidden(true)}
                                    title="Hide top title bar & all HUD overlays — show only compact chat text"
                                    data-testid="pso-compact-hide-overlays-btn"
                                >
                                    💬 HIDE BAR &amp; OVERLAYS
                                </button>
                            )}
                        </div>
                        <div className="pso-window-titlebar-actions">
                            <button
                                type="button"
                                className={classNames("pso-window-ctrl-btn", {
                                    "pso-window-ctrl-btn--active": isCompactChat && isCompactOverlaysHidden,
                                })}
                                onClick={() => {
                                    if (!isCompactChat) {
                                        setIsCompactChat(true);
                                        setIsCompactOverlaysHidden(true);
                                    } else {
                                        setIsCompactOverlaysHidden((prev) => !prev);
                                    }
                                }}
                                title="Compact Chat Text-Only Mode — Hide Title Bar & Overlays"
                                aria-label="Hide Title Bar and Overlays in Compact Chat"
                                data-testid="pso-titlebar-hide-overlays-action"
                            >
                                💬
                            </button>
                            <button
                                type="button"
                                className={classNames("pso-window-ctrl-btn", {
                                    "pso-window-ctrl-btn--active": isLobby3dOpen,
                                })}
                                onClick={() => setIsLobby3dOpen((prev) => !prev)}
                                title={
                                    isLobby3dOpen
                                        ? "Close 3D Pioneer 2 Lobby (Saves Hunter Spot & Activates Ghost Standby)"
                                        : "Resume 3D Pioneer 2 Lobby at Saved Spot"
                                }
                                aria-label="Toggle 3D Pioneer 2 Lobby"
                            >
                                🕹️
                            </button>
                            {!isLobby3dOpen && (
                                <button
                                    type="button"
                                    className={classNames("pso-window-ctrl-btn", {
                                        "pso-window-ctrl-btn--active": ghostStandbyEnabled,
                                    })}
                                    onClick={() => setGhostStandbyEnabled((prev) => !prev)}
                                    title={
                                        ghostStandbyEnabled
                                            ? "Ghost Standby ON: Your Hologram Hunter stays at your saved spot & shows your chat bubbles to others while 3D is closed (Click to toggle)"
                                            : "Ghost Standby OFF: Click to keep a Hologram Ghost Hunter in the 3D Lobby while closed"
                                    }
                                    aria-label="Toggle Ghost Standby Avatar"
                                >
                                    👻
                                </button>
                            )}
                            <button
                                type="button"
                                className={classNames("pso-window-ctrl-btn", {
                                    "pso-window-ctrl-btn--active": isSymbolEditorOpen,
                                })}
                                onClick={() => setIsSymbolEditorOpen((prev) => !prev)}
                                title="Open PSO Symbol Chat Maker"
                                aria-label="Toggle Symbol Chat Maker"
                            >
                                🎨
                            </button>
                            <button
                                type="button"
                                className={classNames("pso-window-ctrl-btn", {
                                    "pso-window-ctrl-btn--active": isClickThroughGlass,
                                })}
                                onClick={() => executeHexAction("click_through")}
                                title="Toggle Click-Through Glass — Pass mouse & keyboard to window behind (Alt+G)"
                                aria-label="Toggle Click-Through Glass"
                            >
                                🖱️
                            </button>
                            <button
                                type="button"
                                className="pso-window-ctrl-btn"
                                onClick={() => sendElectronIpc("psoWindowSnapTo", "left")}
                                title="Snap Window to Left Half"
                                aria-label="Snap Left Half"
                            >
                                &#x25E7;
                            </button>
                            <button
                                type="button"
                                className="pso-window-ctrl-btn"
                                onClick={() => sendElectronIpc("psoWindowSnapTo", "right")}
                                title="Snap Window to Right Half"
                                aria-label="Snap Right Half"
                            >
                                &#x25E8;
                            </button>
                            <button
                                type="button"
                                className="pso-window-ctrl-btn"
                                onClick={() => sendElectronIpc("psoWindowMinimize")}
                                title="Minimize"
                                aria-label="Minimize"
                            >
                                &#x2500;
                            </button>
                            <button
                                type="button"
                                className="pso-window-ctrl-btn"
                                onClick={() => sendElectronIpc("psoWindowToggleMaximize")}
                                title="Maximize / Restore"
                                aria-label="Maximize"
                            >
                                &#x25A1;
                            </button>
                            <button
                                type="button"
                                className="pso-window-ctrl-btn pso-window-ctrl-btn--close"
                                onClick={() => sendElectronIpc("psoWindowClose")}
                                title="Close"
                                aria-label="Close"
                            >
                                &#x2715;
                            </button>
                        </div>
                    </div>
                    {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((edge) => (
                        <div
                            key={edge}
                            className={`pso-window-resize-edge pso-window-resize-edge--${edge} pso-interactive`}
                            onMouseDown={(e) => startEdgeResize(edge, e)}
                        />
                    ))}
                </>
            )}

            {/* 2. TOP-LEFT PSO EPISODE IV PLAYER GAUGE + COMPACT PARTY VOICE STACK (Visible only in 3D Game, Compact Chat, or Stream Overlay) */}
            {(isStreamOverlay || isCompactChat || isLobby3dOpen) && !(isCompactChat && isCompactOverlaysHidden) && (
                <div
                    className={classNames("pso-ep4-party-hud-stack pso-interactive", {
                        "pso-ep4-party-hud-stack--in-lobby": isLobby3dOpen && !isCompactChat && !isStreamOverlay,
                    })}
                    data-testid="pso-status-hud"
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                >
                    {/* Main Self Player Gauge */}
                    <div className="pso-ep4-top-status">
                        <div className="pso-ep4-status-header">
                            <span className="pso-ep4-char-name">{profile.displayName.toUpperCase()}</span>
                            <div className="pso-ep4-ab-Cluster">
                                <button
                                    type="button"
                                    className="pso-orb-btn pso-orb-btn--a"
                                    onClick={() => setIsSymbolEditorOpen((prev) => !prev)}
                                    title="Open PSO Symbol Chat Maker"
                                >
                                    S
                                </button>
                                <button
                                    type="button"
                                    className="pso-orb-btn pso-orb-btn--b"
                                    onClick={() => {
                                        if (isStreamOverlay) setIsStreamOverlay(false);
                                        else if (isCompactChat) {
                                            setIsCompactOverlaysHidden(false);
                                            setIsCompactChat(false);
                                        } else if (isLobby3dOpen) setIsLobby3dOpen(false);
                                    }}
                                    title="Exit Overlay / Compact Mode"
                                >
                                    B
                                </button>
                            </div>
                        </div>
                        <div className="pso-ep4-status-body">
                            {/* Hexagon + Ring with Avatar & Green Voice Activity Ring */}
                            <div
                                className={classNames("pso-ep4-avatar-ring", {
                                    "pso-ep4-avatar-ring--speaking":
                                        !isAudioMuted && (Boolean(localParticipant?.speaking) || micLevelPct > 18),
                                    "pso-ep4-avatar-ring--muted": isAudioMuted,
                                })}
                                onClick={onToggleMute}
                                title={isAudioMuted ? "Mic Muted (Click to Unmute)" : "Mic Live (Click to Mute)"}
                            >
                                <svg className="pso-ep4-avatar-hex-svg" viewBox="0 0 48 48">
                                    <polygon
                                        points="24,2 44,13 44,35 24,46 4,35 4,13"
                                        fill="#0b3640"
                                        stroke={
                                            !isAudioMuted && (Boolean(localParticipant?.speaking) || micLevelPct > 18)
                                                ? "#42f57b"
                                                : "#58cfc9"
                                        }
                                        strokeWidth="2.4"
                                    />
                                </svg>
                                {profile.avatarUrl ? (
                                    <img
                                        src={profile.avatarUrl}
                                        alt={profile.displayName}
                                        className="pso-ep4-avatar-img"
                                    />
                                ) : (
                                    <span className="pso-ep4-avatar-initial">
                                        {profile.displayName.slice(0, 1).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* HP = Matrix Server Ping / Connection Health, TP = Live Mic dB Level */}
                            <div className="pso-ep4-bars-col">
                                <div className="pso-ep4-bar-row">
                                    <span className="pso-ep4-bar-label">PING</span>
                                    <span className="pso-ep4-bar-val">
                                        {pingMs}ms // {pingPercent}%
                                    </span>
                                </div>
                                <div className="pso-ep4-bar-track">
                                    <div
                                        className="pso-ep4-bar-fill pso-ep4-bar-fill--hp"
                                        style={{ width: `${pingPercent}%` }}
                                    />
                                </div>
                                <div className="pso-ep4-bar-row">
                                    <span className="pso-ep4-bar-label">VOICE</span>
                                    <span className="pso-ep4-bar-val">
                                        {isAudioMuted ? "MUTED" : `${micLevelPct}% dB`}
                                    </span>
                                </div>
                                <div className="pso-ep4-bar-track">
                                    <div
                                        className={classNames("pso-ep4-bar-fill pso-ep4-bar-fill--tp", {
                                            "pso-ep4-bar-fill--peaking": isMicPeaking,
                                        })}
                                        style={{ width: `${isAudioMuted ? 0 : Math.max(8, micLevelPct)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Shifta (Red = Mean dB Peaking Warning) & Deband (Blue = Noise Gate / Shield Active) */}
                            <div className="pso-ep4-buff-pair">
                                <div
                                    className={classNames("pso-buff-hex pso-buff-hex--shifta", {
                                        "pso-buff-hex--active": isMicPeaking,
                                    })}
                                    title={
                                        isMicPeaking
                                            ? "SHIFTA ALERT: Mic Mean dB Peaking / Too Loud!"
                                            : "Shifta Indicator: Lights up red if your mic dB peaks too loud"
                                    }
                                >
                                    <svg viewBox="0 0 28 28">
                                        <polygon
                                            points="14,1 26,8 26,20 14,27 2,20 2,8"
                                            fill="rgba(54, 10, 14, 0.9)"
                                            stroke="#58cfc9"
                                            strokeWidth="1.6"
                                        />
                                        <path
                                            d="M8,16 L14,10 L20,16 M8,21 L14,15 L20,21"
                                            fill="none"
                                            stroke="#ff3b3b"
                                            strokeWidth="2.4"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </div>
                                <div
                                    className={classNames("pso-buff-hex pso-buff-hex--deband", {
                                        "pso-buff-hex--active": !isDeafened,
                                    })}
                                    onClick={onToggleDeafen}
                                    title={
                                        isDeafened
                                            ? "DEBAND OFF: Audio Deafened (Click to Undeafen)"
                                            : "DEBAND ACTIVE: Noise Suppression & Audio Shield Active"
                                    }
                                >
                                    <svg viewBox="0 0 28 28">
                                        <polygon
                                            points="14,1 26,8 26,20 14,27 2,20 2,8"
                                            fill="rgba(10, 22, 56, 0.9)"
                                            stroke="#58cfc9"
                                            strokeWidth="1.6"
                                        />
                                        <path
                                            d="M8,16 L14,10 L20,16 M8,21 L14,15 L20,21"
                                            fill="none"
                                            stroke="#3b8dff"
                                            strokeWidth="2.4"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stacked Compact Party Plates (Dumpling / Guy / Zero / Calvitium style from PSO Ep.IV) */}
                    {liveParticipants
                        .filter((p) => !p.local)
                        .map((participant, idx) => {
                            const gem = PARTY_GEM_PALETTE[idx % PARTY_GEM_PALETTE.length];
                            const roomId = sdkContext.roomViewStore.getRoomId();
                            const room = roomId ? client?.getRoom(roomId) : null;
                            const member = room?.getMember(participant.userId);
                            const avatarUrl =
                                member && client
                                    ? member.getAvatarUrl(client.baseUrl, 48, 48, "crop", false, false)
                                    : null;
                            const isPeaking = Boolean(speakingPeakMap[participant.id]);
                            const isShielded = !participant.playbackMuted && participant.audioEnabled;

                            return (
                                <div key={participant.id} className="pso-party-compact-row">
                                    <div className="pso-party-compact-pill">
                                        {/* Left Colored Hexagon Gem + Avatar + Green Speaking Ring */}
                                        <div
                                            className={classNames("pso-party-gem-wrap", {
                                                "pso-party-gem-wrap--speaking": participant.speaking,
                                            })}
                                        >
                                            <svg className="pso-party-gem-svg" viewBox="0 0 40 40">
                                                <polygon
                                                    points="20,2 37,11 37,29 20,38 3,29 3,11"
                                                    fill={gem.dark}
                                                    stroke={participant.speaking ? "#42f57b" : gem.rim}
                                                    strokeWidth="2.4"
                                                />
                                                <polygon
                                                    points="20,6 33,13 33,27 20,34 7,27 7,13"
                                                    fill={gem.fill}
                                                    fillOpacity="0.65"
                                                />
                                            </svg>
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt={participant.displayName}
                                                    className="pso-party-gem-avatar"
                                                />
                                            ) : (
                                                <span className="pso-party-gem-initial">
                                                    {participant.displayName.slice(0, 1).toUpperCase()}
                                                </span>
                                            )}
                                        </div>

                                        {/* Top Connection Health Bar + Username in the Lv Slot */}
                                        <div className="pso-party-slot-col">
                                            <div className="pso-party-mini-hp-track">
                                                <div
                                                    className="pso-party-mini-hp-fill"
                                                    style={{
                                                        width: participant.audioEnabled ? "100%" : "42%",
                                                    }}
                                                />
                                            </div>
                                            <div className="pso-party-name-slot" title={participant.displayName}>
                                                {participant.displayName}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Adjacent Interlocking Red (Shifta = dB Peaking) & Blue (Deband = Audio Shield) Hexagons */}
                                    <div className="pso-ep4-buff-pair pso-ep4-buff-pair--compact">
                                        <div
                                            className={classNames("pso-buff-hex pso-buff-hex--shifta", {
                                                "pso-buff-hex--active": isPeaking,
                                            })}
                                            title={
                                                isPeaking
                                                    ? `${participant.displayName} is peaking / loud!`
                                                    : "Shifta: Normal voice volume"
                                            }
                                        >
                                            <svg viewBox="0 0 28 28">
                                                <polygon
                                                    points="14,1 26,8 26,20 14,27 2,20 2,8"
                                                    fill="rgba(54, 10, 14, 0.9)"
                                                    stroke="#58cfc9"
                                                    strokeWidth="1.6"
                                                />
                                                <path
                                                    d="M8,16 L14,10 L20,16 M8,21 L14,15 L20,21"
                                                    fill="none"
                                                    stroke="#ff3b3b"
                                                    strokeWidth="2.4"
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                        </div>
                                        <div
                                            className={classNames("pso-buff-hex pso-buff-hex--deband", {
                                                "pso-buff-hex--active": isShielded,
                                            })}
                                            title={
                                                isShielded
                                                    ? `${participant.displayName}: Clear Voice Link`
                                                    : `${participant.displayName}: Muted`
                                            }
                                        >
                                            <svg viewBox="0 0 28 28">
                                                <polygon
                                                    points="14,1 26,8 26,20 14,27 2,20 2,8"
                                                    fill="rgba(10, 22, 56, 0.9)"
                                                    stroke="#58cfc9"
                                                    strokeWidth="1.6"
                                                />
                                                <path
                                                    d="M8,16 L14,10 L20,16 M8,21 L14,15 L20,21"
                                                    fill="none"
                                                    stroke="#3b8dff"
                                                    strokeWidth="2.4"
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}

            {/* 3. TRANSIENT SYMBOL CHAT / INCOMING MESSAGE POPUP (Authentic Slanted PSO Parallelogram Balloon or Tech Card) */}
            {symbolNotice && (
                <div
                    className={classNames("pso-symbol-chat-toast pso-interactive", {
                        "pso-symbol-chat-toast--rappy": symbolNotice.variant === "rappy",
                        "pso-symbol-chat-toast--tech":
                            symbolNotice.variant === "resta" ||
                            symbolNotice.variant === "shifta" ||
                            symbolNotice.variant === "deband",
                    })}
                    data-testid="pso-symbol-chat-toast"
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                    onClick={() => setSymbolNotice(null)}
                >
                    {symbolNotice.variant === "rappy" ? (
                        <PsoSymbolChatBalloon
                            sender={symbolNotice.sender}
                            spec={
                                symbolNotice.symbolSpec ??
                                symbolPresets[activeSymbolPresetIdx] ??
                                DEFAULT_SYMBOL_PRESETS[0]
                            }
                            customSpriteSheetUrl={customSymbolSheetUrl}
                        />
                    ) : (
                        <>
                            <div className="pso-symbol-chat-sender">{symbolNotice.sender}</div>
                            <div className="pso-symbol-chat-message">
                                <div className="pso-symbol-chat-sub">{symbolNotice.subtitle}</div>
                                <div className="pso-symbol-chat-body">{symbolNotice.body}</div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* 3B. INTERACTIVE PSO BLUE BURST SYMBOL CHAT PARTS MAKER MODAL */}
            {isSymbolEditorOpen && (
                <PsoSymbolChatEditorModal
                    senderName={profile.displayName}
                    presets={symbolPresets}
                    activePresetIndex={activeSymbolPresetIdx}
                    customSpriteSheetUrl={customSymbolSheetUrl}
                    onChangeCustomSpriteSheetUrl={saveCustomSymbolSheet}
                    onSelectPresetIndex={selectSymbolPresetIndex}
                    onSavePresets={saveSymbolPresets}
                    onTransmitSymbolChat={(spec) => void transmitSymbolChat(spec)}
                    onClose={() => setIsSymbolEditorOpen(false)}
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                />
            )}

            {/* 3C. EMBEDDED 3D WEBGL PSO PIONEER 2 LOBBY + MINIGAME + RESHADE + .NJ ASSET LOADER */}
            {isLobby3dOpen && (
                <PsoLobby3dLayer
                    localDisplayName={profile.displayName}
                    localUserId={client?.getUserId() || "self"}
                    activeSymbolChat={
                        symbolNotice?.variant === "rappy" && symbolNotice.symbolSpec
                            ? { sender: symbolNotice.sender, spec: symbolNotice.symbolSpec }
                            : null
                    }
                    remotePlayers={(() => {
                        const merged: Record<string, PsoRemoteLobbyPlayer> = {};
                        const now = Date.now();
                        for (const [uid, p] of Object.entries(remoteLobbyPlayers)) {
                            if (now - p.lastUpdated < 120000) {
                                merged[uid] = p;
                            }
                        }
                        // Also auto-spawn any fellow Hunters connected in the active voice/video call so they are ALWAYS in your 3D Lobby even before they move!
                        const defaultClasses: Array<PsoRemoteLobbyPlayer["classId"]> = [
                            "ramarl",
                            "humar",
                            "fonewearl",
                            "hucast",
                        ];
                        const defaultWeapons: Array<PsoRemoteLobbyPlayer["weaponId"]> = [
                            "red_sword",
                            "photon_saber",
                            "kingdom_key",
                            "dark_flow",
                        ];
                        liveParticipants.forEach((part, idx) => {
                            if (part.local) return;
                            const uid = part.userId;
                            if (!uid) return;
                            if (!merged[uid]) {
                                const angle = ((idx + 1) * Math.PI) / 3;
                                merged[uid] = {
                                    userId: uid,
                                    displayName: part.displayName || uid.replace(/^@|:.*$/g, ""),
                                    x: +(Math.sin(angle) * 2.4).toFixed(2),
                                    z: +(2.6 + Math.cos(angle) * 1.6).toFixed(2),
                                    yaw: +(-angle).toFixed(2),
                                    classId: defaultClasses[idx % defaultClasses.length],
                                    weaponId: defaultWeapons[idx % defaultWeapons.length],
                                    inChair: false,
                                    attacking: false,
                                    lastUpdated: now,
                                };
                            }
                        });
                        return Object.values(merged);
                    })()}
                    speechBubbles={lobbySpeechBubbles}
                    presentationMode={lobbyPresentationMode}
                    isChatDockVisible={isLobbyChatDockVisible}
                    isVoiceCallActive={Boolean(activeCall)}
                    guildRooms={(() => {
                        if (!client) return [];
                        const currentRoomId = sdkContext.roomViewStore.getRoomId();
                        const rooms = client
                            .getRooms()
                            .filter((r) => r.getMyMembership() === "join" && !r.isSpaceRoom());
                        return rooms.slice(0, 24).map(
                            (r): PsoGuildRoomEntry => ({
                                roomId: r.roomId,
                                name: r.name || r.roomId,
                                unreadCount: r.getUnreadNotificationCount() || 0,
                                memberCount: r.getJoinedMemberCount() || 1,
                                isCurrent: r.roomId === currentRoomId,
                            }),
                        );
                    })()}
                    onChangePresentationMode={(mode) => setLobbyPresentationMode(mode)}
                    onToggleChatDock={() => setIsLobbyChatDockVisible((prev) => !prev)}
                    onSelectGuildRoom={(targetRoomId) => {
                        defaultDispatcher.dispatch<ViewRoomPayload>({
                            action: Action.ViewRoom,
                            room_id: targetRoomId,
                            metricsTrigger: "RoomList",
                        });
                    }}
                    onToggleVoiceCall={onJoinOrLeaveVoice}
                    onOpenSymbolMaker={() => setIsSymbolEditorOpen(true)}
                    onOpenHudTuner={() => setIsTunerOpen(true)}
                    onSendLobbyChatMessage={async (text) => {
                        await sendRoomTextIfEnabled(text, true);
                    }}
                    onRequestRoomComposerFocus={() => {
                        defaultDispatcher.fire(Action.FocusSendMessageComposer);
                    }}
                    incomingWorldAction={incomingWorldAction}
                    initialHunterState={savedHunterState}
                    onPersistHunterState={handlePersistHunterState}
                    onBroadcastLobbyState={(lobbyState) => {
                        lastLocalLobbyStateRef.current = lobbyState;
                        const roomId = sdkContext.roomViewStore.getRoomId() ?? activeCall?.roomId ?? null;
                        if (!client || !roomId) return;

                        const payload = {
                            roomId,
                            lobbyState,
                            senderName: profile.displayName,
                            ts: Date.now(),
                        };

                        // 1. Ephemeral To-Device Fast Path (<50ms real-time movement + velocity + worldAction sync, 0 room DAG load)
                        void sendPsoFastToDevice(client, roomId, payload).catch(() => {});

                        // 2. Room Packet Fallback (sent on initial sync, stop, attack, emote, worldAction, or throttled every 1.1s while moving)
                        const now = Date.now();
                        const shouldSendRoomPacket =
                            !lobbyState.fastTick ||
                            Boolean(lobbyState.requestSync) ||
                            Boolean(lobbyState.worldAction) ||
                            now - lastRoomPacketSentAtRef.current >= 1100;

                        if (!shouldSendRoomPacket) return;
                        if (lobbySendInFlightRef.current && !lobbyState.requestSync && !lobbyState.worldAction) return;

                        lobbySendInFlightRef.current = true;
                        lastRoomPacketSentAtRef.current = now;
                        void sendPsoRoomPacket(client, roomId, "io.pso.lobby_state", payload)
                            .catch(() => {})
                            .finally(() => {
                                lobbySendInFlightRef.current = false;
                            });
                    }}
                    onClose={() => setIsLobby3dOpen(false)}
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                />
            )}

            {/* 4. FLOATING QUICK-REPLY / COMM INPUT BAR */}
            {isQuickReplyOpen && (
                <form
                    className="pso-quick-reply-bar pso-interactive"
                    onSubmit={(e) => void onQuickReplySubmit(e)}
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                >
                    <span className="pso-quick-reply-prompt">SAY &gt;</span>
                    <input
                        ref={quickReplyInputRef}
                        type="text"
                        className="pso-quick-reply-input"
                        placeholder="Transmit message to current room..."
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                    />
                    <button type="submit" className="pso-orb-btn pso-orb-btn--a" title="Send Message">
                        A
                    </button>
                    <button
                        type="button"
                        className="pso-orb-btn pso-orb-btn--b"
                        onClick={() => {
                            setIsQuickReplyOpen(false);
                            if (isClickThroughGlass || isCompactChat || isStreamOverlay) {
                                sendElectronIpc("psoReleaseFocusToBackground");
                            }
                        }}
                        title="Close Quick Comm"
                    >
                        B
                    </button>
                </form>
            )}

            {/* 5. PSO HUD & WALLPAPER TUNER + HEX PALETTE CUSTOMIZER POPOVER */}
            {isTunerOpen && (
                <>
                    <div
                        className="pso-tuner-backdrop pso-interactive"
                        onPointerDown={() => setIsTunerOpen(false)}
                    />
                    <div
                        ref={tunerPopoverRef}
                        className="pso-tuner-popover pso-interactive"
                        data-testid="pso-tuner-popover"
                        onMouseEnter={onHudMouseEnter}
                        onMouseLeave={onHudMouseLeave}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                    <div className="pso-tuner-header-row">
                        <div className="pso-orange-pill-tab">HUD &amp; Wallpaper Tuner</div>
                        <button
                            type="button"
                            className="pso-orb-btn pso-orb-btn--b"
                            onClick={() => setIsTunerOpen(false)}
                            title="Close Tuner"
                        >
                            B
                        </button>
                    </div>
                    <div className="pso-tuner-row">
                        <label htmlFor="pso-glass-slider">Glass Opacity ({Math.round(glassAlpha * 100)}%)</label>
                        <input
                            id="pso-glass-slider"
                            type="range"
                            min="0.15"
                            max="0.92"
                            step="0.02"
                            value={glassAlpha}
                            onChange={(e) => setGlassAlpha(Number.parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="pso-tuner-row">
                        <label htmlFor="pso-scanline-slider">
                            CRT Scanlines ({Math.round(scanlineAlpha * 100)}%)
                        </label>
                        <input
                            id="pso-scanline-slider"
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.02"
                            value={scanlineAlpha}
                            onChange={(e) => setScanlineAlpha(Number.parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="pso-tuner-btn-group">
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active": backdropMode === "pioneer2",
                            })}
                            onClick={() => setBackdropMode("pioneer2")}
                        >
                            Pioneer 2 Orbit
                        </button>
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active": backdropMode === "custom",
                            })}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Upload Wallpaper
                        </button>
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active": backdropMode === "transparent",
                            })}
                            onClick={() => setBackdropMode("transparent")}
                        >
                            OS Transparent
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={onWallpaperUpload}
                        />
                    </div>

                    <div className="pso-tuner-divider" />

                    <label className="pso-tuner-checkbox">
                        <input
                            type="checkbox"
                            checked={isClickThroughGlass}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setIsClickThroughGlass(checked);
                            }}
                        />
                        <span>Click-Through Glass (mouse &amp; keys to background, Alt+G)</span>
                    </label>

                    <label className="pso-tuner-checkbox">
                        <input
                            type="checkbox"
                            checked={pinAlwaysOnTop || isClickThroughGlass || isCompactChat || isStreamOverlay}
                            onChange={(e) => setPinAlwaysOnTop(e.target.checked)}
                        />
                        <span>Pin Window Always On Top of games/apps</span>
                    </label>

                    <label className="pso-tuner-checkbox">
                        <input
                            type="checkbox"
                            checked={sendSymbolToRoom}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setSendSymbolToRoom(checked);
                                try {
                                    localStorage.setItem(STORAGE_KEYS.SEND_SYMBOL_TO_ROOM, String(checked));
                                } catch {
                                    // ignore
                                }
                            }}
                        />
                        <span>Broadcast Symbol Chat Balloon Overlay to Room (E2EE, Zero Clutter)</span>
                    </label>

                    <label className="pso-tuner-checkbox">
                        <input
                            type="checkbox"
                            checked={postSymbolTextLog}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setPostSymbolTextLog(checked);
                                try {
                                    localStorage.setItem(STORAGE_KEYS.POST_SYMBOL_TEXT_LOG, String(checked));
                                } catch {
                                    // ignore
                                }
                            }}
                        />
                        <span>Also post a visible text message line in chat log</span>
                    </label>

                    {postSymbolTextLog && (
                        <label className="pso-tuner-checkbox">
                            <input
                                type="checkbox"
                                checked={autoRedactSymbol}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setAutoRedactSymbol(checked);
                                    try {
                                        localStorage.setItem(STORAGE_KEYS.AUTO_REDACT_SYMBOL, String(checked));
                                    } catch {
                                        // ignore
                                    }
                                }}
                            />
                            <span>Auto-delete text line after 9s</span>
                        </label>
                    )}

                    <div className="pso-tuner-divider" />

                    {/* 4-HEXAGON DIAMOND QUADRANT POSITIONING */}
                    <div className="pso-tuner-section-head">
                        <span>4-Hexagon Diamond Quadrant</span>
                        {diamondPos !== null && (
                            <button
                                type="button"
                                className="pso-tuner-link-btn"
                                onClick={() => saveDiamondPos(null)}
                                title="Snap 4-Hexagon Quadrant back to the Bottom-Right Edge"
                            >
                                Pin to Bottom-Right Edge
                            </button>
                        )}
                    </div>
                    <div className="pso-tuner-btn-group">
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active": diamondPos === null,
                            })}
                            onClick={() => saveDiamondPos(null)}
                        >
                            Docked Edge
                        </button>
                        <button
                            type="button"
                            className="pso-tuner-btn"
                            onClick={() =>
                                saveDiamondPos({
                                    x: Math.max(12, window.innerWidth - 260),
                                    y: Math.max(36, window.innerHeight - 106),
                                })
                            }
                        >
                            Float Right
                        </button>
                        <button
                            type="button"
                            className="pso-tuner-btn"
                            onClick={() =>
                                saveDiamondPos({
                                    x: 16,
                                    y: Math.max(36, window.innerHeight - 106),
                                })
                            }
                        >
                            Float Left
                        </button>
                    </div>

                    <div className="pso-tuner-divider" />

                    {/* BOTTOM HEX TRAY CUSTOMIZER */}
                    <div className="pso-tuner-section-head">
                        <span>Bottom Hex Tray ({equippedHexDefs.length} slots)</span>
                        <button
                            type="button"
                            className="pso-tuner-link-btn"
                            onClick={() => setShowHexCustomizer((prev) => !prev)}
                        >
                            {showHexCustomizer ? "Hide Buttons ▲" : "Customize ▼"}
                        </button>
                    </div>
                    <div className="pso-tuner-btn-group">
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active":
                                    JSON.stringify(hexSlots) === JSON.stringify(HEX_PRESETS.minimal),
                            })}
                            onClick={() => setHexSlots(HEX_PRESETS.minimal)}
                            title="5 Essential Voice & Click-Thru Buttons"
                        >
                            Minimal (5)
                        </button>
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active":
                                    JSON.stringify(hexSlots) === JSON.stringify(HEX_PRESETS.overlay),
                            })}
                            onClick={() => setHexSlots(HEX_PRESETS.overlay)}
                            title="6 Stream & Compact Overlay Buttons"
                        >
                            Overlay (6)
                        </button>
                        <button
                            type="button"
                            className={classNames("pso-tuner-btn", {
                                "pso-tuner-btn--active":
                                    JSON.stringify(hexSlots) === JSON.stringify(HEX_PRESETS.classic),
                            })}
                            onClick={() => setHexSlots(HEX_PRESETS.classic)}
                            title="Full 10-Button PSO Episode IV Action Palette"
                        >
                            Full Ep.IV (10)
                        </button>
                    </div>

                    {showHexCustomizer && (
                        <div className="pso-hex-customizer-grid" data-testid="pso-hex-customizer-grid">
                            {allHexActions.map((act) => {
                                const slotIdx = hexSlots.indexOf(act.id);
                                const isEquipped = slotIdx !== -1;
                                const badgeNum = isEquipped ? (slotIdx === 9 ? 0 : slotIdx + 1) : null;
                                return (
                                    <button
                                        key={act.id}
                                        type="button"
                                        className={classNames("pso-hex-chip", {
                                            "pso-hex-chip--equipped": isEquipped,
                                        })}
                                        onClick={() => toggleEquipHexAction(act.id)}
                                        title={act.label}
                                    >
                                        <span className="pso-hex-chip-icon">{act.icon}</span>
                                        <span className="pso-hex-chip-name">{act.shortName}</span>
                                        {badgeNum !== null && (
                                            <span className="pso-hex-chip-slot">{badgeNum}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    </div>
                </>
            )}

            {/* 5B. BOTTOM-RIGHT RESTORE / OVERLAY TOGGLE BAR DIRECTLY BELOW THE FOCUSED COMPACT CHAT */}
            {isCompactChat && (
                <div
                    className={classNames("pso-compact-restore-bar pso-interactive", {
                        "pso-compact-restore-bar--hidden-overlays": isCompactOverlaysHidden,
                    })}
                    data-testid="pso-compact-restore-bar"
                    onMouseEnter={onHudMouseEnter}
                    onMouseLeave={onHudMouseLeave}
                >
                    {isCompactOverlaysHidden ? (
                        <button
                            type="button"
                            className="pso-compact-restore-btn pso-compact-restore-btn--primary"
                            onClick={() => setIsCompactOverlaysHidden(false)}
                            title="Restore top title bar, player overlay, and hexagonal HUD controls"
                            data-testid="pso-compact-restore-overlays-btn"
                        >
                            ▲ RESTORE TITLE BAR &amp; OVERLAYS
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="pso-compact-restore-btn"
                            onClick={() => setIsCompactOverlaysHidden(true)}
                            title="Hide top title bar & overlays — keep only chat text"
                        >
                            ▼ HIDE TITLE BAR &amp; OVERLAYS
                        </button>
                    )}
                    <button
                        type="button"
                        className="pso-compact-restore-btn"
                        onClick={() => {
                            setIsCompactOverlaysHidden(false);
                            setIsCompactChat(false);
                        }}
                        title="Exit Compact Chat and restore full Element window (Alt+C)"
                        data-testid="pso-compact-exit-btn"
                    >
                        ⤢ RESTORE FULL APP
                    </button>
                </div>
            )}

            {/* 6. BOTTOM EPISODE IV DYNAMIC-WIDTH HEXAGONAL ACTION PALETTE + 4-HEX CLUSTER + @BEAT TIME */}
            {!(isCompactChat && isCompactOverlaysHidden) && (
            <div
                className="pso-hex-bar-wrap pso-interactive"
                data-testid="pso-hex-quickbar"
                onMouseEnter={onHudMouseEnter}
                onMouseLeave={onHudMouseLeave}
            >
                {equippedHexDefs.length > 0 && (
                    <div
                        className="pso-hex-quickbar"
                        role="toolbar"
                        aria-label="PSO Episode IV Quick Action Palette"
                    >
                        {equippedHexDefs.map((slot, index) => {
                            const displayNum = index === 9 ? 0 : index + 1;
                            const isSelected = activeHexAction === slot.id || slot.active;
                            return (
                                <button
                                    key={slot.id}
                                    type="button"
                                    className={classNames("pso-hex-slot", {
                                        "pso-hex-slot--active": isSelected,
                                        "pso-hex-slot--danger": slot.danger,
                                    })}
                                    onClick={() => executeHexAction(slot.id)}
                                    title={`${slot.label} (Alt+${displayNum})`}
                                    data-testid={`pso-hex-slot-${displayNum}`}
                                >
                                    <span className="pso-hex-num">{displayNum}</span>
                                    <svg className="pso-hex-svg" viewBox="0 0 44 46">
                                        <polygon
                                            className="pso-hex-outer"
                                            points="22,2 41,12 41,34 22,44 3,34 3,12"
                                        />
                                        <polygon
                                            className="pso-hex-inner"
                                            points="22,6 37,14.5 37,31.5 22,40 7,31.5 7,14.5"
                                        />
                                    </svg>
                                    <span className="pso-hex-glyph" style={{ color: slot.color }}>
                                        {slot.icon}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Bottom-Right Episode IV Interlocking 4-Hex Diamond Cluster (1 Top Chat + 3 Bottom/Middle) + @Beat Time */}
                <div
                    className={classNames("pso-hex-right-cluster", {
                        "pso-hex-right-cluster--floating": diamondPos !== null,
                        "pso-hex-right-cluster--dragging": isDraggingDiamond,
                    })}
                    style={
                        diamondPos
                            ? {
                                  position: "fixed",
                                  left: `${diamondPos.x}px`,
                                  top: `${diamondPos.y}px`,
                                  right: "auto",
                                  bottom: "auto",
                                  zIndex: 622,
                              }
                            : undefined
                    }
                >
                    <div className="pso-hex-diamond-group">
                        {/* Center Drag Handle to Move the 4-Hexagon Quadrant Anywhere on Screen */}
                        <div
                            className="pso-hex-diamond-drag-handle"
                            title="Drag to move 4-Hexagon Quadrant anywhere • Double-click to snap back to bottom-right edge"
                            onDoubleClick={() => saveDiamondPos(null)}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const clusterEl = e.currentTarget.closest(".pso-hex-right-cluster") as HTMLElement | null;
                                if (!clusterEl) return;
                                const rect = clusterEl.getBoundingClientRect();
                                const startClientX = e.clientX;
                                const startClientY = e.clientY;
                                const startX = rect.left;
                                const startY = rect.top;
                                setIsDraggingDiamond(true);

                                const onMove = (ev: PointerEvent): void => {
                                    const nextX = Math.max(
                                        6,
                                        Math.min(window.innerWidth - rect.width - 6, startX + (ev.clientX - startClientX)),
                                    );
                                    const nextY = Math.max(
                                        30,
                                        Math.min(window.innerHeight - rect.height - 4, startY + (ev.clientY - startClientY)),
                                    );
                                    saveDiamondPos({ x: Math.round(nextX), y: Math.round(nextY) });
                                };
                                const onUp = (): void => {
                                    setIsDraggingDiamond(false);
                                    if (document.activeElement instanceof HTMLElement) {
                                        document.activeElement.blur();
                                    }
                                    window.removeEventListener("pointermove", onMove);
                                    window.removeEventListener("pointerup", onUp);
                                    window.removeEventListener("pointercancel", onUp);
                                };
                                window.addEventListener("pointermove", onMove);
                                window.addEventListener("pointerup", onUp);
                                window.addEventListener("pointercancel", onUp);
                            }}
                        >
                            ✥
                        </div>
                        {/* TOP HEXAGON: Chatting (Quick SAY / Right-click for Symbol Chat Maker) */}
                        <button
                            type="button"
                            className={classNames("pso-tri-hex pso-tri-hex--diamond-top", {
                                "pso-tri-hex--active": isQuickReplyOpen || isSymbolEditorOpen,
                            })}
                            onClick={() => executeHexAction("quick_comm")}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setIsSymbolEditorOpen((prev) => !prev);
                            }}
                            title="Quick Comm Chat Input (Alt+0) • Right-Click: Open PSO Symbol Chat Maker"
                        >
                            <svg viewBox="0 0 44 44">
                                <polygon
                                    points="22,2 41,12 41,32 22,42 3,32 3,12"
                                    fill={
                                        isQuickReplyOpen || isSymbolEditorOpen
                                            ? "rgba(42, 132, 156, 0.94)"
                                            : "rgba(16, 48, 62, 0.9)"
                                    }
                                    stroke="#8ae3dd"
                                    strokeWidth="2.4"
                                />
                                <polygon
                                    points="22,6 37,14 37,30 22,38 7,30 7,14"
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.35)"
                                    strokeWidth="1"
                                />
                            </svg>
                            <span>💬</span>
                        </button>

                        {/* MIDDLE-LEFT HEXAGON: Compact Text-Only Chatbox + Top-Left Voice HUD (Alt+C) */}
                        <button
                            type="button"
                            className={classNames("pso-tri-hex pso-tri-hex--diamond-left", {
                                "pso-tri-hex--active": isCompactChat,
                            })}
                            onClick={() => executeHexAction("compact_chat")}
                            title={
                                isCompactChat
                                    ? "Exit Compact PSO Chat & Party Voice HUD (Alt+C)"
                                    : "Compact PSO Chat & Top-Left Party Voice HUD (Alt+C)"
                            }
                            data-testid="pso-compact-chat-toggle"
                        >
                            <svg viewBox="0 0 44 44">
                                <polygon
                                    points="22,2 41,12 41,32 22,42 3,32 3,12"
                                    fill={isCompactChat ? "rgba(196, 42, 42, 0.92)" : "rgba(110, 22, 26, 0.88)"}
                                    stroke="#8ae3dd"
                                    strokeWidth="2.4"
                                />
                                <polygon
                                    points="22,6 37,14 37,30 22,38 7,30 7,14"
                                    fill="none"
                                    stroke="rgba(255, 160, 160, 0.45)"
                                    strokeWidth="1"
                                />
                            </svg>
                            <span>▤</span>
                        </button>

                        {/* MIDDLE-RIGHT HEXAGON: Stream Overlay / Click-Through Mode (Alt+O) */}
                        <button
                            type="button"
                            className={classNames("pso-tri-hex pso-tri-hex--diamond-right", {
                                "pso-tri-hex--active": isStreamOverlay,
                            })}
                            onClick={() => executeHexAction("stream_overlay")}
                            title={
                                isStreamOverlay
                                    ? "Restore Full PSO Matrix HUD (Alt+O)"
                                    : "Pin Ep.4 Hex Overlay — Stream Mode (Alt+O)"
                            }
                            data-testid="pso-stream-overlay-toggle"
                        >
                            <svg viewBox="0 0 44 44">
                                <polygon
                                    points="22,2 41,12 41,32 22,42 3,32 3,12"
                                    fill={isStreamOverlay ? "rgba(218, 142, 38, 0.92)" : "rgba(86, 44, 16, 0.88)"}
                                    stroke="#8ae3dd"
                                    strokeWidth="2.4"
                                />
                                <polygon
                                    points="22,6 37,14 37,30 22,38 7,30 7,14"
                                    fill="none"
                                    stroke="rgba(255, 214, 150, 0.42)"
                                    strokeWidth="1"
                                />
                            </svg>
                            <span>⟁</span>
                        </button>

                        {/* BOTTOM-CENTER HEXAGON: HUD & Wallpaper Tuner + Symbol Maker Access */}
                        <button
                            ref={tunerToggleRef}
                            type="button"
                            className={classNames("pso-tri-hex pso-tri-hex--diamond-bottom", {
                                "pso-tri-hex--active": isTunerOpen,
                            })}
                            onClick={() => setIsTunerOpen((prev) => !prev)}
                            title="PSO HUD & Wallpaper Tuner + Hex Tray Customizer"
                            data-testid="pso-tuner-toggle"
                        >
                            <svg viewBox="0 0 44 44">
                                <polygon
                                    points="22,2 41,12 41,32 22,42 3,32 3,12"
                                    fill={isTunerOpen ? "rgba(42, 168, 92, 0.94)" : "rgba(18, 86, 48, 0.9)"}
                                    stroke="#8ae3dd"
                                    strokeWidth="2.4"
                                />
                                <polygon
                                    points="22,6 37,14 37,30 22,38 7,30 7,14"
                                    fill="none"
                                    stroke="rgba(160, 255, 196, 0.45)"
                                    strokeWidth="1"
                                />
                            </svg>
                            <span>⚙</span>
                        </button>
                    </div>
                    <div className="pso-beat-time-readout" data-testid="pso-beat-time">
                        {beatTime.clock} / internet time <strong>@ {beatTime.beat}</strong>
                    </div>
                </div>
            </div>
            )}
        </div>
    );

    return (
        <>
            {/* 1. PIONEER 2 / RAGOL ORBITAL SCENE OR CUSTOM WALLPAPER BACKDROP (Rendered in-place at z-index: 0 behind .mx_MatrixChat) */}
            {!isStreamOverlay && !isCompactChat && !isClickThroughGlass && backdropMode !== "transparent" && (
                <div className="pso-scene-backdrop" data-testid="pso-hud-backdrop" aria-hidden="true">
                    {backdropMode === "custom" && customWallpaper ? (
                        <div
                            className="pso-custom-wallpaper"
                            style={{ backgroundImage: `url("${customWallpaper}")` }}
                        />
                    ) : (
                        <svg
                            className="pso-ragol-svg"
                            viewBox="0 0 1600 900"
                            preserveAspectRatio="xMidYMid slice"
                        >
                            <defs>
                                <radialGradient id="psoRagolCore" cx="55%" cy="48%" r="48%">
                                    <stop offset="0%" stopColor="#1c7a7c" stopOpacity="0.62" />
                                    <stop offset="45%" stopColor="#0d4252" stopOpacity="0.38" />
                                    <stop offset="100%" stopColor="#020810" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="psoHorizonRim" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#2aa19c" stopOpacity="0.18" />
                                    <stop offset="48%" stopColor="#8ae3dd" stopOpacity="0.72" />
                                    <stop offset="82%" stopColor="#d99438" stopOpacity="0.48" />
                                    <stop offset="100%" stopColor="#2aa19c" stopOpacity="0.18" />
                                </linearGradient>
                            </defs>
                            <circle cx="880" cy="420" r="540" fill="url(#psoRagolCore)" />
                            <ellipse
                                cx="880"
                                cy="500"
                                rx="690"
                                ry="210"
                                fill="none"
                                stroke="#58cfc9"
                                strokeOpacity="0.28"
                                strokeWidth="1.8"
                                strokeDasharray="10 6"
                            />
                            <ellipse
                                cx="880"
                                cy="500"
                                rx="530"
                                ry="145"
                                fill="none"
                                stroke="#8ae3dd"
                                strokeOpacity="0.36"
                                strokeWidth="1.5"
                            />
                            <path
                                d="M -100 790 Q 820 490 1720 790"
                                fill="none"
                                stroke="url(#psoHorizonRim)"
                                strokeWidth="4"
                            />
                            <path
                                d="M -100 796 Q 820 496 1720 796 L 1720 940 L -100 940 Z"
                                fill="#04151c"
                                fillOpacity="0.78"
                            />
                            <line
                                x1="250"
                                y1="0"
                                x2="120"
                                y2="900"
                                stroke="#58cfc9"
                                strokeOpacity="0.18"
                                strokeWidth="2"
                            />
                            <line
                                x1="1340"
                                y1="0"
                                x2="1480"
                                y2="900"
                                stroke="#58cfc9"
                                strokeOpacity="0.18"
                                strokeWidth="2"
                            />
                        </svg>
                    )}
                    <div className="pso-left-cyan-aura" />
                </div>
            )}

            {/* Portal .pso-hud-layer to document.body so it renders above #mx_PersistedElement_container (Voice/Video Call pane) */}
            {createPortal(hudLayerContent, document.body)}
        </>
    );
}
