/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import {
    loadCompiledGamePack,
    loadPsoUiSprite,
    type PsoCompiledUiEntry,
    type PsoCompiledUiMenuSpec,
} from "./PsoGamePackLoader";
import type {
    PsoBgmTrackId,
    PsoCityEventLayoutId,
    PsoClassModelId,
    PsoGuildRoomEntry,
    PsoLobbyStageId,
    PsoWeaponModelId,
} from "./PsoLobby3dLayer";

/** The six entries of the PSOBB in-game main menu (top-left box). */
export type PsoMainMenuTabId = "item_pack" | "customize" | "chat" | "team" | "options" | "quit";

export type PsoMenuSectionId =
    | "equip"
    | "use_items"
    | "technique"
    | "mag"
    | "rare_drops"
    | "hunter_class"
    | "area_warp"
    | "npc_layout"
    | "guild_cards"
    | "my_card"
    | "simple_mail"
    | "team_list"
    | "sound_bgm"
    | "display";

/** Opens the menu straight onto a tab / section (used by the F-key bar). `nonce` makes repeat requests distinct. */
export interface PsoGameMenuRequest {
    tab: PsoMainMenuTabId;
    section: PsoMenuSectionId | null;
    nonce: number;
}

export interface PsoPartyMemberSummary {
    userId: string;
    displayName: string;
    speaking: boolean;
    muted: boolean;
    local: boolean;
    level: number;
    hpPct: number;
    tpPct: number;
}

export type PsoUiSoundKind = "cursor" | "confirm" | "cancel" | "heal" | "tech";

export interface PsoFullGameMenuProps {
    isOpen: boolean;
    request: PsoGameMenuRequest | null;
    onToggleOpen: (nextOpen?: boolean) => void;
    showFunctionKeyBar: boolean;
    onToggleFunctionKeyBar: () => void;

    displayName: string;
    userId: string;
    classNameLabel: string;
    sectionIdName: string;
    sectionIdColor: string;
    level: number;
    hp: number;
    maxHp: number;
    tp: number;
    maxTp: number;
    meseta: number;
    rareDrops: string[];
    pingMs: number;
    shipName: string;

    isLobby3dOpen: boolean;
    currentStageId: PsoLobbyStageId;
    currentClassId: PsoClassModelId;
    currentWeaponId: PsoWeaponModelId;
    currentBgmTrack: PsoBgmTrackId;
    currentNpcLayout: PsoCityEventLayoutId;
    onOpenOrCloseLobby3d: (open: boolean) => void;
    onSelectStage: (stageId: PsoLobbyStageId) => void;
    onSelectClass: (classId: PsoClassModelId) => void;
    onSelectWeapon: (weaponId: PsoWeaponModelId) => void;
    onSelectBgmTrack: (track: PsoBgmTrackId) => void;
    onSelectNpcLayout: (layout: PsoCityEventLayoutId) => void;
    onCastTechnique: (techName: string, tpCost: number) => void;
    onUseConsumerItem: (itemName: string) => void;

    guildRooms: PsoGuildRoomEntry[];
    partyMembers: PsoPartyMemberSummary[];
    isVoiceActive: boolean;
    isMicMuted: boolean;
    isDeafened: boolean;
    isCompactChat: boolean;
    isClickThroughGlass: boolean;
    isStreamOverlay: boolean;
    onSelectGuildRoom: (roomId: string) => void;
    onSendSimpleMail: (targetName: string, messageText: string) => void;
    onOpenSymbolChatMaker: () => void;
    onOpenHudTuner: () => void;
    onToggleVoiceCall: () => void;
    onToggleMicMute: () => void;
    onToggleDeafen: () => void;
    onToggleCompactChat: () => void;
    onToggleClickThroughGlass: () => void;
    onToggleStreamOverlay: () => void;
    onPlayUiSound: (kind: PsoUiSoundKind) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

type SubAction = "symbol_chat" | "action_palette" | "function_keys" | "team_log" | "resume" | "exit_lobby";

interface SubMenuItem {
    label: string;
    helpKey: string;
    fallbackHelp: string;
    section?: PsoMenuSectionId;
    action?: SubAction;
}

interface MainMenuItem {
    id: PsoMainMenuTabId;
    label: string;
    helpKey: string;
    fallbackHelp: string;
    items: SubMenuItem[];
}

/*
 * The main-menu labels are not stored as plain strings in the client data, so they are spelled out here.
 * Help lines come from unitxt (category 11) when a v2 game pack is available.
 */
const MAIN_MENU: MainMenuItem[] = [
    {
        id: "item_pack",
        label: "Item Pack",
        helpKey: "item_pack",
        fallbackHelp: "Equip weapons or use items here.",
        items: [
            { label: "Equip", section: "equip", helpKey: "equip", fallbackHelp: "Equip weapons, armor and units." },
            { label: "Use Items", section: "use_items", helpKey: "use_items", fallbackHelp: "Use recovery items." },
            { label: "Technique", section: "technique", helpKey: "technique", fallbackHelp: "Cast techniques." },
            { label: "Mag", section: "mag", helpKey: "mag", fallbackHelp: "Check your Mag's status." },
            { label: "Rare Drops", section: "rare_drops", helpKey: "", fallbackHelp: "Review rare items found." },
        ],
    },
    {
        id: "customize",
        label: "Customize",
        helpKey: "customize",
        fallbackHelp: "Customize your character and controls.",
        items: [
            { label: "Action Palette", action: "action_palette", helpKey: "shortcuts", fallbackHelp: "Arrange the HUD and action palette." },
            { label: "Function Keys", action: "function_keys", helpKey: "", fallbackHelp: "Show or hide the F-key bar." },
            { label: "Hunter Class", section: "hunter_class", helpKey: "", fallbackHelp: "Change your hunter's class model." },
            { label: "Area Warp", section: "area_warp", helpKey: "area_map", fallbackHelp: "Warp to another area." },
            { label: "NPC Layout", section: "npc_layout", helpKey: "", fallbackHelp: "Choose the city event layout." },
        ],
    },
    {
        id: "chat",
        label: "Chat",
        helpKey: "chat",
        fallbackHelp: "Communicate with other players.",
        items: [
            { label: "Symbol Chat", action: "symbol_chat", helpKey: "symbol_chat", fallbackHelp: "Create and send Symbol Chats." },
            { label: "Guild Card", section: "guild_cards", helpKey: "guild_card", fallbackHelp: "Browse your Guild Cards (Matrix rooms)." },
            { label: "My Card", section: "my_card", helpKey: "", fallbackHelp: "View your own Guild Card." },
            { label: "Simple Mail", section: "simple_mail", helpKey: "simple_mail", fallbackHelp: "Send Simple Mail." },
        ],
    },
    {
        id: "team",
        label: "Team",
        helpKey: "team_setup",
        fallbackHelp: "Team functions.",
        items: [
            { label: "Team List", section: "team_list", helpKey: "team_list", fallbackHelp: "View team members and voice." },
            { label: "Team Log", action: "team_log", helpKey: "team_log", fallbackHelp: "Toggle the compact chat log." },
        ],
    },
    {
        id: "options",
        label: "Options",
        helpKey: "options",
        fallbackHelp: "Change game settings.",
        items: [
            { label: "Sound", section: "sound_bgm", helpKey: "", fallbackHelp: "Change the background music." },
            { label: "Display", section: "display", helpKey: "", fallbackHelp: "HUD glass and overlay settings." },
        ],
    },
    {
        id: "quit",
        label: "Quit Game",
        helpKey: "quit_online",
        fallbackHelp: "Quit the game.",
        items: [
            { label: "Resume", action: "resume", helpKey: "", fallbackHelp: "Return to the game." },
            { label: "Exit Lobby", action: "exit_lobby", helpKey: "quit_online", fallbackHelp: "Leave the 3D lobby." },
        ],
    },
];

const FALLBACK_STAT_LABELS: PsoCompiledUiMenuSpec["statLabels"] = {
    totalExp: "Total Exp",
    toNextLv: "To Next Lv",
    money: "Money",
    atp: "ATP",
    dfp: "DFP",
    mst: "MST",
    ata: "ATA",
    evp: "EVP",
    lck: "LCK",
    efr: "EFR",
    eic: "EIC",
    eth: "ETH",
    edk: "EDK",
    elt: "ELT",
    magLevel: "Level",
    synchro: "Synchro",
    iq: "IQ",
    meseta: "Meseta",
};

const FALLBACK_TECHNIQUES: PsoCompiledUiEntry[] = [
    "Foie",
    "Gifoie",
    "Rafoie",
    "Barta",
    "Gibarta",
    "Rabarta",
    "Zonde",
    "Gizonde",
    "Razonde",
    "Grants",
    "Deband",
    "Jellen",
    "Zalure",
    "Shifta",
    "Ryuker",
    "Resta",
    "Anti",
    "Reverser",
    "Megid",
].map((name) => ({ id: name.toLowerCase(), name, description: "" }));

const FALLBACK_TOOLS: PsoCompiledUiEntry[] = ["Monomate", "Dimate", "Trimate", "Monofluid", "Difluid", "Trifluid", "Antidote", "Antiparalysis", "Telepipe"].map(
    (name) => ({ id: name.toLowerCase(), name, description: "" }),
);

const TECH_TP_COST: Record<string, number> = {
    foie: 5,
    gifoie: 15,
    rafoie: 20,
    barta: 6,
    gibarta: 16,
    rabarta: 22,
    zonde: 7,
    gizonde: 17,
    razonde: 24,
    grants: 30,
    deband: 10,
    jellen: 10,
    zalure: 10,
    shifta: 10,
    ryuker: 10,
    resta: 15,
    anti: 8,
    reverser: 30,
    megid: 30,
};

const WEAPON_ARSENAL: Array<{ id: PsoWeaponModelId; name: string; atp: number; ata: number; desc: string }> = [
    { id: "photon_saber", name: "Saber +35", atp: 260, ata: 42, desc: "Standard-issue Pioneer 2 photon blade." },
    { id: "red_sword", name: "Red Sword +52", atp: 612, ata: 38, desc: "A crimson greatsword bearing the inscription 'Rico'." },
    { id: "dark_flow", name: "Dark Flow", atp: 900, ata: 50, desc: "An abyssal greatsword fused with a parasitic gene." },
    { id: "kingdom_key", name: "Kingdom Key", atp: 540, ata: 55, desc: "Keyblade of the Realm of Light." },
    { id: "oathkeeper", name: "Oathkeeper", atp: 680, ata: 62, desc: "Iridescent Keyblade born of a promise." },
];

const STAGE_OPTIONS: Array<{ id: PsoLobbyStageId; name: string; desc: string }> = [
    { id: "bb_city00", name: "Pioneer 2", desc: "City concourse, Hunter's Guild, Medical Center and shops." },
    { id: "bb_lobby_01", name: "Visual Lobby 01", desc: "Ship block lobby with the central warp dais." },
    { id: "bb_labo00", name: "Lab", desc: "Episode II research command center." },
    { id: "bb_forest01", name: "Forest 1", desc: "Central Dome perimeter forest on Ragol." },
    { id: "bb_cave01", name: "Cave 1", desc: "Volcanic caverns beneath the Central Dome." },
    { id: "bb_machine01", name: "Mine 1", desc: "Automated Pioneer 1 mining complex." },
    { id: "bb_ruins01", name: "Ruins 1", desc: "Ancient sealed ship beneath the Mines." },
    { id: "pioneer2_holodeck", name: "Holodeck", desc: "Procedural training holodeck." },
];

const CLASS_OPTIONS: Array<{ id: PsoClassModelId; label: string; race: string }> = [
    { id: "humar", label: "HUmar", race: "Human Male Hunter" },
    { id: "hunewearl", label: "HUnewearl", race: "Newman Female Hunter" },
    { id: "hucast", label: "HUcast", race: "Android Male Hunter" },
    { id: "hucaseal", label: "HUcaseal", race: "Android Female Hunter" },
    { id: "ramar", label: "RAmar", race: "Human Male Ranger" },
    { id: "ramarl", label: "RAmarl", race: "Human Female Ranger" },
    { id: "racast", label: "RAcast", race: "Android Male Ranger" },
    { id: "racaseal", label: "RAcaseal", race: "Android Female Ranger" },
    { id: "fomar", label: "FOmar", race: "Human Male Force" },
    { id: "fomarl", label: "FOmarl", race: "Human Female Force" },
    { id: "fonewm", label: "FOnewm", race: "Newman Male Force" },
    { id: "fonewearl", label: "FOnewearl", race: "Newman Female Force" },
];

const NPC_LAYOUTS: Array<{ id: PsoCityEventLayoutId; label: string }> = [
    { id: "e", label: "Standard" },
    { id: "e_s", label: "Spring / Summer event" },
    { id: "e_d", label: "Winter event" },
    { id: "e_c1", label: "Seasonal event 1" },
];

const BGM_TRACKS: Array<{ id: PsoBgmTrackId; label: string }> = [
    { id: "synth", label: "Synth (procedural)" },
    { id: "CITY.ogg", label: "City" },
    { id: "LOBBY.ogg", label: "Lobby" },
    { id: "GUILD.ogg", label: "Hunter's Guild" },
    { id: "MEDICAL.ogg", label: "Medical Center" },
    { id: "SHOP.ogg", label: "Shops" },
    { id: "LABO.ogg", label: "Lab" },
    { id: "slbgm_forest.ogg", label: "Forest" },
];

const STATUS_PAGE_COUNT = 7;

/** Sprite rects (x, y, w, h) inside the extracted `f256_hyouji.xvm` sheet. */
const SPRITES = {
    plate: { tex: 13, rect: [0, 0, 228, 76] },
    menuBox: { tex: 13, rect: [0, 80, 116, 94] },
    windowFrame: { tex: 1, rect: [0, 0, 96, 96] },
} as const;
type SpriteKey = keyof typeof SPRITES;

/*
 * Layout in PSOBB's 640x480 virtual space; 1 unit = viewport height / 480.
 * Left-anchored and right-anchored windows mirror how the client keeps the HUD at the screen edges on wide resolutions.
 */
const LAYOUT = {
    plate: { left: 22, top: 30, w: 228, h: 76 },
    menu: { left: 40, top: 112, w: 128, rowH: 15, pad: 10 },
    sub: { left: 172, w: 150 },
    help: { left: 19, top: 315, w: 203, h: 101 },
    status: { right: 31, top: 256, w: 309, h: 156 },
    clock: { right: 30, top: 424 },
    detail: { left: 330, top: 18, right: 18, bottom: 248 },
    cutout: { left: 162, bottom: 244, radius: 14 },
} as const;

/* Opening sequence reconstructed from captured frames: rows appear one at a time while the tint rises from below. */
const ROW_REVEAL_MS = 70;
const COVER_OPEN_MS = 300;
const COVER_CLOSE_MS = 180;

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function formatInternetTime(now: Date): string {
    const utcSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const beats = Math.floor((((utcSeconds + 3600) % 86400) / 86.4) % 1000);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}/internet time @ ${String(beats).padStart(3, "0")}`;
}

function experienceForLevel(level: number): number {
    return Math.round(Math.pow(Math.max(0, level - 1), 2.6) * 18);
}

function usePsoUiSprites(sheetUrl: string | null): Partial<Record<SpriteKey, string>> {
    const [sprites, setSprites] = useState<Partial<Record<SpriteKey, string>>>({});
    useEffect(() => {
        if (!sheetUrl) return;
        let cancelled = false;
        void (async (): Promise<void> => {
            const next: Partial<Record<SpriteKey, string>> = {};
            for (const key of Object.keys(SPRITES) as SpriteKey[]) {
                const def = SPRITES[key];
                const url = await loadPsoUiSprite(sheetUrl, def.tex, def.rect);
                if (url) next[key] = url;
            }
            if (!cancelled) setSprites(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [sheetUrl]);
    return sprites;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>, active: boolean): { w: number; h: number } {
    const [size, setSize] = useState({ w: 640, h: 480 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!active || !el) return;
        const measure = (): void => {
            const w = el.clientWidth || 640;
            const h = el.clientHeight || 480;
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        };
        measure();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", measure);
            return () => window.removeEventListener("resize", measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, active]);
    return size;
}

const PsoWindow: React.FC<{
    sprite?: string;
    kind: "box" | "frame";
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
    testId?: string;
}> = ({ sprite, kind, className, style, children, testId }) => (
    <div
        className={classNames("pso-gm-window", `pso-gm-window--${kind}`, { "pso-gm-window--sprite": !!sprite }, className)}
        style={sprite ? { ...style, borderImageSource: `url(${sprite})` } : style}
        data-testid={testId}
    >
        {children}
    </div>
);

export const PsoFullGameMenu: React.FC<PsoFullGameMenuProps> = (props) => {
    const {
        isOpen,
        request,
        onToggleOpen,
        showFunctionKeyBar,
        onToggleFunctionKeyBar,
        displayName,
        userId,
        classNameLabel,
        sectionIdName,
        sectionIdColor,
        level,
        hp,
        maxHp,
        tp,
        maxTp,
        meseta,
        pingMs,
        shipName,
        isLobby3dOpen,
        partyMembers,
        isVoiceActive,
        isMicMuted,
        onOpenOrCloseLobby3d,
        onOpenSymbolChatMaker,
        onOpenHudTuner,
        onToggleCompactChat,
        onPlayUiSound,
        onMouseEnter,
        onMouseLeave,
    } = props;

    const rootRef = useRef<HTMLDivElement | null>(null);
    const [isMounted, setIsMounted] = useState(isOpen);
    const [coverProgress, setCoverProgress] = useState(0);
    const [revealedRows, setRevealedRows] = useState(0);
    const [cursor, setCursor] = useState(0);
    const [subOpen, setSubOpen] = useState(false);
    const [subCursor, setSubCursor] = useState(0);
    const [subRevealed, setSubRevealed] = useState(0);
    const [section, setSection] = useState<PsoMenuSectionId | null>(null);
    const [statusPage, setStatusPage] = useState(0);
    const [clockText, setClockText] = useState(() => formatInternetTime(new Date()));
    const [spec, setSpec] = useState<PsoCompiledUiMenuSpec | null>(null);
    const coverProgressRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        void loadCompiledGamePack().then((pack) => {
            if (!cancelled && pack.uiMenuSpec?.uiSpecVersion === 2) setSpec(pack.uiMenuSpec);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const sprites = usePsoUiSprites(spec?.uiXvmSheets?.hudGauges ?? null);
    const { w: containerW, h: containerH } = useContainerSize(rootRef, isMounted);
    const unit = containerH / 480;

    // Mount immediately on open; keep mounted during the close animation.
    useEffect(() => {
        if (isOpen) {
            setIsMounted(true);
            return;
        }
        if (!isMounted) return;
        const timer = window.setTimeout(() => setIsMounted(false), COVER_CLOSE_MS);
        return () => window.clearTimeout(timer);
    }, [isOpen, isMounted]);

    useEffect(() => {
        if (!isMounted) return;
        const from = coverProgressRef.current;
        const to = isOpen ? 1 : 0;
        const duration = isOpen ? COVER_OPEN_MS : COVER_CLOSE_MS;
        const start = performance.now();
        let frame = 0;
        const step = (now: number): void => {
            const t = Math.min(1, (now - start) / duration);
            const value = from + (to - from) * t;
            coverProgressRef.current = value;
            setCoverProgress(value);
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [isOpen, isMounted]);

    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (!isOpen) {
            if (wasOpenRef.current) onPlayUiSound("cancel");
            wasOpenRef.current = false;
            setRevealedRows(0);
            setSubOpen(false);
            setSection(null);
            return;
        }
        wasOpenRef.current = true;
        onPlayUiSound("confirm");
        setRevealedRows(1);
        const timer = window.setInterval(() => {
            setRevealedRows((n) => {
                if (n >= MAIN_MENU.length) {
                    window.clearInterval(timer);
                    return n;
                }
                return n + 1;
            });
        }, ROW_REVEAL_MS);
        return () => window.clearInterval(timer);
        // The open sound should fire once per opening, not when the callback identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!subOpen) {
            setSubRevealed(0);
            return;
        }
        const total = MAIN_MENU[cursor].items.length;
        setSubRevealed(1);
        const timer = window.setInterval(() => {
            setSubRevealed((n) => {
                if (n >= total) {
                    window.clearInterval(timer);
                    return n;
                }
                return n + 1;
            });
        }, ROW_REVEAL_MS);
        return () => window.clearInterval(timer);
    }, [subOpen, cursor]);

    useEffect(() => {
        if (!isOpen) return;
        const timer = window.setInterval(() => setClockText(formatInternetTime(new Date())), 10_000);
        return () => window.clearInterval(timer);
    }, [isOpen]);

    useEffect(() => {
        document.body.classList.toggle("pso-gamemenu-open", isOpen);
        return () => document.body.classList.remove("pso-gamemenu-open");
    }, [isOpen]);

    const handledRequestNonceRef = useRef<number | null>(null);
    useEffect(() => {
        if (!request || !isOpen || handledRequestNonceRef.current === request.nonce) return;
        handledRequestNonceRef.current = request.nonce;
        const tabIndex = Math.max(
            0,
            MAIN_MENU.findIndex((m) => m.id === request.tab),
        );
        setCursor(tabIndex);
        setRevealedRows(MAIN_MENU.length);
        if (request.section) {
            const subIndex = MAIN_MENU[tabIndex].items.findIndex((i) => i.section === request.section);
            setSubOpen(true);
            setSubCursor(Math.max(0, subIndex));
            setSection(request.section);
        } else {
            setSubOpen(false);
            setSection(null);
        }
    }, [request, isOpen]);

    const activeMain = MAIN_MENU[cursor];
    const activeSub = subOpen ? activeMain.items[subCursor] : undefined;

    const helpText = useMemo(() => {
        const target = activeSub ?? activeMain;
        return (target.helpKey && spec?.helpTexts?.[target.helpKey]) || target.fallbackHelp;
    }, [activeMain, activeSub, spec]);

    const runSubItem = useCallback(
        (item: SubMenuItem): void => {
            onPlayUiSound("confirm");
            if (item.section) {
                setSection(item.section);
                return;
            }
            switch (item.action) {
                case "symbol_chat":
                    onToggleOpen(false);
                    onOpenSymbolChatMaker();
                    break;
                case "action_palette":
                    onToggleOpen(false);
                    onOpenHudTuner();
                    break;
                case "function_keys":
                    onToggleFunctionKeyBar();
                    break;
                case "team_log":
                    onToggleCompactChat();
                    break;
                case "resume":
                    onToggleOpen(false);
                    break;
                case "exit_lobby":
                    onToggleOpen(false);
                    onOpenOrCloseLobby3d(false);
                    break;
            }
        },
        [onPlayUiSound, onToggleOpen, onOpenSymbolChatMaker, onOpenHudTuner, onToggleFunctionKeyBar, onToggleCompactChat, onOpenOrCloseLobby3d],
    );

    const goBack = useCallback((): void => {
        if (section || subOpen) onPlayUiSound("cancel");
        if (section) setSection(null);
        else if (subOpen) setSubOpen(false);
        else onToggleOpen(false);
    }, [onPlayUiSound, section, subOpen, onToggleOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement | null;
            const inField =
                !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (inField && e.key !== "Escape") return;
            if (inField && !rootRef.current?.contains(target)) return;

            let handled = true;
            switch (e.key) {
                case "ArrowUp":
                case "ArrowDown": {
                    if (section) {
                        handled = false;
                        break;
                    }
                    const delta = e.key === "ArrowUp" ? -1 : 1;
                    if (subOpen) {
                        const n = activeMain.items.length;
                        setSubCursor((c) => (c + delta + n) % n);
                    } else {
                        setCursor((c) => (c + delta + MAIN_MENU.length) % MAIN_MENU.length);
                    }
                    onPlayUiSound("cursor");
                    break;
                }
                case "Enter":
                case "ArrowRight":
                    if (section) {
                        handled = e.key === "ArrowRight";
                        if (handled) setStatusPage((p) => (p + 1) % STATUS_PAGE_COUNT);
                        break;
                    }
                    if (subOpen) runSubItem(activeMain.items[subCursor]);
                    else {
                        onPlayUiSound("confirm");
                        setSubCursor(0);
                        setSubOpen(true);
                    }
                    break;
                case "Escape":
                case "Backspace":
                case "ArrowLeft":
                    goBack();
                    break;
                case "[":
                case "PageUp":
                    setStatusPage((p) => (p - 1 + STATUS_PAGE_COUNT) % STATUS_PAGE_COUNT);
                    onPlayUiSound("cursor");
                    break;
                case "]":
                case "PageDown":
                    setStatusPage((p) => (p + 1) % STATUS_PAGE_COUNT);
                    onPlayUiSound("cursor");
                    break;
                default:
                    handled = false;
            }
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isOpen, section, subOpen, subCursor, activeMain, runSubItem, goBack, onPlayUiSound]);

    const svgIdBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");

    if (!isMounted) {
        return <div ref={rootRef} className="pso-gm-root pso-gm-root--hidden" aria-hidden="true" />;
    }

    const statLabels = spec?.statLabels ?? FALLBACK_STAT_LABELS;
    const eased = easeOutCubic(coverProgress);
    const cutLeft = LAYOUT.cutout.left * unit * eased;
    const cutBottom = containerH - (containerH - LAYOUT.cutout.bottom * unit) * eased;
    const cutRadius = LAYOUT.cutout.radius * unit * eased;
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    const tpPct = maxTp > 0 ? Math.max(0, Math.min(100, (tp / maxTp) * 100)) : 0;
    const totalExp = experienceForLevel(level);
    const toNext = Math.max(0, experienceForLevel(level + 1) - totalExp);
    const menuH = LAYOUT.menu.pad * 2 + LAYOUT.menu.rowH * Math.max(1, revealedRows);
    const subTop = LAYOUT.menu.top + cursor * LAYOUT.menu.rowH;
    const subH = LAYOUT.menu.pad * 2 + LAYOUT.menu.rowH * Math.max(1, subRevealed);

    const rootStyle = { "--u": `${unit}px` } as React.CSSProperties;

    return (
        <div
            ref={rootRef}
            className={classNames("pso-gm-root", { "pso-gm-root--closing": !isOpen })}
            style={rootStyle}
            data-testid="pso-full-game-menu"
            role="dialog"
            aria-label="Main menu"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <svg className="pso-gm-cover" width={containerW} height={containerH} aria-hidden="true">
                <defs>
                    <pattern id={`${svgIdBase}-scan`} width="4" height="3" patternUnits="userSpaceOnUse">
                        <rect width="4" height="3" fill="rgba(8, 58, 66, 0.7)" />
                        <rect y="2" width="4" height="1" fill="rgba(0, 14, 20, 0.45)" />
                    </pattern>
                    <mask id={`${svgIdBase}-mask`}>
                        <rect width={containerW} height={containerH} fill="white" />
                        <rect
                            x={cutLeft}
                            y={-cutRadius}
                            width={Math.max(0, containerW - cutLeft + cutRadius)}
                            height={Math.max(0, cutBottom + cutRadius)}
                            rx={cutRadius}
                            fill="black"
                        />
                    </mask>
                </defs>
                <rect
                    width={containerW}
                    height={containerH}
                    fill={`url(#${svgIdBase}-scan)`}
                    mask={`url(#${svgIdBase}-mask)`}
                />
                <rect
                    x={cutLeft}
                    y={-cutRadius - 4}
                    width={Math.max(0, containerW - cutLeft + cutRadius + 4)}
                    height={Math.max(0, cutBottom + cutRadius + 4)}
                    rx={cutRadius}
                    fill="none"
                    stroke="#62e6dc"
                    strokeWidth={Math.max(1, 1.5 * unit)}
                    opacity={eased}
                />
            </svg>

            <div
                className={classNames("pso-gm-plate", { "pso-gm-plate--sprite": !!sprites.plate })}
                style={{ ...box(LAYOUT.plate), backgroundImage: sprites.plate ? `url(${sprites.plate})` : undefined }}
                data-testid="pso-gm-plate"
            >
                <span className="pso-gm-plate-label pso-gm-plate-label--hp">HP</span>
                <span className="pso-gm-plate-value pso-gm-plate-value--hp">
                    {Math.round(hp)}/{Math.round(maxHp)}
                </span>
                <span className="pso-gm-plate-bar pso-gm-plate-bar--hp">
                    <span style={{ width: `${hpPct}%` }} />
                </span>
                <span className="pso-gm-plate-label pso-gm-plate-label--tp">TP</span>
                <span className="pso-gm-plate-value pso-gm-plate-value--tp">
                    {Math.round(tp)}/{Math.round(maxTp)}
                </span>
                <span className="pso-gm-plate-bar pso-gm-plate-bar--tp">
                    <span style={{ width: `${tpPct}%` }} />
                </span>
                <span className="pso-gm-plate-level">Lv {level}</span>
                <span className="pso-gm-plate-name">{displayName}</span>
            </div>

            <PsoWindow
                kind="box"
                sprite={sprites.menuBox}
                className="pso-gm-menu"
                style={box({ left: LAYOUT.menu.left, top: LAYOUT.menu.top, w: LAYOUT.menu.w, h: menuH })}
                testId="pso-gm-main-menu"
            >
                {MAIN_MENU.slice(0, revealedRows).map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        className={classNames("pso-gm-row", { "pso-gm-row--active": index === cursor })}
                        data-testid={`pso-gamemenu-tab-${item.id}`}
                        onMouseEnter={() => {
                            if (subOpen || index === cursor) return;
                            setCursor(index);
                            onPlayUiSound("cursor");
                        }}
                        onClick={() => {
                            setCursor(index);
                            setSection(null);
                            setSubCursor(0);
                            setSubOpen(true);
                            onPlayUiSound("confirm");
                        }}
                    >
                        {item.label}
                    </button>
                ))}
            </PsoWindow>

            {subOpen && (
                <PsoWindow
                    kind="box"
                    sprite={sprites.menuBox}
                    className="pso-gm-menu pso-gm-menu--sub"
                    style={box({ left: LAYOUT.sub.left, top: subTop, w: LAYOUT.sub.w, h: subH })}
                    testId="pso-gm-sub-menu"
                >
                    {activeMain.items.slice(0, subRevealed).map((item, index) => (
                        <button
                            key={item.label}
                            type="button"
                            className={classNames("pso-gm-row", {
                                "pso-gm-row--active": index === subCursor,
                                "pso-gm-row--on": item.action === "function_keys" && showFunctionKeyBar,
                            })}
                            data-testid={`pso-gm-sub-${item.section ?? item.action}`}
                            onMouseEnter={() => {
                                if (section || index === subCursor) return;
                                setSubCursor(index);
                                onPlayUiSound("cursor");
                            }}
                            onClick={() => {
                                setSubCursor(index);
                                runSubItem(item);
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </PsoWindow>
            )}

            {section && (
                <PsoWindow
                    kind="frame"
                    sprite={sprites.windowFrame}
                    className="pso-gm-detail"
                    style={{
                        left: `calc(var(--u) * ${LAYOUT.detail.left})`,
                        top: `calc(var(--u) * ${LAYOUT.detail.top})`,
                        right: `calc(var(--u) * ${LAYOUT.detail.right})`,
                        bottom: `calc(var(--u) * ${LAYOUT.detail.bottom})`,
                    }}
                    testId={`pso-gm-detail-${section}`}
                >
                    <div className="pso-gm-detail-title">
                        <span>{activeSub?.label ?? ""}</span>
                        <button
                            type="button"
                            className="pso-gm-detail-close"
                            onClick={goBack}
                            aria-label="Back"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="pso-gm-detail-body">
                        <PsoMenuSection section={section} spec={spec} {...props} />
                    </div>
                </PsoWindow>
            )}

            <PsoWindow
                kind="frame"
                sprite={sprites.windowFrame}
                className="pso-gm-help"
                style={box(LAYOUT.help)}
                testId="pso-gm-help"
            >
                {helpText}
            </PsoWindow>

            <PsoWindow
                kind="frame"
                sprite={sprites.windowFrame}
                className="pso-gm-status"
                style={{
                    right: `calc(var(--u) * ${LAYOUT.status.right})`,
                    top: `calc(var(--u) * ${LAYOUT.status.top})`,
                    width: `calc(var(--u) * ${LAYOUT.status.w})`,
                    height: `calc(var(--u) * ${LAYOUT.status.h})`,
                }}
                testId="pso-gm-status"
            >
                <div className="pso-gm-status-page">
                    {statusPage === 0 && (
                        <>
                            <StatusRow label={displayName} value={`Lv ${level}`} strong />
                            <StatusRow label={classNameLabel} value="" />
                            <div className="pso-gm-status-row">
                                <span>{sectionIdName}</span>
                                <span className="pso-gm-section-emblem" style={{ color: sectionIdColor }}>
                                    ◆
                                </span>
                            </div>
                            <StatusRow label={statLabels.totalExp} value={totalExp.toLocaleString()} />
                            <StatusRow label={statLabels.toNextLv} value={toNext.toLocaleString()} />
                            <StatusRow label={statLabels.money} value={meseta.toLocaleString()} />
                        </>
                    )}
                    {statusPage === 1 && (
                        <>
                            <StatusRow label="HP" value={`${Math.round(hp)}/${Math.round(maxHp)}`} />
                            <StatusRow label="TP" value={`${Math.round(tp)}/${Math.round(maxTp)}`} />
                            <StatusRow label={statLabels.atp} value={String(80 + level * 9)} />
                            <StatusRow label={statLabels.dfp} value={String(40 + level * 4)} />
                            <StatusRow label={statLabels.mst} value={String(30 + level * 5)} />
                            <StatusRow label={statLabels.ata} value={String(60 + level * 2)} />
                            <StatusRow label={statLabels.evp} value={String(50 + level * 3)} />
                            <StatusRow label={statLabels.lck} value="10" />
                        </>
                    )}
                    {statusPage === 2 && (
                        <>
                            <StatusRow label={statLabels.efr} value={String(Math.min(60, Math.floor(level / 4)))} />
                            <StatusRow label={statLabels.eic} value={String(Math.min(60, Math.floor(level / 4)))} />
                            <StatusRow label={statLabels.eth} value={String(Math.min(60, Math.floor(level / 4)))} />
                            <StatusRow label={statLabels.edk} value={String(Math.min(60, Math.floor(level / 5)))} />
                            <StatusRow label={statLabels.elt} value={String(Math.min(60, Math.floor(level / 5)))} />
                        </>
                    )}
                    {statusPage === 3 && (
                        <>
                            <StatusRow label="Mag" value="Mag" strong />
                            <StatusRow label={statLabels.magLevel} value={String(Math.min(200, 5 + level))} />
                            <StatusRow label={statLabels.synchro} value="120%" />
                            <StatusRow label={statLabels.iq} value="200" />
                        </>
                    )}
                    {statusPage === 4 && (
                        <>
                            <StatusRow label="Matrix" value="" strong />
                            <StatusRow label="Ping" value={`${pingMs} ms`} />
                            <StatusRow label="Voice" value={isVoiceActive ? "Connected" : "Off"} />
                            <StatusRow label="Mic" value={isMicMuted ? "Muted" : "Live"} />
                            <StatusRow label="ID" value={userId} />
                        </>
                    )}
                    {statusPage === 5 && (
                        <>
                            <StatusRow label="Party" value={`${partyMembers.length}`} strong />
                            {partyMembers.slice(0, 5).map((m) => (
                                <StatusRow
                                    key={m.userId}
                                    label={`${m.speaking ? "♪ " : ""}${m.displayName}`}
                                    value={`Lv ${m.level}`}
                                />
                            ))}
                        </>
                    )}
                    {statusPage === 6 && (
                        <>
                            <StatusRow label="Ship" value={shipName} strong />
                            <StatusRow
                                label="Area"
                                value={STAGE_OPTIONS.find((s) => s.id === props.currentStageId)?.name ?? ""}
                            />
                            <StatusRow label="3D Lobby" value={isLobby3dOpen ? "Open" : "Closed"} />
                        </>
                    )}
                </div>
                <div className="pso-gm-pager">
                    <button
                        type="button"
                        aria-label="Previous page"
                        data-testid="pso-gm-status-prev"
                        onClick={() => {
                            setStatusPage((p) => (p - 1 + STATUS_PAGE_COUNT) % STATUS_PAGE_COUNT);
                            onPlayUiSound("cursor");
                        }}
                    >
                        ◀◀
                    </button>
                    <span data-testid="pso-gm-status-page">
                        {statusPage + 1}/{STATUS_PAGE_COUNT}
                    </span>
                    <button
                        type="button"
                        aria-label="Next page"
                        data-testid="pso-gm-status-next"
                        onClick={() => {
                            setStatusPage((p) => (p + 1) % STATUS_PAGE_COUNT);
                            onPlayUiSound("cursor");
                        }}
                    >
                        ▶▶
                    </button>
                </div>
            </PsoWindow>

            <div
                className="pso-gm-clock"
                style={{
                    right: `calc(var(--u) * ${LAYOUT.clock.right})`,
                    top: `calc(var(--u) * ${LAYOUT.clock.top})`,
                }}
            >
                {clockText}
            </div>
        </div>
    );
};

function box(rect: { left: number; top: number; w: number; h: number }): React.CSSProperties {
    return {
        left: `calc(var(--u) * ${rect.left})`,
        top: `calc(var(--u) * ${rect.top})`,
        width: `calc(var(--u) * ${rect.w})`,
        height: `calc(var(--u) * ${rect.h})`,
    };
}

const StatusRow: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className={classNames("pso-gm-status-row", { "pso-gm-status-row--strong": strong })}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
);

const PsoMenuSection: React.FC<PsoFullGameMenuProps & { section: PsoMenuSectionId; spec: PsoCompiledUiMenuSpec | null }> = (
    props,
) => {
    const { section, spec } = props;
    const [mailTarget, setMailTarget] = useState("");
    const [mailText, setMailText] = useState("");

    const techniques = spec?.techniques?.length ? spec.techniques : FALLBACK_TECHNIQUES;
    const tools = spec?.toolItems?.length ? spec.toolItems : FALLBACK_TOOLS;

    switch (section) {
        case "equip":
            return (
                <div className="pso-gm-list">
                    {WEAPON_ARSENAL.map((w) => (
                        <button
                            key={w.id}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": props.currentWeaponId === w.id })}
                            onClick={() => {
                                props.onSelectWeapon(w.id);
                                props.onPlayUiSound("confirm");
                            }}
                            title={w.desc}
                        >
                            <span>
                                {props.currentWeaponId === w.id ? "E " : ""}
                                {w.name}
                            </span>
                            <span className="pso-gm-list-meta">
                                ATP {w.atp} / ATA {w.ata}
                            </span>
                        </button>
                    ))}
                </div>
            );
        case "use_items":
            return (
                <div className="pso-gm-list">
                    {tools.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="pso-gm-list-item"
                            title={item.description}
                            onClick={() => {
                                props.onUseConsumerItem(item.name);
                                props.onPlayUiSound("heal");
                            }}
                        >
                            <span>{item.name}</span>
                            <span className="pso-gm-list-meta">x10</span>
                        </button>
                    ))}
                </div>
            );
        case "technique":
            return (
                <div className="pso-gm-list">
                    {techniques.map((tech) => {
                        const cost = TECH_TP_COST[tech.name.toLowerCase()] ?? 10;
                        return (
                            <button
                                key={tech.id}
                                type="button"
                                className="pso-gm-list-item"
                                title={tech.description}
                                disabled={props.tp < cost}
                                onClick={() => {
                                    props.onCastTechnique(tech.name, cost);
                                    props.onPlayUiSound("tech");
                                }}
                            >
                                <span>{tech.name}</span>
                                <span className="pso-gm-list-meta">TP {cost}</span>
                            </button>
                        );
                    })}
                </div>
            );
        case "mag":
            return (
                <div className="pso-gm-text">
                    <p>Your Mag follows you through the lobby and reacts to Symbol Chat.</p>
                    <p>Feeding is not wired to items yet.</p>
                </div>
            );
        case "rare_drops":
            return props.rareDrops.length ? (
                <div className="pso-gm-list">
                    {props.rareDrops.map((drop, i) => (
                        <div key={`${drop}-${i}`} className="pso-gm-list-item pso-gm-list-item--rare">
                            <span>{drop}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="pso-gm-text">No rare items found yet.</div>
            );
        case "hunter_class":
            return (
                <div className="pso-gm-list pso-gm-list--grid">
                    {CLASS_OPTIONS.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": props.currentClassId === c.id })}
                            title={c.race}
                            onClick={() => {
                                props.onSelectClass(c.id);
                                props.onPlayUiSound("confirm");
                            }}
                        >
                            <span>{c.label}</span>
                        </button>
                    ))}
                </div>
            );
        case "area_warp":
            return (
                <div className="pso-gm-list">
                    {STAGE_OPTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": props.currentStageId === s.id })}
                            title={s.desc}
                            onClick={() => {
                                if (!props.isLobby3dOpen) props.onOpenOrCloseLobby3d(true);
                                props.onSelectStage(s.id);
                                props.onPlayUiSound("confirm");
                            }}
                        >
                            <span>{s.name}</span>
                        </button>
                    ))}
                </div>
            );
        case "npc_layout":
            return (
                <div className="pso-gm-list">
                    {NPC_LAYOUTS.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": props.currentNpcLayout === l.id })}
                            onClick={() => {
                                props.onSelectNpcLayout(l.id);
                                props.onPlayUiSound("confirm");
                            }}
                        >
                            <span>{l.label}</span>
                        </button>
                    ))}
                </div>
            );
        case "guild_cards":
            return props.guildRooms.length ? (
                <div className="pso-gm-list">
                    {props.guildRooms.map((room) => (
                        <button
                            key={room.roomId}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": room.isCurrent })}
                            onClick={() => {
                                props.onSelectGuildRoom(room.roomId);
                                props.onPlayUiSound("confirm");
                            }}
                        >
                            <span>
                                {room.isDirect ? "✉ " : ""}
                                {room.name}
                            </span>
                            <span className="pso-gm-list-meta">
                                {room.unreadCount ? `${room.unreadCount} new · ` : ""}
                                {room.memberCount}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="pso-gm-text">No Guild Cards (rooms) yet.</div>
            );
        case "my_card":
            return (
                <div className="pso-gm-card">
                    <div className="pso-gm-status-row pso-gm-status-row--strong">
                        <span>{props.displayName}</span>
                        <span>Lv {props.level}</span>
                    </div>
                    <div className="pso-gm-status-row">
                        <span>{props.classNameLabel}</span>
                        <span style={{ color: props.sectionIdColor }}>{props.sectionIdName}</span>
                    </div>
                    <div className="pso-gm-status-row">
                        <span>Guild Card #</span>
                        <span>{props.userId}</span>
                    </div>
                    <div className="pso-gm-status-row">
                        <span>Ship</span>
                        <span>{props.shipName}</span>
                    </div>
                </div>
            );
        case "simple_mail":
            return (
                <form
                    className="pso-gm-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!mailTarget.trim() || !mailText.trim()) return;
                        props.onSendSimpleMail(mailTarget.trim(), mailText.trim());
                        props.onPlayUiSound("confirm");
                        setMailText("");
                    }}
                >
                    <label>
                        To
                        <input value={mailTarget} onChange={(e) => setMailTarget(e.target.value)} placeholder="@user:server" />
                    </label>
                    <label>
                        Message
                        <input value={mailText} onChange={(e) => setMailText(e.target.value)} maxLength={140} />
                    </label>
                    <button type="submit" className="pso-gm-list-item">
                        <span>Send</span>
                    </button>
                </form>
            );
        case "team_list":
            return (
                <>
                    <div className="pso-gm-list">
                        {props.partyMembers.length ? (
                            props.partyMembers.map((m) => (
                                <div key={m.userId} className="pso-gm-list-item">
                                    <span>
                                        {m.speaking ? "♪ " : ""}
                                        {m.displayName}
                                        {m.local ? " (you)" : ""}
                                    </span>
                                    <span className="pso-gm-list-meta">
                                        {m.muted ? "muted · " : ""}Lv {m.level}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="pso-gm-text">No other members here.</div>
                        )}
                    </div>
                    <div className="pso-gm-toggles">
                        <button type="button" className="pso-gm-list-item" onClick={props.onToggleVoiceCall}>
                            <span>{props.isVoiceActive ? "Leave voice" : "Join voice"}</span>
                        </button>
                        <button type="button" className="pso-gm-list-item" onClick={props.onToggleMicMute}>
                            <span>{props.isMicMuted ? "Unmute mic" : "Mute mic"}</span>
                        </button>
                        <button type="button" className="pso-gm-list-item" onClick={props.onToggleDeafen}>
                            <span>{props.isDeafened ? "Undeafen" : "Deafen"}</span>
                        </button>
                    </div>
                </>
            );
        case "sound_bgm":
            return (
                <div className="pso-gm-list">
                    {BGM_TRACKS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={classNames("pso-gm-list-item", { "pso-gm-list-item--on": props.currentBgmTrack === t.id })}
                            onClick={() => {
                                props.onSelectBgmTrack(t.id);
                                props.onPlayUiSound("confirm");
                            }}
                        >
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>
            );
        case "display":
            return (
                <div className="pso-gm-list">
                    <button type="button" className="pso-gm-list-item" onClick={props.onToggleCompactChat}>
                        <span>Compact chat</span>
                        <span className="pso-gm-list-meta">{props.isCompactChat ? "ON" : "OFF"}</span>
                    </button>
                    <button type="button" className="pso-gm-list-item" onClick={props.onToggleClickThroughGlass}>
                        <span>Click-through glass</span>
                        <span className="pso-gm-list-meta">{props.isClickThroughGlass ? "ON" : "OFF"}</span>
                    </button>
                    <button type="button" className="pso-gm-list-item" onClick={props.onToggleStreamOverlay}>
                        <span>Stream overlay</span>
                        <span className="pso-gm-list-meta">{props.isStreamOverlay ? "ON" : "OFF"}</span>
                    </button>
                    <button type="button" className="pso-gm-list-item" onClick={props.onToggleFunctionKeyBar}>
                        <span>Function key bar</span>
                        <span className="pso-gm-list-meta">{props.showFunctionKeyBar ? "ON" : "OFF"}</span>
                    </button>
                </div>
            );
    }
};

const FALLBACK_FKEY_LABELS = [
    "Help",
    "Item Pack",
    "Technique",
    "Mag",
    "Guild Card",
    "Simple Mail",
    "Symbol Chat",
    "Team",
    "Chat Log",
    "Chat",
    "Fullscreen",
    "Main Menu",
];

/** PSOBB-style F1-F12 strip along the bottom of the window. */
export const PsoFunctionKeyBar: React.FC<{
    visible: boolean;
    onPressKey: (index: number) => void;
}> = ({ visible, onPressKey }) => {
    const [labels, setLabels] = useState<string[]>(FALLBACK_FKEY_LABELS);
    useEffect(() => {
        let cancelled = false;
        void loadCompiledGamePack().then((pack) => {
            const spec = pack.uiMenuSpec;
            if (!cancelled && spec?.uiSpecVersion === 2 && spec.functionKeyLabels?.length === 12) {
                setLabels(spec.functionKeyLabels.map((l, i) => l || FALLBACK_FKEY_LABELS[i]));
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (!visible) return null;
    return (
        <div className="pso-fkey-strip pso-interactive" data-testid="pso-fkey-strip">
            {labels.map((label, index) => (
                <button key={index} type="button" className="pso-fkey-chip" onClick={() => onPressKey(index)}>
                    <span className="pso-fkey-badge">F{index + 1}</span>
                    <span>{label}</span>
                </button>
            ))}
        </div>
    );
};
