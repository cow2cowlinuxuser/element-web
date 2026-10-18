/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import { PSO_BB_SYMBOL_SPRITE_SHEET_DATA_URL } from "./PsoSymbolSpriteSheetData";

export type PsoBalloonColorId = "pink" | "purple" | "mint" | "cyan" | "yellow" | "white";

export type PsoPartColorId =
    | "yellow"
    | "red"
    | "blue"
    | "green"
    | "purple"
    | "orange"
    | "cyan"
    | "white"
    | "dark";

export interface PsoSymbolLayer {
    id: string;
    partId: string;
    x: number; // 0..200 canvas coordinates
    y: number; // 0..108 canvas coordinates
    scale: number; // 0.5..2.0
    color: PsoPartColorId;
    flipX?: boolean;
    flipY?: boolean;
    pair?: boolean;
}

export interface PsoSymbolChatSpec {
    version: 1;
    name: string;
    balloonColor: PsoBalloonColorId;
    chime: "rappy" | "comm" | "alert" | "cheer" | "rare";
    layers: PsoSymbolLayer[];
}

export const BALLOON_PALETTES: Record<
    PsoBalloonColorId,
    { label: string; fillTop: string; fillBottom: string; border: string; tabFill: string; textColor: string }
> = {
    pink: {
        label: "Rappy Pink",
        fillTop: "#e39ab5",
        fillBottom: "#b96784",
        border: "#ffd6e6",
        tabFill: "#cf7a99",
        textColor: "#ffffff",
    },
    purple: {
        label: "Pioneer Lavender",
        fillTop: "#cca8f5",
        fillBottom: "#9b72cf",
        border: "#efe0ff",
        tabFill: "#aa82de",
        textColor: "#140826",
    },
    mint: {
        label: "Athena Mint",
        fillTop: "#9ef79e",
        fillBottom: "#62cf69",
        border: "#e0ffe0",
        tabFill: "#7be382",
        textColor: "#062109",
    },
    cyan: {
        label: "Ragol Ice Cyan",
        fillTop: "#9df0f2",
        fillBottom: "#57bec4",
        border: "#e3ffff",
        tabFill: "#6cd4d9",
        textColor: "#041e21",
    },
    yellow: {
        label: "Meseta Gold",
        fillTop: "#f7ec94",
        fillBottom: "#cfbe53",
        border: "#fffbe0",
        tabFill: "#e3d268",
        textColor: "#241d04",
    },
    white: {
        label: "Classic White",
        fillTop: "#f5f8fa",
        fillBottom: "#cfd9e0",
        border: "#58cfc9",
        tabFill: "#e1ebf0",
        textColor: "#0c1b24",
    },
};

export const PART_COLORS: Record<PsoPartColorId, { hex: string; stroke: string; label: string; rgb: [number, number, number] }> = {
    yellow: { hex: "#fae255", stroke: "#593812", label: "Yellow", rgb: [0.98, 0.89, 0.33] },
    red: { hex: "#e64545", stroke: "#450d0d", label: "Red", rgb: [0.9, 0.27, 0.27] },
    blue: { hex: "#689cf7", stroke: "#142952", label: "Blue", rgb: [0.41, 0.61, 0.97] },
    green: { hex: "#50d977", stroke: "#0e401d", label: "Green", rgb: [0.31, 0.85, 0.47] },
    purple: { hex: "#c37af5", stroke: "#381354", label: "Purple", rgb: [0.76, 0.48, 0.96] },
    orange: { hex: "#f2943a", stroke: "#4d2507", label: "Orange", rgb: [0.95, 0.58, 0.23] },
    cyan: { hex: "#5ee6e0", stroke: "#0c4240", label: "Cyan", rgb: [0.37, 0.9, 0.88] },
    white: { hex: "#f5f9fc", stroke: "#182630", label: "White", rgb: [0.97, 0.98, 0.99] },
    dark: { hex: "#28323c", stroke: "#090d12", label: "Charcoal", rgb: [0.22, 0.26, 0.32] },
};

export type PsoPartCategoryId = "all" | "sprite" | "shape" | "base" | "face" | "stamp" | "word";

export interface PsoSymbolPartDef {
    id: string;
    label: string;
    category: "sprite" | "shape" | "base" | "face" | "stamp" | "word";
    defaultColor: PsoPartColorId;
    spriteRect?: { x: number; y: number; w: number; h: number };
}

// ============================================================================
// 1. ALL 182 AUTHENTIC PSO BLUE BURST SPRITE SHEET TILES & GEOMETRIC PARTS
// ============================================================================
const SPRITE_ROW_COLS: Record<number, number[]> = {
    0: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    1: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    2: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    3: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    4: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    5: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    6: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    7: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
};

const SPRITE_TILE_LABELS: Record<string, string> = {
    "0_8": "Spring", "0_9": "Crown", "0_10": "Key", "0_11": "Item Box", "0_12": "Meseta (M)", "0_13": "Lightbulb", "0_14": "Music Note", "0_15": "Coffee Cup",
    "1_8": "Button A", "1_9": "Button B", "1_10": "Button X", "1_11": "Button Y", "1_12": "Button L", "1_13": "Button R", "1_14": "Heart", "1_15": "Broken Heart",
    "2_3": "Plus +", "2_4": "Minus -", "2_5": "Circle O", "2_6": "Cross X", "2_7": "Triangle", "2_8": "Question ?", "2_9": "Exclaim !", "2_10": "Ampersand &",
    "2_11": "Number 1", "2_12": "Number 2", "2_13": "Number 3", "2_14": "Number 4", "2_15": "Star ★",
    "3_0": "Virdia ID", "3_1": "Greenill ID", "3_2": "Skyly ID", "3_3": "Bluefull ID", "3_4": "Purplenum ID", "3_5": "Pinkal ID", "3_6": "Redria ID", "3_7": "Oran ID",
    "3_8": "Clock", "3_9": "Memo", "3_10": "Pencil", "3_11": "Mail", "3_12": "Ragol Planet", "3_13": "Rappy Sprite", "3_14": "Booma Sprite", "3_15": "Hildebear",
    "3_16": "East E←", "3_17": "North N↑", "3_18": "South S↓", "3_19": "West →W", "3_20": "House", "3_21": "Eye", "3_22": "Ear", "3_23": "Lips",
    "4_0": "Bomb", "4_1": "Yellowboze ID", "4_2": "Whitill ID", "4_8": "Standing", "4_9": "Running", "4_10": "Cheer", "4_12": "Flex Muscle", "4_17": "No Entry",
    "4_18": "Rain Cloud", "4_19": "Sun", "4_20": "Moon", "4_21": "Phone", "4_22": "Shop Cart", "4_23": "Apple",
    "5_3": "Foie Fire", "5_4": "Barta Ice", "5_5": "Zonde Bolt", "5_6": "Grants Light", "5_7": "Megid Dark",
    "6_0": "Saber Icon", "6_1": "Rod Icon", "6_2": "Handgun Icon", "6_3": "Shield Icon", "6_4": "Monomate Pill", "6_5": "Fluid Flask", "6_15": "Skull Icon",
    "7_0": "HP Full", "7_1": "TP Full", "7_2": "PB Full", "7_3": "HP Low", "7_4": "TP Low", "7_5": "PB Low",
    "7_6": "Male ♂", "7_7": "Female ♀", "7_10": "Dreamcast VMU", "7_11": "Telepipe Spiral", "7_12": "WC Restroom", "7_15": "Floppy Save",
};

function buildSpriteSheetParts(): PsoSymbolPartDef[] {
    const list: PsoSymbolPartDef[] = [];

    // 1. All 165 Left-Side 32x32 PSO Stamp Tiles
    for (let r = 0; r <= 7; r++) {
        const cols = SPRITE_ROW_COLS[r] ?? [];
        for (const c of cols) {
            const key = `${r}_${c}`;
            const label = SPRITE_TILE_LABELS[key] ?? `PSO Stamp [${r + 1},${c + 1}]`;
            list.push({
                id: `spr_tile_${r}_${c}`,
                label,
                category: "sprite",
                defaultColor: "white",
                spriteRect: { x: c * 32, y: r * 32, w: 32, h: 32 },
            });
        }
    }

    // 2. Right-Side Authentic PSO Geometric Primitives, Eyes, Mouths, Hands & Speech Shapes
    const rightShapes: Array<{ id: string; label: string; x: number; y: number; w: number; h: number; defaultColor: PsoPartColorId }> = [
        // Row 3 (y=96): 8 PSO Hand Signs (Stop, Side, Point Up, Point Right, Fist, Grab, Peace V,Claw)
        { id: "spr_hand_0", label: "PSO Hand: Open Palm", x: 24 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_1", label: "PSO Hand: Side Palm", x: 25 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_2", label: "PSO Hand: Point Up", x: 26 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_3", label: "PSO Hand: Point Right", x: 27 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_4", label: "PSO Hand: Fist Up", x: 28 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_5", label: "PSO Hand: Clench", x: 29 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_6", label: "PSO Hand: Peace V", x: 30 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_hand_7", label: "PSO Hand: Shout/Pinch", x: 31 * 32, y: 96, w: 32, h: 32, defaultColor: "white" },
        // Rows 0..2 (y=0..64): Small Eyes, Sweat Drops, Teeth, Arcs, Cheeks
        { id: "spr_small_0", label: "PSO Sweat Drops", x: 27 * 32, y: 0, w: 32, h: 32, defaultColor: "cyan" },
        { id: "spr_small_1", label: "PSO Oval Eye", x: 29 * 32, y: 0, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_small_2", label: "PSO Teeth Grin", x: 29 * 32, y: 32, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_small_3", label: "PSO Wide Block", x: 31 * 32, y: 0, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_small_4", label: "PSO Half Moon", x: 31 * 32, y: 32, w: 32, h: 32, defaultColor: "yellow" },
        { id: "spr_small_5", label: "PSO Wedge Brow", x: 28 * 32, y: 64, w: 32, h: 32, defaultColor: "yellow" },
        { id: "spr_small_6", label: "PSO Oval Cheek", x: 24 * 32, y: 64, w: 32, h: 32, defaultColor: "red" },
        { id: "spr_small_7", label: "PSO Square Dot", x: 26 * 32, y: 64, w: 32, h: 32, defaultColor: "white" },
        { id: "spr_small_8", label: "PSO Corner Triangle", x: 27 * 32, y: 64, w: 32, h: 32, defaultColor: "yellow" },
        // Rows 4..7 (y=128..224): Large 64x64 Base Geometric Shapes (Triangle, Rounded Square, Circle, Shield, Speech Bubbles)
        { id: "spr_big_tri", label: "PSO Big Triangle (64px)", x: 24 * 32, y: 128, w: 64, h: 64, defaultColor: "yellow" },
        { id: "spr_big_sq", label: "PSO Big Square (64px)", x: 26 * 32, y: 128, w: 64, h: 64, defaultColor: "blue" },
        { id: "spr_big_cir", label: "PSO Big Circle (64px)", x: 24 * 32, y: 192, w: 64, h: 64, defaultColor: "yellow" },
        { id: "spr_big_shd", label: "PSO Big Shield (64px)", x: 26 * 32, y: 192, w: 64, h: 64, defaultColor: "cyan" },
        { id: "spr_big_bub1", label: "PSO Speech Box L", x: 28 * 32, y: 128, w: 48, h: 36, defaultColor: "white" },
        { id: "spr_big_bub2", label: "PSO Speech Box R", x: 29 * 32 + 16, y: 128, w: 48, h: 36, defaultColor: "white" },
        { id: "spr_big_bub3", label: "PSO Shout Box L", x: 28 * 32, y: 164, w: 48, h: 36, defaultColor: "white" },
        { id: "spr_big_bub4", label: "PSO Shout Box R", x: 29 * 32 + 16, y: 164, w: 48, h: 36, defaultColor: "white" },
    ];

    for (const s of rightShapes) {
        list.push({
            id: s.id,
            label: s.label,
            category: "shape",
            defaultColor: s.defaultColor,
            spriteRect: { x: s.x, y: s.y, w: s.w, h: s.h },
        });
    }

    return list;
}

export const PSO_SYMBOL_PARTS: PsoSymbolPartDef[] = [
    // Vector Base & Character Bodies
    { id: "rappy_body", label: "Rappy Chick", category: "base", defaultColor: "yellow" },
    { id: "circle_head", label: "Round Face", category: "base", defaultColor: "blue" },
    { id: "shield_head", label: "HUcast Shield", category: "base", defaultColor: "blue" },
    { id: "cat_head", label: "Myau Cat", category: "base", defaultColor: "cyan" },
    { id: "square_head", label: "Cube Face", category: "base", defaultColor: "orange" },
    // Vector Face & Hand Parts
    { id: "eyes_dot", label: "Dot Eyes", category: "face", defaultColor: "dark" },
    { id: "eyes_happy", label: "Happy ^ ^", category: "face", defaultColor: "dark" },
    { id: "eyes_angry", label: "Fierce Eyes", category: "face", defaultColor: "dark" },
    { id: "eyes_shades", label: "Cool Shades", category: "face", defaultColor: "dark" },
    { id: "mouth_beak", label: "Rappy Beak", category: "face", defaultColor: "orange" },
    { id: "mouth_smile", label: "Smile", category: "face", defaultColor: "dark" },
    { id: "mouth_open", label: "Shout Mouth", category: "face", defaultColor: "red" },
    { id: "bowtie", label: "Red Bowtie", category: "face", defaultColor: "red" },
    { id: "hand_stop", label: "Stop Hand ✋", category: "face", defaultColor: "white" },
    { id: "hand_peace", label: "Peace Sign ✌", category: "face", defaultColor: "white" },
    { id: "hand_point", label: "Point Hand 👉", category: "face", defaultColor: "white" },
    { id: "sweat_drop", label: "Sweat Drop", category: "face", defaultColor: "cyan" },
    // Vector Stamps & Badges
    { id: "stamp_forbid", label: "No / Forbid 🚫", category: "stamp", defaultColor: "red" },
    { id: "stamp_cross", label: "X Tile ✖", category: "stamp", defaultColor: "dark" },
    { id: "stamp_heart", label: "Heart Tile ♥", category: "stamp", defaultColor: "red" },
    { id: "stamp_skull", label: "Skull Tile 💀", category: "stamp", defaultColor: "white" },
    { id: "stamp_hp", label: "HP Restore Tile", category: "stamp", defaultColor: "red" },
    { id: "stamp_meseta", label: "Meseta Cube", category: "stamp", defaultColor: "yellow" },
    { id: "stamp_rappy", label: "Rappy Tile", category: "stamp", defaultColor: "yellow" },
    { id: "stamp_music", label: "Music Note ♫", category: "stamp", defaultColor: "yellow" },
    { id: "stamp_exclaim", label: "Alert [ ! ]", category: "stamp", defaultColor: "blue" },
    // Vector Word Balloons
    { id: "word_no", label: "Word: No", category: "word", defaultColor: "blue" },
    { id: "word_yes", label: "Word: Yes", category: "word", defaultColor: "white" },
    { id: "word_ok", label: "Word: OK", category: "word", defaultColor: "white" },
    { id: "word_hi", label: "Word: Hi", category: "word", defaultColor: "white" },
    { id: "word_bye", label: "Word: Bye", category: "word", defaultColor: "white" },
    { id: "word_go", label: "Word: Go", category: "word", defaultColor: "white" },
    { id: "word_cool", label: "Word: Cool", category: "word", defaultColor: "white" },
    { id: "word_dots", label: "Word: ....", category: "word", defaultColor: "white" },
    { id: "word_help", label: "Word: Help", category: "word", defaultColor: "red" },
    { id: "word_zzz", label: "Word: Zzz", category: "word", defaultColor: "white" },
    // Authentic Ripped PSO Blue Burst Sprite Sheet Parts (180+ tiles & shapes)
    ...buildSpriteSheetParts(),
];

const PART_MAP = new Map<string, PsoSymbolPartDef>(PSO_SYMBOL_PARTS.map((p) => [p.id, p]));

// ============================================================================
// 2. 30 SAVABLE PSO SYMBOL CHAT PRESET SLOTS
// ============================================================================
const CORE_PRESETS: PsoSymbolChatSpec[] = [
    {
        version: 1,
        name: "Rappy No! (Classic)",
        balloonColor: "pink",
        chime: "rappy",
        layers: [
            { id: "l1", partId: "rappy_body", x: 96, y: 55, scale: 1.08, color: "yellow" },
            { id: "l2", partId: "eyes_dot", x: 96, y: 36, scale: 1, color: "dark" },
            { id: "l3", partId: "mouth_beak", x: 96, y: 43, scale: 1, color: "orange" },
            { id: "l4", partId: "bowtie", x: 96, y: 54, scale: 1, color: "red" },
            { id: "l5", partId: "stamp_forbid", x: 46, y: 60, scale: 1.05, color: "red" },
            { id: "l6", partId: "word_no", x: 148, y: 58, scale: 1.1, color: "blue" },
        ],
    },
    {
        version: 1,
        name: "Athena Stop / No",
        balloonColor: "mint",
        chime: "alert",
        layers: [
            { id: "a1", partId: "circle_head", x: 98, y: 54, scale: 1.1, color: "dark" },
            { id: "a2", partId: "eyes_angry", x: 96, y: 48, scale: 1, color: "white" },
            { id: "a3", partId: "hand_stop", x: 112, y: 66, scale: 1.05, color: "white" },
            { id: "a4", partId: "word_dots", x: 44, y: 34, scale: 1, color: "white" },
            { id: "a5", partId: "stamp_skull", x: 44, y: 74, scale: 1, color: "white" },
            { id: "a6", partId: "word_no", x: 154, y: 34, scale: 1, color: "white" },
            { id: "a7", partId: "stamp_cross", x: 154, y: 74, scale: 1, color: "dark" },
        ],
    },
    {
        version: 1,
        name: "HUcast Cool OK!",
        balloonColor: "cyan",
        chime: "comm",
        layers: [
            { id: "c1", partId: "shield_head", x: 98, y: 56, scale: 1.15, color: "blue" },
            { id: "c2", partId: "eyes_shades", x: 96, y: 48, scale: 1.05, color: "dark" },
            { id: "c3", partId: "mouth_smile", x: 98, y: 64, scale: 1, color: "dark" },
            { id: "c4", partId: "hand_peace", x: 124, y: 54, scale: 1, color: "white" },
            { id: "c5", partId: "word_cool", x: 44, y: 34, scale: 0.95, color: "white" },
            { id: "c6", partId: "word_ok", x: 44, y: 74, scale: 0.95, color: "white" },
            { id: "c7", partId: "word_cool", x: 156, y: 34, scale: 0.95, color: "white" },
            { id: "c8", partId: "word_ok", x: 156, y: 74, scale: 0.95, color: "white" },
        ],
    },
    {
        version: 1,
        name: "Need Resta / HP!",
        balloonColor: "purple",
        chime: "alert",
        layers: [
            { id: "h1", partId: "square_head", x: 98, y: 56, scale: 1.1, color: "blue" },
            { id: "h2", partId: "eyes_angry", x: 98, y: 48, scale: 1, color: "dark" },
            { id: "h3", partId: "mouth_open", x: 98, y: 65, scale: 1, color: "red" },
            { id: "h4", partId: "sweat_drop", x: 118, y: 42, scale: 1, color: "cyan" },
            { id: "h5", partId: "stamp_hp", x: 42, y: 42, scale: 1.05, color: "red" },
            { id: "h6", partId: "stamp_hp", x: 154, y: 42, scale: 1.05, color: "red" },
            { id: "h7", partId: "word_help", x: 154, y: 78, scale: 1, color: "red" },
        ],
    },
    {
        version: 1,
        name: "Myau Yes! Let's Go",
        balloonColor: "yellow",
        chime: "cheer",
        layers: [
            { id: "m1", partId: "cat_head", x: 100, y: 58, scale: 1.15, color: "blue" },
            { id: "m2", partId: "eyes_happy", x: 100, y: 50, scale: 1, color: "dark" },
            { id: "m3", partId: "mouth_open", x: 100, y: 64, scale: 0.9, color: "red" },
            { id: "m4", partId: "word_yes", x: 44, y: 38, scale: 1.05, color: "white" },
            { id: "m5", partId: "word_go", x: 44, y: 76, scale: 1.05, color: "white" },
            { id: "m6", partId: "stamp_rappy", x: 154, y: 42, scale: 1.05, color: "yellow" },
            { id: "m7", partId: "stamp_heart", x: 154, y: 78, scale: 1, color: "red" },
        ],
    },
    {
        version: 1,
        name: "Telepipe Up! (Ryuker)",
        balloonColor: "cyan",
        chime: "rare",
        layers: [
            { id: "t1", partId: "spr_tile_7_11", x: 98, y: 54, scale: 1.5, color: "cyan" },
            { id: "t2", partId: "spr_hand_2", x: 46, y: 54, scale: 1.2, color: "yellow", pair: true },
            { id: "t3", partId: "word_go", x: 98, y: 84, scale: 1, color: "white" },
        ],
    },
    {
        version: 1,
        name: "Rare Red Box Drop!!",
        balloonColor: "pink",
        chime: "rare",
        layers: [
            { id: "r1", partId: "spr_tile_0_11", x: 98, y: 52, scale: 1.55, color: "red" },
            { id: "r2", partId: "spr_tile_2_15", x: 46, y: 46, scale: 1.2, color: "yellow", pair: true },
            { id: "r3", partId: "spr_tile_0_9", x: 98, y: 24, scale: 1.1, color: "yellow" },
        ],
    },
    {
        version: 1,
        name: "Shifta & Deband Pls",
        balloonColor: "mint",
        chime: "comm",
        layers: [
            { id: "sd1", partId: "spr_tile_5_3", x: 64, y: 52, scale: 1.35, color: "red" },
            { id: "sd2", partId: "spr_tile_5_4", x: 134, y: 52, scale: 1.35, color: "blue" },
            { id: "sd3", partId: "word_help", x: 98, y: 82, scale: 0.95, color: "red" },
        ],
    },
    {
        version: 1,
        name: "Photon Blast Ready!",
        balloonColor: "yellow",
        chime: "cheer",
        layers: [
            { id: "pb1", partId: "spr_tile_7_2", x: 98, y: 50, scale: 1.5, color: "orange" },
            { id: "pb2", partId: "spr_tile_2_11", x: 42, y: 36, scale: 1.1, color: "yellow" },
            { id: "pb3", partId: "spr_tile_2_12", x: 156, y: 36, scale: 1.1, color: "cyan" },
            { id: "pb4", partId: "word_ok", x: 98, y: 84, scale: 1, color: "white" },
        ],
    },
    {
        version: 1,
        name: "AFK / Coffee Break",
        balloonColor: "white",
        chime: "comm",
        layers: [
            { id: "cf1", partId: "spr_tile_0_15", x: 98, y: 52, scale: 1.5, color: "orange" },
            { id: "cf2", partId: "word_zzz", x: 150, y: 36, scale: 1.05, color: "white" },
            { id: "cf3", partId: "spr_tile_3_8", x: 46, y: 52, scale: 1.2, color: "cyan" },
        ],
    },
];

export const DEFAULT_SYMBOL_PRESETS: PsoSymbolChatSpec[] = Array.from({ length: 30 }, (_, idx) => {
    if (idx < CORE_PRESETS.length) {
        return CORE_PRESETS[idx];
    }
    const paletteKeys: PsoBalloonColorId[] = ["pink", "cyan", "mint", "purple", "yellow", "white"];
    const row = idx % 8;
    const col = 8 + (idx % 16);
    return {
        version: 1,
        name: `Custom Slot #${idx + 1}`,
        balloonColor: paletteKeys[idx % paletteKeys.length],
        chime: "comm",
        layers: [
            {
                id: `slot-${idx}-base`,
                partId: "spr_big_cir",
                x: 98,
                y: 54,
                scale: 1.0,
                color: "cyan",
            },
            {
                id: `slot-${idx}-stamp`,
                partId: `spr_tile_${row}_${col}`,
                x: 98,
                y: 54,
                scale: 1.2,
                color: "yellow",
            },
            {
                id: `slot-${idx}-word`,
                partId: "word_hi",
                x: 44,
                y: 42,
                scale: 1.0,
                color: "white",
            },
        ],
    };
});

export function ensureThirtySymbolPresets(saved: PsoSymbolChatSpec[]): PsoSymbolChatSpec[] {
    return Array.from({ length: 30 }, (_, i) => saved[i] ?? DEFAULT_SYMBOL_PRESETS[i]);
}

let sharedAudioCtx: AudioContext | null = null;

/**
 * Synthesizes authentic PSO Dreamcast/Blue Burst Symbol Chat chimes using WebAudio.
 */
export function playPsoSymbolChime(chime: PsoSymbolChatSpec["chime"] = "rappy"): void {
    try {
        const AudioCtx =
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!sharedAudioCtx) {
            sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === "suspended") {
            void sharedAudioCtx.resume();
        }
        const ctx = sharedAudioCtx;
        const now = ctx.currentTime;

        const notes =
            chime === "rappy"
                ? [1174.66, 1567.98, 1318.51] // D6 -> G6 -> E6 chirp
                : chime === "alert"
                  ? [880, 659.25, 880] // A5 -> E5 -> A5
                  : chime === "cheer"
                    ? [783.99, 987.77, 1174.66, 1567.98] // G5 -> B5 -> D6 -> G6
                    : chime === "rare"
                      ? [1318.51, 1567.98, 1975.53, 2637.02] // E6 -> G6 -> B6 -> E7 rare drop chime
                      : [1046.5, 1318.51]; // C6 -> E6 comm beep

        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = chime === "rappy" || chime === "rare" ? "triangle" : "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.065);
            gain.gain.setValueAtTime(0.08, now + idx * 0.065);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + idx * 0.065);
            osc.stop(now + idx * 0.065 + 0.15);
        });
    } catch {
        // Ignore audio errors
    }
}

function renderSinglePart(
    layer: PsoSymbolLayer,
    keyPrefix: string,
    offsetX = 0,
    spriteSheetUrl: string = PSO_BB_SYMBOL_SPRITE_SHEET_DATA_URL,
): JSX.Element {
    const colorDef = PART_COLORS[layer.color] ?? PART_COLORS.yellow;
    const tx = layer.x + offsetX;
    const ty = layer.y;
    const sx = (layer.flipX ? -1 : 1) * layer.scale;
    const sy = (layer.flipY ? -1 : 1) * layer.scale;

    // Check if this part is a ripped PSO Blue Burst sprite sheet rect
    const partDef = PART_MAP.get(layer.partId);
    if (partDef?.spriteRect) {
        const { x, y, w, h } = partDef.spriteRect;
        const clipId = `pso-spr-clip-${keyPrefix}-${x}-${y}`;
        const filterId = `pso-spr-tint-${layer.color}`;
        return (
            <g key={keyPrefix} transform={`translate(${tx}, ${ty}) scale(${sx}, ${sy})`}>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(0,0,0,0.001)" />
                <clipPath id={clipId}>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} />
                </clipPath>
                <g clipPath={`url(#${clipId})`} filter={`url(#${filterId})`}>
                    <image
                        href={spriteSheetUrl}
                        x={-w / 2 - x}
                        y={-h / 2 - y}
                        width={1024}
                        height={256}
                        style={{ imageRendering: "pixelated" }}
                    />
                </g>
            </g>
        );
    }

    const renderWordBox = (text: string, accentFill?: string): JSX.Element => (
        <g>
            <rect
                x="-21"
                y="-13"
                width="42"
                height="24"
                rx="4"
                fill="#101418"
                transform="translate(2, 2)"
            />
            <rect
                x="-21"
                y="-13"
                width="42"
                height="24"
                rx="4"
                fill={accentFill ?? "#ffffff"}
                stroke="#11161c"
                strokeWidth="2"
            />
            <polygon points="-14,11 -8,11 -18,17" fill={accentFill ?? "#ffffff"} stroke="#11161c" strokeWidth="1.6" />
            <text
                x="0"
                y="4"
                textAnchor="middle"
                fill={accentFill ? "#ffffff" : "#11161c"}
                fontFamily="Arial Narrow, Impact, sans-serif"
                fontWeight="900"
                fontSize="15"
            >
                {text}
            </text>
        </g>
    );

    const renderStampTile = (children: JSX.Element, tileFill = colorDef.hex): JSX.Element => (
        <g>
            <rect x="-15" y="-15" width="32" height="32" rx="5" fill="#0d1217" />
            <rect
                x="-16"
                y="-16"
                width="32"
                height="32"
                rx="5"
                fill={tileFill}
                stroke="#11161c"
                strokeWidth="2.2"
            />
            {children}
        </g>
    );

    let shape: JSX.Element;
    switch (layer.partId) {
        case "rappy_body":
            shape = (
                <g>
                    <ellipse cx="0" cy="0" rx="44" ry="28" fill="rgba(255,255,255,0.22)" />
                    <circle cx="0" cy="8" r="21" fill={colorDef.hex} stroke={colorDef.stroke} strokeWidth="2.4" />
                    <circle cx="0" cy="-14" r="14.5" fill={colorDef.hex} stroke={colorDef.stroke} strokeWidth="2.4" />
                    <polygon points="-4,-28 0,-36 4,-28" fill={colorDef.hex} stroke={colorDef.stroke} strokeWidth="2" />
                </g>
            );
            break;
        case "circle_head":
            shape = <circle cx="0" cy="0" r="24" fill={colorDef.hex} stroke="#11161c" strokeWidth="2.6" />;
            break;
        case "shield_head":
            shape = (
                <g>
                    <polygon
                        points="-21,-22 21,-22 21,6 0,25 -21,6"
                        fill={colorDef.hex}
                        stroke="#11161c"
                        strokeWidth="2.6"
                    />
                    <line x1="0" y1="-22" x2="0" y2="-4" stroke="#11161c" strokeWidth="2" />
                </g>
            );
            break;
        case "cat_head":
            shape = (
                <g>
                    <polygon points="-16,-12 -12,-27 -3,-16" fill={colorDef.hex} stroke="#11161c" strokeWidth="2.2" />
                    <polygon points="16,-12 12,-27 3,-16" fill={colorDef.hex} stroke="#11161c" strokeWidth="2.2" />
                    <circle cx="0" cy="0" r="21" fill={colorDef.hex} stroke="#11161c" strokeWidth="2.4" />
                    <line x1="-25" y1="-2" x2="-13" y2="0" stroke="#11161c" strokeWidth="2" />
                    <line x1="-25" y1="4" x2="-13" y2="3" stroke="#11161c" strokeWidth="2" />
                    <line x1="25" y1="-2" x2="13" y2="0" stroke="#11161c" strokeWidth="2" />
                    <line x1="25" y1="4" x2="13" y2="3" stroke="#11161c" strokeWidth="2" />
                </g>
            );
            break;
        case "square_head":
            shape = (
                <rect
                    x="-22"
                    y="-22"
                    width="44"
                    height="44"
                    rx="7"
                    fill={colorDef.hex}
                    stroke="#11161c"
                    strokeWidth="2.5"
                />
            );
            break;
        case "eyes_dot":
            shape = (
                <g>
                    <circle cx="-7" cy="0" r="3.2" fill={colorDef.hex} />
                    <circle cx="7" cy="0" r="3.2" fill={colorDef.hex} />
                </g>
            );
            break;
        case "eyes_happy":
            shape = (
                <g fill="none" stroke={colorDef.hex} strokeWidth="2.6" strokeLinecap="round">
                    <path d="M -12 2 Q -7 -5 -2 2" />
                    <path d="M 2 2 Q 7 -5 12 2" />
                </g>
            );
            break;
        case "eyes_angry":
            shape = (
                <g>
                    <line x1="-13" y1="-5" x2="-3" y2="-1" stroke="#11161c" strokeWidth="2.8" strokeLinecap="round" />
                    <line x1="13" y1="-5" x2="3" y2="-1" stroke="#11161c" strokeWidth="2.8" strokeLinecap="round" />
                    <circle cx="-7" cy="2" r="2.8" fill={colorDef.hex} />
                    <circle cx="7" cy="2" r="2.8" fill={colorDef.hex} />
                </g>
            );
            break;
        case "eyes_shades":
            shape = (
                <g>
                    <polygon points="-15,-4 -2,-4 -4,5 -13,5" fill="#10161d" stroke="#ffffff" strokeWidth="1.4" />
                    <polygon points="2,-4 15,-4 13,5 4,5" fill="#10161d" stroke="#ffffff" strokeWidth="1.4" />
                    <line x1="-2" y1="-2" x2="2" y2="-2" stroke="#10161d" strokeWidth="2.2" />
                </g>
            );
            break;
        case "mouth_beak":
            shape = <polygon points="-4,-3 4,-3 0,4" fill={colorDef.hex} stroke={colorDef.stroke} strokeWidth="1.2" />;
            break;
        case "mouth_smile":
            shape = (
                <path
                    d="M -8 -1 Q 0 8 8 -1"
                    fill="none"
                    stroke={colorDef.hex}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                />
            );
            break;
        case "mouth_open":
            shape = (
                <ellipse cx="0" cy="0" rx="6.5" ry="5" fill={colorDef.hex} stroke="#11161c" strokeWidth="2" />
            );
            break;
        case "bowtie":
            shape = (
                <g>
                    <polygon points="-11,-5 0,0 -11,5" fill={colorDef.hex} stroke="#4a1018" strokeWidth="1.2" />
                    <polygon points="11,-5 0,0 11,5" fill={colorDef.hex} stroke="#4a1018" strokeWidth="1.2" />
                    <circle cx="0" cy="0" r="2.8" fill="#ff8593" />
                </g>
            );
            break;
        case "hand_stop":
            shape = (
                <g>
                    <rect
                        x="-9"
                        y="-4"
                        width="18"
                        height="16"
                        rx="5"
                        fill={colorDef.hex}
                        stroke="#11161c"
                        strokeWidth="2"
                    />
                    <rect x="-8" y="-13" width="3.5" height="11" rx="1.5" fill={colorDef.hex} stroke="#11161c" strokeWidth="1.5" />
                    <rect x="-3.5" y="-15" width="3.5" height="13" rx="1.5" fill={colorDef.hex} stroke="#11161c" strokeWidth="1.5" />
                    <rect x="1" y="-14" width="3.5" height="12" rx="1.5" fill={colorDef.hex} stroke="#11161c" strokeWidth="1.5" />
                    <rect x="5.5" y="-11" width="3.5" height="9" rx="1.5" fill={colorDef.hex} stroke="#11161c" strokeWidth="1.5" />
                </g>
            );
            break;
        case "hand_peace":
            shape = (
                <g>
                    <circle cx="0" cy="4" r="8" fill={colorDef.hex} stroke="#11161c" strokeWidth="2" />
                    <line x1="-3" y1="-2" x2="-7" y2="-14" stroke="#11161c" strokeWidth="5" strokeLinecap="round" />
                    <line x1="-3" y1="-2" x2="-7" y2="-14" stroke={colorDef.hex} strokeWidth="2.4" strokeLinecap="round" />
                    <line x1="3" y1="-2" x2="7" y2="-14" stroke="#11161c" strokeWidth="5" strokeLinecap="round" />
                    <line x1="3" y1="-2" x2="7" y2="-14" stroke={colorDef.hex} strokeWidth="2.4" strokeLinecap="round" />
                </g>
            );
            break;
        case "hand_point":
            shape = (
                <g>
                    <rect x="-8" y="-5" width="14" height="11" rx="4" fill={colorDef.hex} stroke="#11161c" strokeWidth="2" />
                    <rect x="4" y="-4" width="12" height="5" rx="2" fill={colorDef.hex} stroke="#11161c" strokeWidth="1.8" />
                </g>
            );
            break;
        case "sweat_drop":
            shape = (
                <path
                    d="M 0 -9 C 5 -2 6 6 0 9 C -6 6 -5 -2 0 -9 Z"
                    fill={colorDef.hex}
                    stroke="#11161c"
                    strokeWidth="1.8"
                />
            );
            break;
        case "stamp_forbid":
            shape = (
                <g>
                    <circle cx="0" cy="0" r="14" fill="none" stroke={colorDef.hex} strokeWidth="4.5" />
                    <line x1="-9.5" y1="-9.5" x2="9.5" y2="9.5" stroke={colorDef.hex} strokeWidth="4.5" />
                </g>
            );
            break;
        case "stamp_cross":
            shape = renderStampTile(
                <g stroke="#11161c" strokeWidth="4.5" strokeLinecap="round">
                    <line x1="-8" y1="-8" x2="8" y2="8" />
                    <line x1="8" y1="-8" x2="-8" y2="8" />
                </g>,
                "#cfd8e0",
            );
            break;
        case "stamp_heart":
            shape = renderStampTile(
                <path
                    d="M 0 9 C -12 1 -13 -8 -6 -10 C -2 -11 0 -7 0 -5 C 0 -7 2 -11 6 -10 C 13 -8 12 1 0 9 Z"
                    fill="#11161c"
                />,
            );
            break;
        case "stamp_skull":
            shape = renderStampTile(
                <g>
                    <circle cx="0" cy="-2" r="9" fill="#ffffff" stroke="#11161c" strokeWidth="2" />
                    <circle cx="-3.5" cy="-3" r="2.2" fill="#11161c" />
                    <circle cx="3.5" cy="-3" r="2.2" fill="#11161c" />
                    <rect x="-4.5" y="5" width="9" height="5" fill="#ffffff" stroke="#11161c" strokeWidth="1.6" />
                </g>,
                "#b8c4cf",
            );
            break;
        case "stamp_hp":
            shape = renderStampTile(
                <g>
                    <text
                        x="0"
                        y="-2"
                        textAnchor="middle"
                        fill="#11161c"
                        fontFamily="Arial Black, sans-serif"
                        fontWeight="900"
                        fontSize="11"
                    >
                        HP
                    </text>
                    <rect x="-10" y="3" width="20" height="6" rx="2" fill="#ffffff" stroke="#11161c" strokeWidth="1.8" />
                </g>,
            );
            break;
        case "stamp_meseta":
            shape = renderStampTile(
                <polygon points="0,-10 10,0 0,10 -10,0" fill="#11161c" stroke="#ffffff" strokeWidth="1.2" />,
            );
            break;
        case "stamp_rappy":
            shape = renderStampTile(
                <g>
                    <circle cx="0" cy="3" r="7" fill="#11161c" />
                    <circle cx="0" cy="-5" r="5" fill="#11161c" />
                    <polygon points="4,-5 10,-3 4,-1" fill="#11161c" />
                </g>,
            );
            break;
        case "stamp_music":
            shape = renderStampTile(
                <text
                    x="0"
                    y="7"
                    textAnchor="middle"
                    fill="#11161c"
                    fontFamily="Arial Black, sans-serif"
                    fontWeight="900"
                    fontSize="20"
                >
                    ♫
                </text>,
            );
            break;
        case "stamp_exclaim":
            shape = renderStampTile(
                <text
                    x="0"
                    y="8"
                    textAnchor="middle"
                    fill="#11161c"
                    fontFamily="Arial Black, sans-serif"
                    fontWeight="900"
                    fontSize="22"
                >
                    !
                </text>,
            );
            break;
        case "word_no":
            shape = (
                <text
                    x="0"
                    y="6"
                    textAnchor="middle"
                    fill={colorDef.hex}
                    stroke="#ffffff"
                    strokeWidth="3"
                    paintOrder="stroke"
                    fontFamily="Arial Black, Orbitron, sans-serif"
                    fontWeight="900"
                    fontSize="20"
                >
                    No
                </text>
            );
            break;
        case "word_yes":
            shape = renderWordBox("Yes");
            break;
        case "word_ok":
            shape = renderWordBox("OK");
            break;
        case "word_hi":
            shape = renderWordBox("Hi");
            break;
        case "word_bye":
            shape = renderWordBox("Bye");
            break;
        case "word_go":
            shape = renderWordBox("Go");
            break;
        case "word_cool":
            shape = renderWordBox("Cool");
            break;
        case "word_dots":
            shape = renderWordBox("....");
            break;
        case "word_help":
            shape = renderWordBox("Help", "#e64545");
            break;
        case "word_zzz":
            shape = renderWordBox("Zzz");
            break;
        default:
            shape = <circle cx="0" cy="0" r="10" fill={colorDef.hex} />;
    }

    return (
        <g key={keyPrefix} transform={`translate(${tx}, ${ty}) scale(${sx}, ${sy})`}>
            {/* Invisible hit target so hollow/line parts (smiles, eyes, forbid circle) are easy to click & drag */}
            <rect x="-18" y="-15" width="36" height="30" rx="6" fill="rgba(0,0,0,0.001)" />
            {shape}
        </g>
    );
}

/**
 * Shared SVG <defs> for tinting the white PSO Blue Burst Sprite Sheet tiles into any of the 9 PSO part colors.
 */
function renderPsoSpriteTintFilters(): JSX.Element {
    return (
        <>
            {(Object.keys(PART_COLORS) as PsoPartColorId[]).map((cid) => {
                const [r, g, b] = PART_COLORS[cid].rgb;
                return (
                    <filter key={cid} id={`pso-spr-tint-${cid}`} colorInterpolationFilters="sRGB">
                        <feColorMatrix
                            type="matrix"
                            values={`${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`}
                        />
                    </filter>
                );
            })}
        </>
    );
}

/**
 * Renders an authentic slanted PSO parallelogram Symbol Chat speech bubble with top-left sender name tab.
 */
export function PsoSymbolChatBalloon({
    sender,
    spec,
    selectedLayerId,
    onSelectLayer,
    onLayerPointerDown,
    onCanvasPointerDown,
    customSpriteSheetUrl,
    className,
}: {
    sender: string;
    spec: PsoSymbolChatSpec;
    selectedLayerId?: string | null;
    onSelectLayer?: (id: string) => void;
    onLayerPointerDown?: (id: string, e: React.PointerEvent<SVGGElement>) => void;
    onCanvasPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
    customSpriteSheetUrl?: string | null;
    className?: string;
}): JSX.Element {
    const palette = BALLOON_PALETTES[spec.balloonColor] ?? BALLOON_PALETTES.pink;
    const gradId = `pso-balloon-grad-${spec.balloonColor}`;
    const displaySender = sender.slice(0, 16).toUpperCase();
    const tabRightX = Math.max(108, Math.min(208, 28 + displaySender.length * 7.6 + 16));
    const tabBottomRightX = tabRightX - 6;
    const tabCenterX = (20 + tabRightX) / 2 - 2;
    const sheetUrl = customSpriteSheetUrl || PSO_BB_SYMBOL_SPRITE_SHEET_DATA_URL;

    return (
        <div className={classNames("pso-symbol-balloon-wrap", className)}>
            <svg
                viewBox="0 0 240 138"
                className="pso-symbol-balloon-svg"
                onPointerDown={onCanvasPointerDown}
            >
                <defs>
                    {renderPsoSpriteTintFilters()}
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={palette.fillTop} />
                        <stop offset="100%" stopColor={palette.fillBottom} />
                    </linearGradient>
                    <clipPath id="psoBalloonInnerClip">
                        <path d="M 24,24 L 224,24 Q 232,24 229,32 L 210,122 Q 208,130 198,130 L 10,130 Q 2,130 5,122 L 21,32 Q 22,24 24,24 Z" />
                    </clipPath>
                </defs>

                {/* Drop shadow */}
                <path
                    d="M 28,28 L 228,28 Q 236,28 233,36 L 214,126 Q 212,134 202,134 L 14,134 Q 6,134 9,126 L 25,36 Z"
                    fill="rgba(0, 0, 0, 0.58)"
                />

                {/* Top-Left Slanted Sender Name Tab (Dynamically sized to fit username) */}
                <path
                    d={`M 22,4 L ${tabRightX},4 L ${tabBottomRightX},26 L 16,26 Z`}
                    fill={palette.tabFill}
                    stroke="#0d131a"
                    strokeWidth="2.5"
                />
                <text
                    x={tabCenterX}
                    y="19"
                    textAnchor="middle"
                    fill={palette.textColor}
                    fontFamily="Orbitron, Arial Black, sans-serif"
                    fontWeight="900"
                    fontSize="10.5"
                    letterSpacing="0.04em"
                >
                    {displaySender}
                </text>

                {/* Main Slanted PSO Parallelogram Speech Balloon */}
                <path
                    d="M 24,24 L 224,24 Q 232,24 229,32 L 210,122 Q 208,130 198,130 L 10,130 Q 2,130 5,122 L 21,32 Q 22,24 24,24 Z"
                    fill={`url(#${gradId})`}
                    stroke="#0d131a"
                    strokeWidth="3.2"
                />
                <path
                    d="M 25,26 L 223,26 Q 229,26 227,33 L 208,121 Q 206,128 197,128 L 12,128 Q 5,128 7,121 L 23,33 Z"
                    fill="none"
                    stroke={palette.border}
                    strokeWidth="1.5"
                    strokeOpacity="0.85"
                />

                {/* Scanline glaze */}
                <line
                    x1="14"
                    y1="76"
                    x2="220"
                    y2="76"
                    stroke="rgba(255,255,255,0.24)"
                    strokeWidth="1"
                />

                {/* Symbol Chat Layers */}
                <g transform="translate(18, 22)">
                    {spec.layers.map((layer) => {
                        const isSelected = selectedLayerId === layer.id;
                        const mirrorX = 200 - layer.x;
                        const isEditable = Boolean(onSelectLayer || onLayerPointerDown);
                        return (
                            <g
                                key={layer.id}
                                className="pso-symbol-layer-group"
                                onPointerDown={(e) => {
                                    if (onLayerPointerDown) {
                                        onLayerPointerDown(layer.id, e);
                                    }
                                }}
                                onClick={(e) => {
                                    if (onSelectLayer) {
                                        e.stopPropagation();
                                        onSelectLayer(layer.id);
                                    }
                                }}
                                style={{ cursor: isEditable ? "grab" : "default" }}
                            >
                                {renderSinglePart(layer, layer.id, 0, sheetUrl)}
                                {layer.pair &&
                                    renderSinglePart(
                                        { ...layer, x: mirrorX, flipX: !layer.flipX },
                                        `${layer.id}-pair`,
                                        0,
                                        sheetUrl,
                                    )}
                                {isSelected && (
                                    <>
                                        <circle
                                            cx={layer.x}
                                            cy={layer.y}
                                            r={18 * layer.scale}
                                            fill="none"
                                            stroke="#ff9e2c"
                                            strokeWidth="1.8"
                                            strokeDasharray="4 3"
                                        />
                                        {layer.pair && (
                                            <circle
                                                cx={mirrorX}
                                                cy={layer.y}
                                                r={18 * layer.scale}
                                                fill="none"
                                                stroke="rgba(255, 158, 44, 0.55)"
                                                strokeWidth="1.4"
                                                strokeDasharray="3 3"
                                            />
                                        )}
                                    </>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}

interface PsoSymbolChatEditorModalProps {
    senderName: string;
    presets: PsoSymbolChatSpec[];
    activePresetIndex: number;
    customSpriteSheetUrl?: string | null;
    onChangeCustomSpriteSheetUrl?: (dataUrl: string | null) => void;
    onSelectPresetIndex: (idx: number) => void;
    onSavePresets: (next: PsoSymbolChatSpec[]) => void;
    onTransmitSymbolChat: (spec: PsoSymbolChatSpec) => void;
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

/**
 * Full PSO Blue Burst Symbol Chat Parts List (with 215+ Ripped Sprite Sheet & Vector Parts + 30 Presets).
 */
export function PsoSymbolChatEditorModal({
    senderName,
    presets,
    activePresetIndex,
    customSpriteSheetUrl,
    onChangeCustomSpriteSheetUrl,
    onSelectPresetIndex,
    onSavePresets,
    onTransmitSymbolChat,
    onClose,
    onMouseEnter,
    onMouseLeave,
}: PsoSymbolChatEditorModalProps): JSX.Element {
    const currentSpec = presets[activePresetIndex] ?? DEFAULT_SYMBOL_PRESETS[0];
    const [draft, setDraft] = useState<PsoSymbolChatSpec>(currentSpec);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
        currentSpec.layers[currentSpec.layers.length - 1]?.id ?? null,
    );
    const [setInPair, setSetInPair] = useState<boolean>(false);
    const [activeColor, setActiveColor] = useState<PsoPartColorId>("yellow");
    const [partCategory, setPartCategory] = useState<PsoPartCategoryId>("sprite");
    const [presetBank, setPresetBank] = useState<number>(() => Math.floor(activePresetIndex / 6));
    const [isDraggingLayer, setIsDraggingLayer] = useState<boolean>(false);
    const sheetInputRef = useRef<HTMLInputElement | null>(null);

    const sheetUrl = customSpriteSheetUrl || PSO_BB_SYMBOL_SPRITE_SHEET_DATA_URL;

    useEffect(() => {
        const nextSpec = presets[activePresetIndex] ?? DEFAULT_SYMBOL_PRESETS[0];
        setDraft(nextSpec);
        setSelectedLayerId(nextSpec.layers[nextSpec.layers.length - 1]?.id ?? null);
        setPresetBank(Math.floor(activePresetIndex / 6));
    }, [activePresetIndex, presets]);

    const selectedLayer = draft.layers.find((l) => l.id === selectedLayerId) ?? null;

    const commitDraft = useCallback(
        (updater: (prev: PsoSymbolChatSpec) => PsoSymbolChatSpec) => {
            setDraft((prev) => {
                const updated = updater(prev);
                const copy = ensureThirtySymbolPresets(presets);
                copy[activePresetIndex] = updated;
                onSavePresets(copy);
                return updated;
            });
        },
        [activePresetIndex, onSavePresets, presets],
    );

    const addPartToCanvas = (part: PsoSymbolPartDef): void => {
        const newId = `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newLayer: PsoSymbolLayer = {
            id: newId,
            partId: part.id,
            x: setInPair ? 48 : 98,
            y: 54,
            scale: 1,
            color: part.defaultColor ?? activeColor,
            flipX: false,
            flipY: false,
            pair: setInPair,
        };
        commitDraft((prev) => ({
            ...prev,
            layers: [...prev.layers.slice(-11), newLayer], // Max 12 layers like PSO
        }));
        setSelectedLayerId(newId);
        setActiveColor(newLayer.color);
        playPsoSymbolChime("comm");
    };

    const updateLayerById = useCallback(
        (targetId: string, patch: Partial<PsoSymbolLayer>) => {
            commitDraft((prev) => ({
                ...prev,
                layers: prev.layers.map((l) => (l.id === targetId ? { ...l, ...patch } : l)),
            }));
        },
        [commitDraft],
    );

    const updateSelectedLayer = useCallback(
        (patch: Partial<PsoSymbolLayer>) => {
            if (!selectedLayerId) return;
            updateLayerById(selectedLayerId, patch);
        },
        [selectedLayerId, updateLayerById],
    );

    const selectLayerAndSync = useCallback(
        (layerId: string) => {
            setSelectedLayerId(layerId);
            const found = draft.layers.find((l) => l.id === layerId);
            if (found) {
                setActiveColor(found.color);
                setSetInPair(Boolean(found.pair));
            }
        },
        [draft.layers],
    );

    const cycleSelectedLayer = useCallback(
        (dir: -1 | 1) => {
            if (draft.layers.length === 0) return;
            const currentIdx = draft.layers.findIndex((l) => l.id === selectedLayerId);
            const nextIdx =
                currentIdx < 0
                    ? draft.layers.length - 1
                    : (currentIdx + dir + draft.layers.length) % draft.layers.length;
            const target = draft.layers[nextIdx];
            if (target) selectLayerAndSync(target.id);
        },
        [draft.layers, selectLayerAndSync, selectedLayerId],
    );

    const reorderSelectedLayer = useCallback(
        (dir: -1 | 1) => {
            if (!selectedLayerId) return;
            commitDraft((prev) => {
                const idx = prev.layers.findIndex((l) => l.id === selectedLayerId);
                if (idx < 0) return prev;
                const nextIdx = idx + dir;
                if (nextIdx < 0 || nextIdx >= prev.layers.length) return prev;
                const copy = [...prev.layers];
                const [item] = copy.splice(idx, 1);
                copy.splice(nextIdx, 0, item);
                return { ...prev, layers: copy };
            });
        },
        [commitDraft, selectedLayerId],
    );

    const removeSelectedLayer = (): void => {
        if (!selectedLayerId) return;
        commitDraft((prev) => {
            const nextLayers = prev.layers.filter((l) => l.id !== selectedLayerId);
            setSelectedLayerId(nextLayers[nextLayers.length - 1]?.id ?? null);
            return { ...prev, layers: nextLayers };
        });
    };

    const filteredParts = useMemo(
        () =>
            partCategory === "all"
                ? PSO_SYMBOL_PARTS
                : PSO_SYMBOL_PARTS.filter((p) => p.category === partCategory),
        [partCategory],
    );

    // Keyboard shortcuts inside Editor matching PSO Blue Burst (Arrows = Move, P = Pair, C = Color, Tab = Flip V, Ctrl = Flip H, Enter = Transmit)
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (selectedLayer) updateSelectedLayer({ x: Math.max(12, selectedLayer.x - 4) });
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                if (selectedLayer) updateSelectedLayer({ x: Math.min(188, selectedLayer.x + 4) });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (selectedLayer) updateSelectedLayer({ y: Math.max(12, selectedLayer.y - 4) });
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (selectedLayer) updateSelectedLayer({ y: Math.min(96, selectedLayer.y + 4) });
            } else if (e.key === "p" || e.key === "P") {
                e.preventDefault();
                const nextPair = !(selectedLayer?.pair ?? setInPair);
                setSetInPair(nextPair);
                if (selectedLayer) updateSelectedLayer({ pair: nextPair });
            } else if (e.key === "c" || e.key === "C") {
                e.preventDefault();
                const colorKeys = Object.keys(PART_COLORS) as PsoPartColorId[];
                const currentIdx = colorKeys.indexOf(selectedLayer?.color ?? activeColor);
                const nextColor = colorKeys[(currentIdx + 1) % colorKeys.length];
                setActiveColor(nextColor);
                if (selectedLayer) updateSelectedLayer({ color: nextColor });
            } else if (e.key === "Tab") {
                e.preventDefault();
                if (selectedLayer) updateSelectedLayer({ flipY: !selectedLayer.flipY });
            } else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                removeSelectedLayer();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    const startDraggingLayer = (
        targetLayer: PsoSymbolLayer,
        svg: SVGSVGElement,
        startClientX: number,
        startClientY: number,
        pointerId: number,
        overlappingIds: string[],
    ): void => {
        const rect = svg.getBoundingClientRect();
        const toRawCanvas = (clientX: number, clientY: number) => ({
            x: ((clientX - rect.left) / rect.width) * 240 - 18,
            y: ((clientY - rect.top) / rect.height) * 138 - 22,
        });

        const startCanvas = toRawCanvas(startClientX, startClientY);
        const startX = targetLayer.x;
        const startY = targetLayer.y;
        const mirrorX = 200 - targetLayer.x;
        const grabbedMirrorCopy =
            Boolean(targetLayer.pair) &&
            Math.hypot(startCanvas.x - mirrorX, startCanvas.y - startY) <
                Math.hypot(startCanvas.x - startX, startCanvas.y - startY);

        const wasAlreadySelected = selectedLayerId === targetLayer.id;
        selectLayerAndSync(targetLayer.id);
        setIsDraggingLayer(true);

        try {
            svg.setPointerCapture(pointerId);
        } catch {
            // ignore if pointer capture is unsupported
        }

        let didMove = false;
        const onMove = (moveEvt: PointerEvent): void => {
            if (Math.hypot(moveEvt.clientX - startClientX, moveEvt.clientY - startClientY) > 2.5) {
                didMove = true;
            }
            if (!didMove) return;

            const curCanvas = toRawCanvas(moveEvt.clientX, moveEvt.clientY);
            const dx = curCanvas.x - startCanvas.x;
            const dy = curCanvas.y - startCanvas.y;
            const nextX = grabbedMirrorCopy ? startX - dx : startX + dx;
            const nextY = startY + dy;

            updateLayerById(targetLayer.id, {
                x: Math.round(Math.max(10, Math.min(190, nextX))),
                y: Math.round(Math.max(10, Math.min(98, nextY))),
            });
        };

        const onUp = (): void => {
            setIsDraggingLayer(false);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);

            // If clicking the exact same spot without dragging and multiple parts overlap here, cycle to the next overlapping part!
            if (!didMove && wasAlreadySelected && overlappingIds.length > 1) {
                const idx = overlappingIds.indexOf(targetLayer.id);
                const nextId = overlappingIds[(idx + 1) % overlappingIds.length];
                if (nextId) {
                    selectLayerAndSync(nextId);
                }
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const getOverlappingLayersAt = (canvasX: number, canvasY: number): PsoSymbolLayer[] => {
        return [...draft.layers].reverse().filter((layer) => {
            const hitRadius = Math.max(16, 20 * layer.scale);
            const distPrimary = Math.hypot(canvasX - layer.x, canvasY - layer.y);
            const distPair = layer.pair ? Math.hypot(canvasX - (200 - layer.x), canvasY - layer.y) : Infinity;
            return Math.min(distPrimary, distPair) <= hitRadius;
        });
    };

    const onLayerPointerDown = (layerId: string, e: React.PointerEvent<SVGGElement>): void => {
        e.stopPropagation();
        const svg = e.currentTarget.ownerSVGElement;
        const clickedLayer = draft.layers.find((l) => l.id === layerId);
        if (!svg || !clickedLayer) return;

        const rect = svg.getBoundingClientRect();
        const canvasX = ((e.clientX - rect.left) / rect.width) * 240 - 18;
        const canvasY = ((e.clientY - rect.top) / rect.height) * 138 - 22;
        const overlapping = getOverlappingLayersAt(canvasX, canvasY);
        const overlappingIds = overlapping.map((l) => l.id);
        if (!overlappingIds.includes(layerId)) {
            overlappingIds.unshift(layerId);
        }

        startDraggingLayer(clickedLayer, svg, e.clientX, e.clientY, e.pointerId, overlappingIds);
    };

    const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const canvasX = ((e.clientX - rect.left) / rect.width) * 240 - 18;
        const canvasY = ((e.clientY - rect.top) / rect.height) * 138 - 22;

        const overlapping = getOverlappingLayersAt(canvasX, canvasY);
        const targetLayer = overlapping[0] ?? selectedLayer;
        if (!targetLayer) return;

        startDraggingLayer(
            targetLayer,
            svg,
            e.clientX,
            e.clientY,
            e.pointerId,
            overlapping.map((l) => l.id),
        );
    };

    const onUploadCustomSheet = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        if (!file || !onChangeCustomSpriteSheetUrl) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                onChangeCustomSpriteSheetUrl(reader.result);
                playPsoSymbolChime("rare");
            }
        };
        reader.readAsDataURL(file);
    };

    const allThirtyPresets = ensureThirtySymbolPresets(presets);
    const bankStart = presetBank * 6;
    const visibleBankPresets = allThirtyPresets.slice(bankStart, bankStart + 6);

    return (
        <div
            className="pso-symbol-editor-modal pso-interactive"
            data-testid="pso-symbol-editor-modal"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Top Header + 30 Savable PSO Symbol Chat Slots (5 Banks × 6 Slots) */}
            <div className="pso-symbol-editor-header">
                <div className="pso-symbol-editor-title">
                    <span className="pso-window-titlebar-dot" />
                    <span>SYMBOL CHAT MAKER // 30 SLOTS</span>
                </div>

                {/* Bank Selector (1-6, 7-12, 13-18, 19-24, 25-30) */}
                <div className="pso-symbol-bank-tabs">
                    {[0, 1, 2, 3, 4].map((b) => (
                        <button
                            key={b}
                            type="button"
                            className={classNames("pso-parts-cat-btn", {
                                "pso-parts-cat-btn--active": presetBank === b,
                            })}
                            onClick={() => setPresetBank(b)}
                        >
                            #{b * 6 + 1}–{b * 6 + 6}
                        </button>
                    ))}
                </div>

                <input
                    type="text"
                    className="pso-symbol-name-input"
                    value={draft.name}
                    maxLength={24}
                    onChange={(e) => commitDraft((prev) => ({ ...prev, name: e.target.value }))}
                    title="Rename Current Symbol Chat Slot"
                />

                <button
                    type="button"
                    className="pso-orb-btn pso-orb-btn--b"
                    onClick={onClose}
                    title="Close Symbol Chat Maker"
                >
                    B
                </button>
            </div>

            {/* 6 Slots inside the Active Bank */}
            <div className="pso-symbol-preset-tabs">
                {visibleBankPresets.map((p, offset) => {
                    const idx = bankStart + offset;
                    return (
                        <button
                            key={idx}
                            type="button"
                            className={classNames("pso-symbol-preset-tab", {
                                "pso-symbol-preset-tab--active": idx === activePresetIndex,
                            })}
                            onClick={() => onSelectPresetIndex(idx)}
                        >
                            #{idx + 1} {p.name}
                        </button>
                    );
                })}
            </div>

            <div className="pso-symbol-editor-body">
                {/* LEFT COLUMN: AUTHENTIC PSO "Parts List" PANEL WITH RED PILL HEADER + 215+ PARTS */}
                <div className="pso-parts-list-panel">
                    <div className="pso-parts-red-header">Parts List ({filteredParts.length})</div>
                    <div className="pso-parts-cat-bar pso-parts-cat-bar--7">
                        {(
                            [
                                ["sprite", "PSO (165)"],
                                ["shape", "SHAPES"],
                                ["base", "BASE"],
                                ["face", "FACE"],
                                ["stamp", "STAMP"],
                                ["word", "WORD"],
                                ["all", "ALL"],
                            ] as const
                        ).map(([cat, label]) => (
                            <button
                                key={cat}
                                type="button"
                                className={classNames("pso-parts-cat-btn", {
                                    "pso-parts-cat-btn--active": partCategory === cat,
                                })}
                                onClick={() => setPartCategory(cat)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="pso-parts-grid">
                        {/* Shared SVG defs for the parts list thumbnails */}
                        <svg width="0" height="0" style={{ position: "absolute" }}>
                            <defs>{renderPsoSpriteTintFilters()}</defs>
                        </svg>
                        {filteredParts.map((part) => (
                            <button
                                key={part.id}
                                type="button"
                                className={classNames("pso-part-tile-btn", {
                                    "pso-part-tile-btn--dark":
                                        part.category === "sprite" || part.category === "shape",
                                })}
                                onClick={() => addPartToCanvas(part)}
                                title={`Add ${part.label}`}
                            >
                                <svg viewBox="0 0 56 56" width="38" height="38">
                                    {renderSinglePart(
                                        {
                                            id: `prev-${part.id}`,
                                            partId: part.id,
                                            x: 28,
                                            y: 28,
                                            scale: part.spriteRect && part.spriteRect.w > 32 ? 0.68 : 0.95,
                                            color: part.defaultColor,
                                        },
                                        `prev-${part.id}`,
                                        0,
                                        sheetUrl,
                                    )}
                                </svg>
                            </button>
                        ))}
                    </div>

                    {/* Modifiable Custom Sprite Sheet Loader */}
                    <div className="pso-sheet-mod-bar">
                        <button
                            type="button"
                            className="pso-mini-act-btn"
                            onClick={() => sheetInputRef.current?.click()}
                            title="Load a modified 1024x256 PSO Symbol Chat Sprite Sheet PNG"
                        >
                            🖼️ Mod Sprite Sheet
                        </button>
                        {customSpriteSheetUrl && onChangeCustomSpriteSheetUrl && (
                            <button
                                type="button"
                                className="pso-mini-act-btn"
                                onClick={() => onChangeCustomSpriteSheetUrl(null)}
                                title="Restore Built-in Torchic09 PSO Blue Burst Sprite Sheet"
                            >
                                Default Sheet
                            </button>
                        )}
                        <input
                            ref={sheetInputRef}
                            type="file"
                            accept="image/png,image/*"
                            style={{ display: "none" }}
                            onChange={onUploadCustomSheet}
                        />
                    </div>
                </div>

                {/* RIGHT COLUMN: LIVE SLANTED BALLOON CANVAS + PSO COMMAND BOX */}
                <div className="pso-symbol-stage-col">
                    <div className="pso-symbol-canvas-frame">
                        <PsoSymbolChatBalloon
                            sender={senderName}
                            spec={draft}
                            selectedLayerId={selectedLayerId}
                            onSelectLayer={selectLayerAndSync}
                            onLayerPointerDown={onLayerPointerDown}
                            onCanvasPointerDown={onSvgPointerDown}
                            customSpriteSheetUrl={sheetUrl}
                            className={classNames({ "pso-symbol-balloon--dragging": isDraggingLayer })}
                        />
                    </div>

                    {/* Placed Parts Selector & Z-Order Strip (Click any placed part to select it directly) */}
                    <div className="pso-placed-layers-bar">
                        <button
                            type="button"
                            className="pso-mini-act-btn"
                            onClick={() => cycleSelectedLayer(-1)}
                            title="Select Previous Placed Part"
                        >
                            ◀
                        </button>
                        <div className="pso-placed-layers-scroll">
                            {draft.layers.map((layer, idx) => {
                                const partDef = PART_MAP.get(layer.partId);
                                const isSel = layer.id === selectedLayerId;
                                return (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        className={classNames("pso-placed-layer-chip", {
                                            "pso-placed-layer-chip--active": isSel,
                                        })}
                                        onClick={() => selectLayerAndSync(layer.id)}
                                        title={`Select Layer #${idx + 1}: ${partDef?.label ?? layer.partId}`}
                                    >
                                        <span
                                            className="pso-placed-layer-dot"
                                            style={{ backgroundColor: PART_COLORS[layer.color]?.hex ?? "#ffffff" }}
                                        />
                                        <span>
                                            {idx + 1}. {partDef?.label ?? layer.partId}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            className="pso-mini-act-btn"
                            onClick={() => cycleSelectedLayer(1)}
                            title="Select Next Placed Part"
                        >
                            ▶
                        </button>
                        <button
                            type="button"
                            className="pso-mini-act-btn"
                            onClick={() => reorderSelectedLayer(1)}
                            title="Bring Selected Part Forward"
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            className="pso-mini-act-btn"
                            onClick={() => reorderSelectedLayer(-1)}
                            title="Send Selected Part Backward"
                        >
                            ↓
                        </button>
                    </div>

                    {/* Authentic PSO Blue Burst Controls Readout Box */}
                    <div className="pso-symbol-controls-box">
                        <div className="pso-symbol-ctrl-row">
                            <span className="pso-key-badge pso-key-badge--cyan">✥ DRAG / ARROWS</span>
                            <span className="pso-ctrl-label">MOVE PARTS ({draft.layers.length}/12)</span>
                            <div className="pso-scale-btns">
                                <button
                                    type="button"
                                    className="pso-mini-act-btn"
                                    onClick={() =>
                                        selectedLayer &&
                                        updateSelectedLayer({
                                            scale: Math.max(0.5, +(selectedLayer.scale - 0.12).toFixed(2)),
                                        })
                                    }
                                    title="Shrink Selected Part"
                                >
                                    − Size
                                </button>
                                <button
                                    type="button"
                                    className="pso-mini-act-btn"
                                    onClick={() =>
                                        selectedLayer &&
                                        updateSelectedLayer({
                                            scale: Math.min(2.0, +(selectedLayer.scale + 0.12).toFixed(2)),
                                        })
                                    }
                                    title="Enlarge Selected Part"
                                >
                                    + Size
                                </button>
                                <button
                                    type="button"
                                    className="pso-mini-act-btn pso-mini-act-btn--danger"
                                    onClick={removeSelectedLayer}
                                    title="Delete Selected Part (Del)"
                                >
                                    Del Part
                                </button>
                            </div>
                        </div>

                        <div className="pso-symbol-ctrl-row">
                            <button
                                type="button"
                                className="pso-key-badge pso-key-badge--yellow"
                                onClick={() => {
                                    const nextPair = !(selectedLayer?.pair ?? setInPair);
                                    setSetInPair(nextPair);
                                    if (selectedLayer) updateSelectedLayer({ pair: nextPair });
                                }}
                            >
                                P
                            </button>
                            <span className="pso-ctrl-label">
                                SET IN PAIR :{" "}
                                <strong style={{ color: (selectedLayer?.pair ?? setInPair) ? "#50d282" : "#9ec8c6" }}>
                                    {(selectedLayer?.pair ?? setInPair) ? "ON" : "OFF"}
                                </strong>
                            </span>
                            <button
                                type="button"
                                className="pso-key-badge pso-key-badge--purple"
                                onClick={() => selectedLayer && updateSelectedLayer({ flipY: !selectedLayer.flipY })}
                            >
                                Tab
                            </button>
                            <span className="pso-ctrl-label">FLIP V</span>
                            <button
                                type="button"
                                className="pso-key-badge pso-key-badge--orange"
                                onClick={() => selectedLayer && updateSelectedLayer({ flipX: !selectedLayer.flipX })}
                            >
                                Ctrl
                            </button>
                            <span className="pso-ctrl-label">FLIP H</span>
                        </div>

                        <div className="pso-symbol-ctrl-row">
                            <span className="pso-key-badge pso-key-badge--green">C</span>
                            <span className="pso-ctrl-label">PART COLOR</span>
                            <div className="pso-color-swatches">
                                {(Object.keys(PART_COLORS) as PsoPartColorId[]).map((cid) => (
                                    <button
                                        key={cid}
                                        type="button"
                                        className={classNames("pso-color-swatch", {
                                            "pso-color-swatch--active":
                                                (selectedLayer?.color ?? activeColor) === cid,
                                        })}
                                        style={{ backgroundColor: PART_COLORS[cid].hex }}
                                        onClick={() => {
                                            setActiveColor(cid);
                                            if (selectedLayer) updateSelectedLayer({ color: cid });
                                        }}
                                        title={PART_COLORS[cid].label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="pso-symbol-ctrl-row">
                            <span className="pso-key-badge pso-key-badge--cyan">BG</span>
                            <span className="pso-ctrl-label">BALLOON</span>
                            <div className="pso-color-swatches">
                                {(Object.keys(BALLOON_PALETTES) as PsoBalloonColorId[]).map((bid) => (
                                    <button
                                        key={bid}
                                        type="button"
                                        className={classNames("pso-color-swatch", {
                                            "pso-color-swatch--active": draft.balloonColor === bid,
                                        })}
                                        style={{ backgroundColor: BALLOON_PALETTES[bid].fillTop }}
                                        onClick={() => commitDraft((prev) => ({ ...prev, balloonColor: bid }))}
                                        title={BALLOON_PALETTES[bid].label}
                                    />
                                ))}
                            </div>
                            <button
                                type="button"
                                className="pso-mini-act-btn"
                                onClick={() =>
                                    commitDraft(() => DEFAULT_SYMBOL_PRESETS[activePresetIndex] ?? DEFAULT_SYMBOL_PRESETS[0])
                                }
                                title="Reset Preset to Default"
                            >
                                Reset
                            </button>
                        </div>

                        <div className="pso-symbol-ctrl-footer">
                            <button
                                type="button"
                                className="pso-transmit-symbol-btn"
                                onClick={() => onTransmitSymbolChat(draft)}
                            >
                                <span className="pso-key-badge pso-key-badge--red">Enter</span>
                                <span>TRANSMIT SYMBOL CHAT OVERLAY TO ROOM (Zero Chat Clutter!)</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
