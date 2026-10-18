/*
Copyright 2026 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import React, { useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";

import {
    FALLBACK_PROCEDURAL_GAME_PACK,
    loadCompiledGamePack,
    loadPsoUiXvmSheet,
    type PsoCompiledGamePack,
    type PsoDecodedXvrTexture,
} from "./PsoGamePackLoader";
import type {
    PsoBgmTrackId,
    PsoCityEventLayoutId,
    PsoClassModelId,
    PsoGuildRoomEntry,
    PsoLobbyStageId,
    PsoWeaponModelId,
} from "./PsoLobby3dLayer";

export type PsoMainMenuTabId =
    | "item_pack"
    | "technique"
    | "mag"
    | "status"
    | "quest"
    | "guild_card"
    | "chat"
    | "team"
    | "option"
    | "quit";

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

export interface PsoFullGameMenuProps {
    isOpen: boolean;
    activeTab: PsoMainMenuTabId;
    showFunctionKeyBar: boolean;
    onToggleOpen: (nextOpen?: boolean) => void;
    onSelectTab: (tab: PsoMainMenuTabId) => void;
    onToggleFunctionKeyBar: () => void;

    // Live Hunter & Matrix Profile
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

    // Live 3D Lobby & Equipment Bridge
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

    // Matrix Rooms, Guild Cards, Voice & Chat Actions
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
    onPlayUiSound: (kind: "cursor" | "confirm" | "cancel" | "heal" | "tech") => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const WEAPON_ARSENAL: Array<{
    id: PsoWeaponModelId;
    name: string;
    stars: string;
    atpBonus: number;
    ataBonus: number;
    desc: string;
}> = [
    {
        id: "photon_saber",
        name: "DB'S SABER +35",
        stars: "★★★★★★★★★",
        atpBonus: 260,
        ataBonus: 42,
        desc: "Standard-issue Pioneer 2 military photon blade replicated for high-ranking Hunters.",
    },
    {
        id: "red_sword",
        name: "RED SWORD +52",
        stars: "★★★★★★★★★★",
        atpBonus: 612,
        ataBonus: 38,
        desc: "A crimson greatsword forged by Heathcliff Flowen. Bears the inscription 'Rico'.",
    },
    {
        id: "dark_flow",
        name: "DARK FLOW",
        stars: "★★★★★★★★★★★★",
        atpBonus: 900,
        ataBonus: 50,
        desc: "An abyssal greatsword fused with parasitic gene 'Flow'. Unleashes devastating photon waves.",
    },
    {
        id: "kingdom_key",
        name: "KINGDOM KEY [KH]",
        stars: "★★★★★★★★★★★",
        atpBonus: 540,
        ataBonus: 55,
        desc: "Keyblade of the Realm of Light with authentic metallic key-teeth and Mickey keychain token.",
    },
    {
        id: "oathkeeper",
        name: "OATHKEEPER [KH]",
        stars: "★★★★★★★★★★★★",
        atpBonus: 680,
        ataBonus: 62,
        desc: "Iridescent Keyblade born of a promise. Boosts Technique MST and Shifta/Deband resonance.",
    },
];

const STAGE_OPTIONS: Array<{ id: PsoLobbyStageId; name: string; areaCode: string; desc: string }> = [
    {
        id: "bb_city00",
        name: "PIONEER 2 CITY & PRINCIPAL",
        areaCode: "map_city00_00n.rel",
        desc: "Full Pioneer 2 Concourse, Hunter's Guild, Medical Center, Check Room, Shopping Plaza & Principal Tyrell's Office.",
    },
    {
        id: "bb_lobby_01",
        name: "VISUAL LOBBY 01",
        areaCode: "map_lobby_01n.rel",
        desc: "PSOBB Ship Block Visual Lobby with photon chairs and central warp dais.",
    },
    {
        id: "bb_labo00",
        name: "EPISODE II LAB (NATASHA)",
        areaCode: "map_labo00_00n.rel",
        desc: "Pioneer 2 VR Temple & Labo research command center.",
    },
    {
        id: "bb_forest01",
        name: "RAGOL AREA 1 // FOREST 1",
        areaCode: "map_forest01n.rel",
        desc: "Central Dome perimeter forest on surface of Ragol.",
    },
    {
        id: "bb_cave01",
        name: "RAGOL AREA 2 // CAVE 1",
        areaCode: "map_cave01_00n.rel",
        desc: "Volcanic subterranean caverns beneath the Central Dome.",
    },
    {
        id: "bb_machine01",
        name: "RAGOL AREA 3 // MINE 1",
        areaCode: "map_machine01_00n.rel",
        desc: "Automated underground Pioneer 1 mining complex.",
    },
    {
        id: "bb_ruins01",
        name: "RAGOL AREA 4 // RUINS 1",
        areaCode: "map_ruins01_00n.rel",
        desc: "Ancient sealed spacecraft beneath the Ragol Mines.",
    },
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

export const PsoFullGameMenu: React.FC<PsoFullGameMenuProps> = ({
    isOpen,
    activeTab,
    showFunctionKeyBar,
    onToggleOpen,
    onSelectTab,
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
    rareDrops,
    pingMs,
    shipName,
    isLobby3dOpen,
    currentStageId,
    currentClassId,
    currentWeaponId,
    currentBgmTrack,
    currentNpcLayout,
    onOpenOrCloseLobby3d,
    onSelectStage,
    onSelectClass,
    onSelectWeapon,
    onSelectBgmTrack,
    onSelectNpcLayout,
    onCastTechnique,
    onUseConsumerItem,
    guildRooms,
    partyMembers,
    isVoiceActive,
    isMicMuted,
    isDeafened,
    isCompactChat,
    isClickThroughGlass,
    isStreamOverlay,
    onSelectGuildRoom,
    onSendSimpleMail,
    onOpenSymbolChatMaker,
    onOpenHudTuner,
    onToggleVoiceCall,
    onToggleMicMute,
    onToggleDeafen,
    onToggleCompactChat,
    onToggleClickThroughGlass,
    onToggleStreamOverlay,
    onPlayUiSound,
    onMouseEnter,
    onMouseLeave,
}) => {
    const [gamePack, setGamePack] = useState<PsoCompiledGamePack>(FALLBACK_PROCEDURAL_GAME_PACK);
    const [uiSprites, setUiSprites] = useState<{
        cursors: PsoDecodedXvrTexture[];
        unitIcons: PsoDecodedXvrTexture[];
        hudGauges: PsoDecodedXvrTexture[];
        headerBanners: PsoDecodedXvrTexture[];
        consoleChrome: PsoDecodedXvrTexture[];
    }>({
        cursors: [],
        unitIcons: [],
        hudGauges: [],
        headerBanners: [],
        consoleChrome: [],
    });

    const [activeSubItemIdx, setActiveSubItemIdx] = useState<number>(0);
    const [statusBannerMsg, setStatusBannerMsg] = useState<string>("");

    // Interactive MAG state persisted in localStorage
    const [magStats, setMagStats] = useState<{
        name: string;
        level: number;
        synchro: number;
        iq: number;
        def: number;
        pow: number;
        dex: number;
        mind: number;
    }>(() => {
        try {
            const raw = localStorage.getItem("mx_pso_mag_stats_v1");
            if (raw) return JSON.parse(raw);
        } catch {
            // ignore
        }
        return {
            name: "SATO [CYAN]",
            level: 200,
            synchro: 120,
            iq: 200,
            def: 15,
            pow: 85,
            dex: 50,
            mind: 50,
        };
    });

    // Guild Card personal comment & Simple Mail draft
    const [guildComment, setGuildComment] = useState<string>(() => {
        try {
            return (
                localStorage.getItem("mx_pso_guild_card_comment_v1") ||
                "Pioneer 2 Matrix Hunter // Ready for Ragol & Voice Comms!"
            );
        } catch {
            return "Pioneer 2 Matrix Hunter // Ready for Ragol & Voice Comms!";
        }
    });
    const [mailRecipient, setMailRecipient] = useState<string>("Current Ship Block");
    const [mailDraft, setMailDraft] = useState<string>("");

    // Load compiled `game-pack.json` and decode the extracted PSOBB `.xvm` UI texture sheets
    useEffect(() => {
        let cancelled = false;
        void loadCompiledGamePack().then(async (pack) => {
            if (cancelled) return;
            setGamePack(pack);
            const sheets = pack.uiMenuSpec?.uiXvmSheets;
            if (!sheets) return;

            const [cursors, unitIcons, hudGauges, headerBanners, consoleChrome] = await Promise.all([
                sheets.cursorsAndSectionIds ? loadPsoUiXvmSheet(sheets.cursorsAndSectionIds) : Promise.resolve([]),
                sheets.unitIcons ? loadPsoUiXvmSheet(sheets.unitIcons) : Promise.resolve([]),
                sheets.hudGauges ? loadPsoUiXvmSheet(sheets.hudGauges) : Promise.resolve([]),
                sheets.headerBannersEng ? loadPsoUiXvmSheet(sheets.headerBannersEng) : Promise.resolve([]),
                sheets.consoleChrome ? loadPsoUiXvmSheet(sheets.consoleChrome) : Promise.resolve([]),
            ]);

            if (!cancelled) {
                setUiSprites({
                    cursors,
                    unitIcons,
                    hudGauges,
                    headerBanners,
                    consoleChrome,
                });
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const menuSpec = gamePack.uiMenuSpec;
    const fKeyDefs = useMemo(
        () =>
            menuSpec?.functionKeyLabels ?? [
                { key: "F1", rawLabel: "F1: Function Key ON/OFF Display", actionId: "toggle_fkeys" },
                { key: "F2", rawLabel: "F2 : Equip", actionId: "item_pack" },
                { key: "F3", rawLabel: "F3 : Technique", actionId: "technique" },
                { key: "F4", rawLabel: "F4 : Mag", actionId: "mag" },
                { key: "F5", rawLabel: "F5 : Check the Guild Card", actionId: "guild_card" },
                { key: "F6", rawLabel: "F6 : Simple Mail", actionId: "simple_mail" },
                { key: "F7", rawLabel: "F7 : Symbol Chat", actionId: "symbol_chat" },
                { key: "F8", rawLabel: "F8 : Team Member List", actionId: "team_list" },
                { key: "F9", rawLabel: "F9 : Team Log", actionId: "team_log" },
                { key: "F10", rawLabel: "F10 : Status & Area Map", actionId: "status_map" },
                { key: "F11", rawLabel: "F11 : Quick Chat", actionId: "chat_menu" },
                { key: "F12", rawLabel: "F12 : Main Menu", actionId: "main_menu" },
            ],
        [menuSpec],
    );

    const tabs = useMemo(
        () =>
            menuSpec?.mainMenuTabs ?? [
                {
                    id: "item_pack",
                    label: "Item Pack",
                    shortcut: "F2",
                    helpText: "View, equip, and use items in your Item Pack.",
                    subItems: [
                        { id: "equip_weapons", label: "Equip / Weapons", helpText: "Equip weapons and gear." },
                        { id: "use_tools", label: "Use / Recovery Items", helpText: "Use Monomates and Fluids." },
                        { id: "rare_drops", label: "Rare Drop Tekker Box", helpText: "Inspect rare red boxes." },
                    ],
                },
                {
                    id: "technique",
                    label: "Technique",
                    shortcut: "F3",
                    helpText: "Cast learned PSOBB Techniques in the 3D Lobby & Matrix Room.",
                    subItems: [
                        { id: "tech_attack", label: "Attack Techniques", helpText: "Foie, Barta, Zonde, Grants, Megid." },
                        { id: "tech_support", label: "Support & Recovery", helpText: "Resta, Anti, Shifta, Deband, Ryuker." },
                    ],
                },
                {
                    id: "mag",
                    label: "Mag",
                    shortcut: "F4",
                    helpText: "Inspect your MAG, Synchro, IQ, and feed items.",
                    subItems: [
                        { id: "mag_feed", label: "Give Items", helpText: "Feed recovery items to raise MAG stats." },
                        { id: "mag_pb", label: "Photon Blast", helpText: "Inspect Photon Blasts." },
                    ],
                },
                {
                    id: "status",
                    label: "Status",
                    shortcut: "F10",
                    helpText: "View Hunter parameters, Section ID, resists, and Matrix Comms telemetry.",
                    subItems: [
                        { id: "status_hunter", label: "Hunter Parameters", helpText: "ATP, DFP, MST, ATA, EVP, LCK." },
                        { id: "status_comms", label: "Matrix Comms Telemetry", helpText: "Homeserver ping & voice link." },
                    ],
                },
                {
                    id: "quest",
                    label: "Quest",
                    shortcut: "MAP",
                    helpText: "Warp between Ragol areas, Pioneer 2 counters, and Seasonal NPC events.",
                    subItems: [
                        { id: "warp_areas", label: "Ragol & Pioneer 2 Area Warp", helpText: "Teleport between stages." },
                        { id: "npc_layouts", label: "Seasonal NPC Layouts", helpText: "Switch Pioneer 2 NPC events." },
                    ],
                },
                {
                    id: "guild_card",
                    label: "Guild Card",
                    shortcut: "F5",
                    helpText: "Manage Hunter Guild Cards, Matrix Room Contacts, and Simple Mail.",
                    subItems: [
                        { id: "card_list", label: "Search / Card List", helpText: "Browse Matrix rooms & Meet User." },
                        { id: "my_card", label: "MY Card", helpText: "Edit your personal Hunter Guild Card." },
                        { id: "simple_mail", label: "Simple Mail", helpText: "Transmit a Matrix Simple Mail." },
                    ],
                },
                {
                    id: "chat",
                    label: "Chat",
                    shortcut: "F7",
                    helpText: "Symbol Chat, Word Select, Action Palette, and Function Key Bar.",
                    subItems: [
                        { id: "symbol_chat", label: "Symbol Chat", helpText: "Open Symbol Chat Maker." },
                        { id: "action_palette", label: "Customize Action Palette", helpText: "Configure 1-0 Hex Bar." },
                        { id: "fkey_bar", label: "F1: Function Key Display", helpText: "Toggle top F1-F12 bar." },
                    ],
                },
                {
                    id: "team",
                    label: "Team",
                    shortcut: "F8",
                    helpText: "Matrix Room Party, LiveKit Voice Comms, and Team Log.",
                    subItems: [
                        { id: "team_list", label: "Team Member List", helpText: "Party Voice & Room Roster." },
                        { id: "team_log", label: "Team Log", helpText: "Toggle Compact PSO Chat Log." },
                    ],
                },
                {
                    id: "option",
                    label: "Option",
                    shortcut: "OPT",
                    helpText: "Configure Sound, BGM Disk, 3D Class Model, and HUD Glass Tuner.",
                    subItems: [
                        { id: "opt_sound", label: "Sound & BGM Disk", helpText: "Select `.ogg` soundtrack." },
                        { id: "opt_graphics", label: "Hunter Class & 3D Lobby", helpText: "Select playable `.nj` class." },
                        { id: "opt_hud", label: "Network Option & HUD Glass", helpText: "Click-Thru, Stream & Tuner." },
                    ],
                },
                {
                    id: "quit",
                    label: "Quit Game",
                    shortcut: "ESC",
                    helpText: "Close Main Menu or Exit 3D Visual Lobby.",
                    subItems: [
                        { id: "quit_menu", label: "Close Main Menu [F12]", helpText: "Return to active view." },
                        { id: "quit_lobby", label: "Exit 3D Visual Lobby", helpText: "Close 3D Lobby." },
                    ],
                },
            ],
        [menuSpec],
    );

    const activeTabObj = useMemo(
        () => tabs.find((t) => t.id === activeTab) ?? tabs[0],
        [tabs, activeTab],
    );

    const activeSubItem = activeTabObj?.subItems[activeSubItemIdx] ?? activeTabObj?.subItems[0];

    const feedMag = useCallback(
        (item: "Monomate" | "Dimate" | "Trimate" | "Monofluid" | "Difluid" | "Star Atomizer") => {
            onPlayUiSound("heal");
            setMagStats((prev) => {
                const next = { ...prev };
                if (item === "Monomate") next.pow = Math.min(150, next.pow + 2);
                else if (item === "Dimate") {
                    next.pow = Math.min(150, next.pow + 3);
                    next.def = Math.min(150, next.def + 1);
                } else if (item === "Trimate") {
                    next.pow = Math.min(150, next.pow + 2);
                    next.dex = Math.min(150, next.dex + 2);
                } else if (item === "Monofluid") next.mind = Math.min(150, next.mind + 2);
                else if (item === "Difluid") {
                    next.mind = Math.min(150, next.mind + 3);
                    next.iq = Math.min(200, next.iq + 3);
                } else if (item === "Star Atomizer") {
                    next.synchro = Math.min(120, next.synchro + 8);
                    next.iq = Math.min(200, next.iq + 5);
                }
                next.level = Math.min(200, next.def + next.pow + next.dex + next.mind);
                try {
                    localStorage.setItem("mx_pso_mag_stats_v1", JSON.stringify(next));
                } catch {
                    // ignore
                }
                return next;
            });
            setStatusBannerMsg(`Fed ${item} to ${magStats.name}! SYNCHRO & IQ increased.`);
        },
        [magStats.name, onPlayUiSound],
    );

    const handleFKeyClick = useCallback(
        (actionId: string) => {
            onPlayUiSound("confirm");
            if (actionId === "toggle_fkeys") {
                onToggleFunctionKeyBar();
                return;
            }
            if (actionId === "main_menu") {
                onToggleOpen();
                return;
            }
            const mapToTab: Record<string, { tab: PsoMainMenuTabId; subIdx: number }> = {
                item_pack: { tab: "item_pack", subIdx: 0 },
                technique: { tab: "technique", subIdx: 0 },
                mag: { tab: "mag", subIdx: 0 },
                guild_card: { tab: "guild_card", subIdx: 0 },
                simple_mail: { tab: "guild_card", subIdx: 2 },
                symbol_chat: { tab: "chat", subIdx: 0 },
                team_list: { tab: "team", subIdx: 0 },
                team_log: { tab: "team", subIdx: 1 },
                status_map: { tab: "status", subIdx: 0 },
                chat_menu: { tab: "chat", subIdx: 1 },
            };
            const target = mapToTab[actionId];
            if (target) {
                onSelectTab(target.tab);
                setActiveSubItemIdx(target.subIdx);
                if (!isOpen) onToggleOpen(true);
            }
        },
        [isOpen, onPlayUiSound, onSelectTab, onToggleFunctionKeyBar, onToggleOpen],
    );

    // Extracted cursor sprite & Section ID badge from `f064_mucarsol.xvm` if present
    const extractedCursorUrl = uiSprites.cursors[0]?.dataUrl ?? null;
    const extractedUnitIconUrl = uiSprites.unitIcons[0]?.dataUrl ?? null;
    const extractedHudGaugeUrl = uiSprites.hudGauges[0]?.dataUrl ?? null;

    const equippedWeaponSpec = useMemo(
        () => WEAPON_ARSENAL.find((w) => w.id === currentWeaponId) ?? WEAPON_ARSENAL[0],
        [currentWeaponId],
    );

    const statLabels = menuSpec?.statLabels ?? {
        atp: "ATP",
        dfp: "DFP",
        mst: "MST",
        ata: "ATA",
        evp: "EVP",
        lck: "LCK",
        level: "LEVEL",
        exp: "EXP",
        synchro: "Synchro",
        iq: "IQ",
        efr: "EFR",
        eic: "EIC",
        eth: "ETH",
        edk: "EDK",
        elt: "ELT",
        nextLevel: "NEXT LEVEL",
        meseta: "Meseta",
    };

    const computedAtp = 680 + level * 6 + equippedWeaponSpec.atpBonus + magStats.pow * 2;
    const computedDfp = 310 + level * 4 + magStats.def;
    const computedMst = 520 + level * 5 + magStats.mind * 2;
    const computedAta = 145 + Math.floor(level * 0.8) + equippedWeaponSpec.ataBonus + Math.floor(magStats.dex * 0.5);
    const computedEvp = 440 + level * 3;
    const computedLck = 38 + (level % 62);

    return (
        <>
            {/* 1. AUTHENTIC PSOBB TOP FUNCTION KEY BAR (`F1` - `F12` from `unitxt_e.prs` Cat[11][353..364]) */}
            {showFunctionKeyBar && (
                <div
                    className="pso-fkey-strip pso-interactive"
                    data-testid="pso-fkey-strip"
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {fKeyDefs.map((fk) => {
                        const shortTitle = fk.rawLabel
                            .replace(/^F\d+\s*:\s*/i, "")
                            .replace(/Function Key ON\/OFF Display/i, "F-Key Bar")
                            .replace(/Check the Guild Card/i, "Guild Card")
                            .replace(/Team Member List/i, "Team List");
                        const isCurrent =
                            isOpen &&
                            ((fk.actionId === "item_pack" && activeTab === "item_pack") ||
                                (fk.actionId === "technique" && activeTab === "technique") ||
                                (fk.actionId === "mag" && activeTab === "mag") ||
                                (fk.actionId === "guild_card" && activeTab === "guild_card") ||
                                (fk.actionId === "simple_mail" && activeTab === "guild_card" && activeSubItemIdx === 2) ||
                                (fk.actionId === "symbol_chat" && activeTab === "chat") ||
                                (fk.actionId === "team_list" && activeTab === "team") ||
                                (fk.actionId === "status_map" && activeTab === "status") ||
                                (fk.actionId === "main_menu" && isOpen));
                        return (
                            <button
                                key={fk.key}
                                type="button"
                                className={classNames("pso-fkey-chip", {
                                    "pso-fkey-chip--active": isCurrent,
                                })}
                                onClick={() => handleFKeyClick(fk.actionId)}
                                title={fk.rawLabel}
                                data-testid={`pso-fkey-${fk.key.toLowerCase()}`}
                            >
                                <span className="pso-fkey-badge">{fk.key}</span>
                                <span className="pso-fkey-label">{shortTitle}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 2. CASCADING PSOBB FULL GAME MENU (`F12` Main Menu + Sub-Menu + Action Inspector) */}
            {isOpen && (
                <div
                    className="pso-gamemenu-backdrop pso-interactive"
                    data-testid="pso-full-game-menu"
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {/* Top PSOBB Header Banner (`f512_midashi_eng.xvm` + `f256_hyouji.xvm` chrome) */}
                    <div className="pso-gamemenu-top-banner">
                        <div className="pso-gamemenu-top-left">
                            {extractedCursorUrl && (
                                <img
                                    src={extractedCursorUrl}
                                    alt=""
                                    className="pso-gamemenu-xvm-emblem"
                                />
                            )}
                            <div>
                                <div className="pso-gamemenu-ship-tag">
                                    PIONEER 2 MAIN MENU // {shipName}
                                </div>
                                <div className="pso-gamemenu-hunter-tag">
                                    <strong>{displayName}</strong> &middot; {classNameLabel} &middot;{" "}
                                    <span style={{ color: sectionIdColor }}>{sectionIdName}</span> &middot;{" "}
                                    {statLabels.level} {level} &middot;{" "}
                                    <span className="pso-gamemenu-meseta">
                                        {meseta.toLocaleString()} {statLabels.meseta}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pso-gamemenu-top-right">
                            <button
                                type="button"
                                className={classNames("pso-gamemenu-quick-pill", {
                                    "pso-gamemenu-quick-pill--active": isLobby3dOpen,
                                })}
                                onClick={() => {
                                    onPlayUiSound("confirm");
                                    onOpenOrCloseLobby3d(!isLobby3dOpen);
                                }}
                            >
                                {isLobby3dOpen ? "🌐 3D Lobby: ACTIVE" : "🌐 Launch 3D Lobby"}
                            </button>
                            <button
                                type="button"
                                className="pso-gamemenu-close-btn"
                                onClick={() => {
                                    onPlayUiSound("cancel");
                                    onToggleOpen(false);
                                }}
                                title="Close PSOBB Main Menu (F12 or Esc)"
                                data-testid="pso-full-game-menu-close"
                            >
                                ✕ ESC / F12
                            </button>
                        </div>
                    </div>

                    {/* Three-Column Cascading PSOBB Windows */}
                    <div className="pso-gamemenu-cascade">
                        {/* COLUMN 1: LEFT MAIN MENU (`F12` Top-Level Categories) */}
                        <div className="pso-gamemenu-col pso-gamemenu-col--primary" role="menu">
                            <div className="pso-gamemenu-win-header">
                                <span>MAIN MENU</span>
                                <span className="pso-gamemenu-win-sub">F12</span>
                            </div>
                            <div className="pso-gamemenu-list">
                                {tabs.map((tab) => {
                                    const selected = tab.id === activeTab;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            className={classNames("pso-gamemenu-item", {
                                                "pso-gamemenu-item--active": selected,
                                            })}
                                            onMouseEnter={() => {
                                                if (!selected) onPlayUiSound("cursor");
                                            }}
                                            onClick={() => {
                                                onPlayUiSound("confirm");
                                                onSelectTab(tab.id as PsoMainMenuTabId);
                                                setActiveSubItemIdx(0);
                                            }}
                                            data-testid={`pso-gamemenu-tab-${tab.id}`}
                                        >
                                            <span className="pso-gamemenu-cursor">
                                                {selected ? "▶" : " "}
                                            </span>
                                            <span className="pso-gamemenu-item-label">{tab.label}</span>
                                            <span className="pso-gamemenu-item-shortcut">{tab.shortcut}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {extractedHudGaugeUrl && (
                                <div className="pso-gamemenu-xvm-strip" title="Extracted PSOBB f256_hyouji.xvm">
                                    <img src={extractedHudGaugeUrl} alt="PSOBB HUD XVM" />
                                    <span>XVM UI LOADED ({uiSprites.hudGauges.length + uiSprites.cursors.length} TEX)</span>
                                </div>
                            )}
                        </div>

                        {/* COLUMN 2: MIDDLE SUB-MENU WINDOW */}
                        <div className="pso-gamemenu-col pso-gamemenu-col--secondary">
                            <div className="pso-gamemenu-win-header">
                                <span>{activeTabObj?.label.toUpperCase()}</span>
                                <span className="pso-gamemenu-win-sub">{activeTabObj?.shortcut}</span>
                            </div>
                            <div className="pso-gamemenu-list">
                                {(activeTabObj?.subItems ?? []).map((sub, idx) => {
                                    const selected = idx === activeSubItemIdx;
                                    return (
                                        <button
                                            key={sub.id}
                                            type="button"
                                            className={classNames("pso-gamemenu-item", {
                                                "pso-gamemenu-item--active": selected,
                                            })}
                                            onClick={() => {
                                                onPlayUiSound("confirm");
                                                setActiveSubItemIdx(idx);
                                            }}
                                            data-testid={`pso-gamemenu-sub-${sub.id}`}
                                        >
                                            <span className="pso-gamemenu-cursor">
                                                {selected ? "◆" : " "}
                                            </span>
                                            <span className="pso-gamemenu-item-label">{sub.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Live Mini Vitals Box inside Column 2 */}
                            <div className="pso-gamemenu-mini-vitals">
                                <div className="pso-gamemenu-vital-row">
                                    <span>HP</span>
                                    <strong>
                                        {hp} / {maxHp}
                                    </strong>
                                </div>
                                <div className="pso-gamemenu-vital-bar">
                                    <div
                                        className="pso-gamemenu-vital-fill pso-gamemenu-vital-fill--hp"
                                        style={{ width: `${Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100))}%` }}
                                    />
                                </div>
                                <div className="pso-gamemenu-vital-row">
                                    <span>TP</span>
                                    <strong>
                                        {tp} / {maxTp}
                                    </strong>
                                </div>
                                <div className="pso-gamemenu-vital-bar">
                                    <div
                                        className="pso-gamemenu-vital-fill pso-gamemenu-vital-fill--tp"
                                        style={{ width: `${Math.min(100, Math.round((tp / Math.max(1, maxTp)) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* COLUMN 3: RIGHT DETAIL & LIVE EXECUTION WINDOW */}
                        <div className="pso-gamemenu-col pso-gamemenu-col--inspector">
                            <div className="pso-gamemenu-win-header">
                                <span>{activeSubItem?.label.toUpperCase() || "PIONEER 2 TERMINAL"}</span>
                                {extractedUnitIconUrl && (
                                    <img
                                        src={extractedUnitIconUrl}
                                        alt=""
                                        className="pso-gamemenu-uniticon-preview"
                                    />
                                )}
                            </div>

                            <div className="pso-gamemenu-inspector-body">
                                {/* TAB 1: ITEM PACK (`F2`) */}
                                {activeTab === "item_pack" && activeSubItemIdx === 0 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            SELECT 3D HUNTER WEAPON (LIVE EQUIP IN LOBBY)
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {WEAPON_ARSENAL.map((w) => {
                                                const isEq = w.id === currentWeaponId;
                                                return (
                                                    <button
                                                        key={w.id}
                                                        type="button"
                                                        className={classNames("pso-gamemenu-equip-card", {
                                                            "pso-gamemenu-equip-card--active": isEq,
                                                        })}
                                                        onClick={() => {
                                                            onPlayUiSound("confirm");
                                                            onSelectWeapon(w.id);
                                                            setStatusBannerMsg(`Equipped ${w.name} (+${w.atpBonus} ${statLabels.atp})!`);
                                                        }}
                                                    >
                                                        <div className="pso-gamemenu-equip-top">
                                                            <strong>{w.name}</strong>
                                                            <span className="pso-gamemenu-equip-badge">
                                                                {isEq ? "E [EQUIPPED]" : "EQUIP"}
                                                            </span>
                                                        </div>
                                                        <div className="pso-gamemenu-stars">{w.stars}</div>
                                                        <div className="pso-gamemenu-equip-stats">
                                                            +{w.atpBonus} {statLabels.atp} &middot; +{w.ataBonus} {statLabels.ata}
                                                        </div>
                                                        <div className="pso-gamemenu-equip-desc">{w.desc}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "item_pack" && activeSubItemIdx === 1 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            RECOVERY &amp; SUPPORT TOOLS (`unitxt_e.prs` Cat[1])
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {(menuSpec?.coreItems && menuSpec.coreItems.length > 0
                                                ? menuSpec.coreItems.slice(0, 12)
                                                : [
                                                      { id: "m1", name: "Monomate", description: "Restores 30% HP." },
                                                      { id: "m2", name: "Dimate", description: "Restores 60% HP." },
                                                      { id: "m3", name: "Trimate", description: "Restores 100% HP." },
                                                      { id: "f1", name: "Monofluid", description: "Restores 30% TP." },
                                                      { id: "f2", name: "Difluid", description: "Restores 60% TP." },
                                                      { id: "f3", name: "Trifluid", description: "Restores 100% TP." },
                                                      { id: "sa", name: "Star Atomizer", description: "Full party HP restore + aura." },
                                                      { id: "tp", name: "Telepipe", description: "Opens warp pipe to Pioneer 2." },
                                                  ]
                                            ).map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    className="pso-gamemenu-equip-card"
                                                    onClick={() => {
                                                        onPlayUiSound("heal");
                                                        onUseConsumerItem(item.name);
                                                        setStatusBannerMsg(`Used ${item.name}!`);
                                                    }}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>🟢 {item.name}</strong>
                                                        <span className="pso-gamemenu-equip-badge">USE</span>
                                                    </div>
                                                    <div className="pso-gamemenu-equip-desc">{item.description}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "item_pack" && activeSubItemIdx === 2 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            COLLECTED RED BOX RARE DROPS ({rareDrops.length})
                                        </div>
                                        {rareDrops.length === 0 ? (
                                            <div className="pso-gamemenu-empty">
                                                No Red Box Rare Drops collected in this session yet. Defeat targets in the 3D Lobby or receive party drops!
                                            </div>
                                        ) : (
                                            <div className="pso-gamemenu-card-grid">
                                                {rareDrops.map((drop, i) => (
                                                    <div key={`${drop}-${i}`} className="pso-gamemenu-equip-card pso-gamemenu-equip-card--rare">
                                                        <div className="pso-gamemenu-equip-top">
                                                            <strong>🟥 {drop}</strong>
                                                            <span className="pso-gamemenu-equip-badge">SPECIAL WEAPON</span>
                                                        </div>
                                                        <div className="pso-gamemenu-stars">★★★★★★★★★★★</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TAB 2: TECHNIQUE (`F3`) */}
                                {activeTab === "technique" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            LEARNED PSOBB TECHNIQUES (`unitxt_e.prs` Cat[5] &amp; Cat[6])
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {(menuSpec?.techniques && menuSpec.techniques.length > 0
                                                ? menuSpec.techniques.filter((_, idx) =>
                                                      activeSubItemIdx === 0 ? idx < 10 : idx >= 10,
                                                  )
                                                : [
                                                      { id: "t0", name: "Foie", description: "Fireball technique.", tpCost: 5 },
                                                      { id: "t3", name: "Barta", description: "Ice wave technique.", tpCost: 8 },
                                                      { id: "t6", name: "Zonde", description: "Lightning bolt technique.", tpCost: 9 },
                                                      { id: "t9", name: "Grants", description: "Light pillar technique.", tpCost: 25 },
                                                      { id: "t10", name: "Deband", description: "Boosts party DFP.", tpCost: 15 },
                                                      { id: "t12", name: "Shifta", description: "Boosts party ATP.", tpCost: 15 },
                                                      { id: "t14", name: "Resta", description: "Restores party HP.", tpCost: 20 },
                                                      { id: "t17", name: "Ryuker", description: "Opens warp to Pioneer 2.", tpCost: 10 },
                                                  ]
                                            ).map((tech, idx) => (
                                                <button
                                                    key={tech.id}
                                                    type="button"
                                                    className="pso-gamemenu-equip-card"
                                                    onClick={() => {
                                                        onPlayUiSound("tech");
                                                        onCastTechnique(tech.name, tech.tpCost);
                                                        setStatusBannerMsg(
                                                            `Cast ${tech.name} Lv.${20 + (idx % 10)} (-${tech.tpCost} TP)!`,
                                                        );
                                                    }}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>✨ {tech.name} Lv.{20 + (idx % 10)}</strong>
                                                        <span className="pso-gamemenu-equip-badge">
                                                            {tech.tpCost} TP [CAST]
                                                        </span>
                                                    </div>
                                                    <div className="pso-gamemenu-equip-desc">{tech.description}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: MAG (`F4`) */}
                                {activeTab === "mag" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            EQUIPPED 3D ORBITING MAG // {magStats.name} (LV {magStats.level})
                                        </div>
                                        <div className="pso-gamemenu-stat-grid">
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.level}</span>
                                                <strong>{magStats.level}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.synchro}</span>
                                                <strong>{magStats.synchro}%</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.iq}</span>
                                                <strong>{magStats.iq} / 200</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>DEF / POW / DEX / MIND</span>
                                                <strong>
                                                    {magStats.def} / {magStats.pow} / {magStats.dex} / {magStats.mind}
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="pso-gamemenu-subtitle" style={{ marginTop: 12 }}>
                                            FEED ITEM TO MAG (`Give Items`)
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap">
                                            {(
                                                [
                                                    "Monomate",
                                                    "Dimate",
                                                    "Trimate",
                                                    "Monofluid",
                                                    "Difluid",
                                                    "Star Atomizer",
                                                ] as const
                                            ).map((food) => (
                                                <button
                                                    key={food}
                                                    type="button"
                                                    className="pso-gamemenu-action-btn"
                                                    onClick={() => feedMag(food)}
                                                >
                                                    🍼 Feed {food}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: STATUS (`F10`) */}
                                {activeTab === "status" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            HUNTER STATUS &amp; MATRIX TELEMETRY (`unitxt_e.prs` Cat[11][48..69])
                                        </div>
                                        <div className="pso-gamemenu-stat-grid">
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.atp}</span>
                                                <strong>{computedAtp}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.dfp}</span>
                                                <strong>{computedDfp}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.mst}</span>
                                                <strong>{computedMst}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.ata}</span>
                                                <strong>{computedAta}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.evp}</span>
                                                <strong>{computedEvp}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.lck}</span>
                                                <strong>{computedLck}</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.efr} / {statLabels.eic} / {statLabels.eth}</span>
                                                <strong>28 / 32 / 25</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>{statLabels.edk} / {statLabels.elt}</span>
                                                <strong>30 / 35</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>MATRIX HOMESERVER PING</span>
                                                <strong style={{ color: "#6fffa8" }}>{pingMs} ms</strong>
                                            </div>
                                            <div className="pso-gamemenu-stat-box">
                                                <span>MATRIX ID</span>
                                                <strong>{userId}</strong>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 5: QUEST / AREA WARP */}
                                {activeTab === "quest" && activeSubItemIdx === 0 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            RAGOL &amp; PIONEER 2 STAGE TELEPORTER (`data.gsl` `.rel` Maps)
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {STAGE_OPTIONS.map((st) => {
                                                const isCurr = st.id === currentStageId;
                                                return (
                                                    <button
                                                        key={st.id}
                                                        type="button"
                                                        className={classNames("pso-gamemenu-equip-card", {
                                                            "pso-gamemenu-equip-card--active": isCurr,
                                                        })}
                                                        onClick={() => {
                                                            onPlayUiSound("confirm");
                                                            onSelectStage(st.id);
                                                            if (!isLobby3dOpen) onOpenOrCloseLobby3d(true);
                                                            setStatusBannerMsg(`Warping to ${st.name} (${st.areaCode})...`);
                                                        }}
                                                    >
                                                        <div className="pso-gamemenu-equip-top">
                                                            <strong>🟢 {st.name}</strong>
                                                            <span className="pso-gamemenu-equip-badge">
                                                                {isCurr ? "CURRENT AREA" : "WARP"}
                                                            </span>
                                                        </div>
                                                        <div className="pso-gamemenu-equip-stats">{st.areaCode}</div>
                                                        <div className="pso-gamemenu-equip-desc">{st.desc}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "quest" && activeSubItemIdx === 1 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            PIONEER 2 EVENT NPC PLACEMENT (`map_city00_00e*.dat`)
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {(
                                                [
                                                    {
                                                        id: "e" as PsoCityEventLayoutId,
                                                        title: "Online Multi-Mode (map_city00_00e.dat)",
                                                        desc: "21 NPCs including Principal Tyrell, Irene, Momoka, Nurses, Tekker & Shops.",
                                                    },
                                                    {
                                                        id: "e_s" as PsoCityEventLayoutId,
                                                        title: "Online One-Person Mode (map_city00_00e_s.dat)",
                                                        desc: "16 NPCs configured for solo questing.",
                                                    },
                                                    {
                                                        id: "e_d" as PsoCityEventLayoutId,
                                                        title: "Offline Story Default (map_city00_00e_d.dat)",
                                                        desc: "15 NPCs with Guild Officer at the Hunter's Guild Counter.",
                                                    },
                                                    {
                                                        id: "e_c1" as PsoCityEventLayoutId,
                                                        title: "Challenge Mode Layout (map_city00_00e_c1.dat)",
                                                        desc: "16 NPCs with Military Patrol Guard.",
                                                    },
                                                ]
                                            ).map((ly) => (
                                                <button
                                                    key={ly.id}
                                                    type="button"
                                                    className={classNames("pso-gamemenu-equip-card", {
                                                        "pso-gamemenu-equip-card--active": currentNpcLayout === ly.id,
                                                    })}
                                                    onClick={() => {
                                                        onPlayUiSound("confirm");
                                                        onSelectNpcLayout(ly.id);
                                                        setStatusBannerMsg(`Switched Pioneer 2 NPC layout to ${ly.title}!`);
                                                    }}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>{ly.title}</strong>
                                                        <span className="pso-gamemenu-equip-badge">
                                                            {currentNpcLayout === ly.id ? "ACTIVE" : "SELECT"}
                                                        </span>
                                                    </div>
                                                    <div className="pso-gamemenu-equip-desc">{ly.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 6: GUILD CARD (`F5` / `F6` Simple Mail) */}
                                {activeTab === "guild_card" && activeSubItemIdx === 0 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            GUILD CARD LIST // MATRIX SHIP BLOCKS ({guildRooms.length})
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {guildRooms.map((room) => (
                                                <div
                                                    key={room.roomId}
                                                    className={classNames("pso-gamemenu-equip-card", {
                                                        "pso-gamemenu-equip-card--active": room.isCurrent,
                                                    })}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>🪪 {room.name}</strong>
                                                        <span className="pso-gamemenu-equip-badge">
                                                            {room.memberCount} HUNTERS
                                                        </span>
                                                    </div>
                                                    <div className="pso-gamemenu-btn-wrap" style={{ marginTop: 8 }}>
                                                        <button
                                                            type="button"
                                                            className="pso-gamemenu-action-btn"
                                                            onClick={() => {
                                                                onPlayUiSound("confirm");
                                                                onSelectGuildRoom(room.roomId);
                                                                setStatusBannerMsg(
                                                                    `${menuSpec?.guildCardLabels.meetUser ?? "Meet the User"}: Warped to ${room.name}`,
                                                                );
                                                            }}
                                                        >
                                                            🚀 {menuSpec?.guildCardLabels.meetUser ?? "Meet the User"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pso-gamemenu-action-btn"
                                                            onClick={() => {
                                                                onPlayUiSound("cursor");
                                                                setMailRecipient(room.name);
                                                                setActiveSubItemIdx(2);
                                                            }}
                                                        >
                                                            ✉️ {menuSpec?.guildCardLabels.sendMail ?? "Send Mail"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "guild_card" && activeSubItemIdx === 1 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            {menuSpec?.guildCardLabels.myCard ?? "MY Card"} // {displayName}
                                        </div>
                                        <div className="pso-gamemenu-mycard">
                                            <div>
                                                <strong>GUILD CARD NO:</strong> {userId}
                                            </div>
                                            <div>
                                                <strong>CLASS / SECTION ID:</strong> {classNameLabel} &middot;{" "}
                                                <span style={{ color: sectionIdColor }}>{sectionIdName}</span>
                                            </div>
                                            <label className="pso-gamemenu-field-label">
                                                {menuSpec?.guildCardLabels.editComment ?? "Comment"}:
                                                <input
                                                    type="text"
                                                    className="pso-gamemenu-input"
                                                    value={guildComment}
                                                    onChange={(e) => {
                                                        setGuildComment(e.target.value);
                                                        try {
                                                            localStorage.setItem(
                                                                "mx_pso_guild_card_comment_v1",
                                                                e.target.value,
                                                            );
                                                        } catch {
                                                            // ignore
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "guild_card" && activeSubItemIdx === 2 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            SIMPLE MAIL TRANSMITTER (`F6 : Simple Mail`)
                                        </div>
                                        <div className="pso-gamemenu-mycard">
                                            <div>
                                                <strong>TO:</strong> {mailRecipient}
                                            </div>
                                            <input
                                                type="text"
                                                className="pso-gamemenu-input"
                                                placeholder="Enter Simple Mail message to transmit to active Matrix Room..."
                                                value={mailDraft}
                                                onChange={(e) => setMailDraft(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    if (!mailDraft.trim()) return;
                                                    onPlayUiSound("confirm");
                                                    onSendSimpleMail(mailRecipient, mailDraft.trim());
                                                    setStatusBannerMsg(`Simple Mail transmitted to ${mailRecipient}!`);
                                                    setMailDraft("");
                                                }}
                                            >
                                                📨 Transmit Simple Mail
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 7: CHAT (`F7`) */}
                                {activeTab === "chat" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            SYMBOL CHAT, ACTION PALETTE &amp; FUNCTION KEY BAR
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap">
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleOpen(false);
                                                    onOpenSymbolChatMaker();
                                                }}
                                            >
                                                🎨 Open Symbol Chat Maker (`F7`)
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleOpen(false);
                                                    onOpenHudTuner();
                                                }}
                                            >
                                                ⚙️ Customize 1-0 Hex Action Palette
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleFunctionKeyBar();
                                                }}
                                            >
                                                ⌨️ Toggle F1–F12 Function Key Bar ({showFunctionKeyBar ? "ON" : "OFF"})
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 8: TEAM (`F8` / `F9`) */}
                                {activeTab === "team" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            TEAM MEMBER LIST &amp; LIVEKIT VOICE COMMS (`F8` / `F9`)
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap" style={{ marginBottom: 12 }}>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleVoiceCall();
                                                }}
                                            >
                                                {isVoiceActive ? "📴 Disconnect Voice Comms" : "🎙️ Connect Voice Comms"}
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("cursor");
                                                    onToggleMicMute();
                                                }}
                                            >
                                                {isMicMuted ? "🔇 Mic: MUTED" : "🎙️ Mic: LIVE"}
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("cursor");
                                                    onToggleDeafen();
                                                }}
                                            >
                                                {isDeafened ? "🔕 Audio: DEAFENED" : "🔊 Audio: ACTIVE"}
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleCompactChat();
                                                }}
                                            >
                                                ▤ Toggle Team Log / Compact Chat (`F9`)
                                            </button>
                                        </div>

                                        <div className="pso-gamemenu-card-grid">
                                            {partyMembers.map((m) => (
                                                <div
                                                    key={m.userId}
                                                    className={classNames("pso-gamemenu-equip-card", {
                                                        "pso-gamemenu-equip-card--active": m.speaking,
                                                    })}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>
                                                            {m.speaking ? "🔊 " : m.muted ? "🔇 " : "🟢 "}
                                                            {m.displayName} {m.local ? "(YOU)" : ""}
                                                        </strong>
                                                        <span className="pso-gamemenu-equip-badge">LV {m.level}</span>
                                                    </div>
                                                    <div className="pso-gamemenu-equip-stats">
                                                        HP {m.hpPct}% &middot; TP {m.tpPct}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 9: OPTION */}
                                {activeTab === "option" && activeSubItemIdx === 0 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            PIONEER 2 SOUND &amp; BGM DISK (`data/ogg/*.ogg`)
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap">
                                            {(
                                                [
                                                    { id: "CITY.ogg" as PsoBgmTrackId, label: "🎵 CITY.ogg (Pioneer 2)" },
                                                    { id: "LOBBY.ogg" as PsoBgmTrackId, label: "🎵 LOBBY.ogg (Visual Lobby)" },
                                                    { id: "GUILD.ogg" as PsoBgmTrackId, label: "🎵 GUILD.ogg (Hunter's Guild)" },
                                                    { id: "MEDICAL.ogg" as PsoBgmTrackId, label: "🎵 MEDICAL.ogg (Medical Center)" },
                                                    { id: "SHOP.ogg" as PsoBgmTrackId, label: "🎵 SHOP.ogg (Shopping Plaza)" },
                                                    { id: "LABO.ogg" as PsoBgmTrackId, label: "🎵 LABO.ogg (Episode II Lab)" },
                                                    { id: "slbgm_forest.ogg" as PsoBgmTrackId, label: "🎵 slbgm_forest.ogg (Forest)" },
                                                    { id: "synth" as PsoBgmTrackId, label: "🎹 WebAudio Synth Pad" },
                                                ]
                                            ).map((trk) => (
                                                <button
                                                    key={trk.id}
                                                    type="button"
                                                    className={classNames("pso-gamemenu-action-btn", {
                                                        "pso-gamemenu-action-btn--active": currentBgmTrack === trk.id,
                                                    })}
                                                    onClick={() => {
                                                        onPlayUiSound("confirm");
                                                        onSelectBgmTrack(trk.id);
                                                        setStatusBannerMsg(`Switched BGM Disk to ${trk.label}`);
                                                    }}
                                                >
                                                    {trk.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "option" && activeSubItemIdx === 1 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            SELECT PLAYABLE 3D HUNTER CLASS (`pl*bdy00.nj` + `pl*tex.afs`)
                                        </div>
                                        <div className="pso-gamemenu-card-grid">
                                            {CLASS_OPTIONS.map((cls) => (
                                                <button
                                                    key={cls.id}
                                                    type="button"
                                                    className={classNames("pso-gamemenu-equip-card", {
                                                        "pso-gamemenu-equip-card--active": currentClassId === cls.id,
                                                    })}
                                                    onClick={() => {
                                                        onPlayUiSound("confirm");
                                                        onSelectClass(cls.id);
                                                        setStatusBannerMsg(`Changed Hunter Class to ${cls.label} (${cls.race})`);
                                                    }}
                                                >
                                                    <div className="pso-gamemenu-equip-top">
                                                        <strong>{cls.label}</strong>
                                                        <span className="pso-gamemenu-equip-badge">
                                                            {currentClassId === cls.id ? "ACTIVE" : "SELECT"}
                                                        </span>
                                                    </div>
                                                    <div className="pso-gamemenu-equip-desc">{cls.race}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "option" && activeSubItemIdx === 2 && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            HUD GLASS &amp; NETWORK DISPLAY OPTIONS
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap">
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleClickThroughGlass();
                                                }}
                                            >
                                                🪟 Click-Through Glass (Alt+G): {isClickThroughGlass ? "ON" : "OFF"}
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleStreamOverlay();
                                                }}
                                            >
                                                ⟁ Stream Overlay Mode (Alt+O): {isStreamOverlay ? "ON" : "OFF"}
                                            </button>
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("confirm");
                                                    onToggleOpen(false);
                                                    onOpenHudTuner();
                                                }}
                                            >
                                                🎛️ Open Full HUD Glass &amp; Wallpaper Tuner
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 10: QUIT GAME */}
                                {activeTab === "quit" && (
                                    <div className="pso-gamemenu-section">
                                        <div className="pso-gamemenu-subtitle">
                                            RETURN TO PIONEER 2 OR EXIT 3D VISUAL LOBBY
                                        </div>
                                        <div className="pso-gamemenu-btn-wrap">
                                            <button
                                                type="button"
                                                className="pso-gamemenu-action-btn"
                                                onClick={() => {
                                                    onPlayUiSound("cancel");
                                                    onToggleOpen(false);
                                                }}
                                            >
                                                ↩️ Resume Pioneer 2 Session (`F12`)
                                            </button>
                                            {isLobby3dOpen && (
                                                <button
                                                    type="button"
                                                    className="pso-gamemenu-action-btn"
                                                    onClick={() => {
                                                        onPlayUiSound("cancel");
                                                        onOpenOrCloseLobby3d(false);
                                                        onToggleOpen(false);
                                                    }}
                                                >
                                                    🚪 Exit 3D Visual Lobby to 2D Chat
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Authentic Bottom PSOBB Help Description Box (`unitxt_e.prs` Cat[11][0..47]) */}
                    <div className="pso-gamemenu-help-footer">
                        <span className="pso-gamemenu-help-tag">HELP //</span>
                        <span className="pso-gamemenu-help-text">
                            {statusBannerMsg || activeSubItem?.helpText || activeTabObj?.helpText}
                        </span>
                    </div>
                </div>
            )}
        </>
    );
};
