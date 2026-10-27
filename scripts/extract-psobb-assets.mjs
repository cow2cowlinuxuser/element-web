#!/usr/bin/env node
/**
 * Clean-Room PSOBB Asset Extractor for Element Classic 3D Lobby & Pioneer 2
 *
 * Cross-platform (Linux / macOS / Windows), zero-dependency Node.js CLI tool.
 * Reads a user-supplied Phantasy Star Online: Blue Burst (PSOBB) installation
 * (`<psobb_dir>/data` and `<psobb_dir>/data/data.gsl`) and extracts all 198
 * 3D models (`.nj`, `.xj`), textures (`.xvm`), stage geometry/placements (`.rel`, `.dat`),
 * 64-bone skeletal animations (`.njm`), soundtrack files (`.ogg`), and UI sound effects (`.wav`) into:
 *   `element-classic/apps/web/res/media/pso/{chars,scene,ogg,se}/`
 *
 * Usage:
 *   node scripts/extract-psobb-assets.mjs --source /path/to/PSOBB
 *   PSOBB_DIR=/path/to/PSOBB npm run extract:psobb
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 1. CLI Argument & Directory Resolution
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    let source = process.env.PSOBB_DIR || "";
    let out = "";
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if ((arg === "--source" || arg === "-s") && argv[i + 1]) {
            source = argv[++i];
        } else if (arg.startsWith("--source=")) {
            source = arg.slice("--source=".length);
        } else if ((arg === "--out" || arg === "-o") && argv[i + 1]) {
            out = argv[++i];
        } else if (arg.startsWith("--out=")) {
            out = arg.slice("--out=".length);
        } else if (!arg.startsWith("-") && !source) {
            source = arg;
        }
    }
    return { source, out };
}

function findFileCaseInsensitive(dir, targetName) {
    const direct = path.join(dir, targetName);
    if (fs.existsSync(direct)) return direct;
    if (!fs.existsSync(dir)) return null;
    const lower = targetName.toLowerCase();
    for (const entry of fs.readdirSync(dir)) {
        if (entry.toLowerCase() === lower) {
            return path.join(dir, entry);
        }
    }
    return null;
}

function resolveDataDir(inputPath) {
    if (!inputPath) {
        const defaultCandidates = [
            "F:\\Ultima-PSOBB",
            "/opt/psobb",
            path.join(process.env.HOME || "", ".wine/drive_c/PSOBB"),
            path.join(process.env.HOME || "", "PSOBB"),
        ];
        for (const cand of defaultCandidates) {
            if (cand && fs.existsSync(cand)) {
                inputPath = cand;
                break;
            }
        }
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
        console.error(
            "Error: PSOBB directory not found.\n" +
            "Usage: node scripts/extract-psobb-assets.mjs --source /path/to/PSOBB\n" +
            "   or: PSOBB_DIR=/path/to/PSOBB node scripts/extract-psobb-assets.mjs",
        );
        process.exit(1);
    }
    const gslDirect = findFileCaseInsensitive(inputPath, "data.gsl");
    if (gslDirect) return inputPath;
    const dataSub = findFileCaseInsensitive(inputPath, "data");
    if (dataSub && findFileCaseInsensitive(dataSub, "data.gsl")) return dataSub;
    console.error(`Error: Could not find data.gsl inside "${inputPath}" or "${path.join(inputPath, "data")}".`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Sega PRS Decompressor & Knuth 55-State Subtractive PRNG Decryptor
// ---------------------------------------------------------------------------

function prsDecompress(src) {
    let sp = 0;
    let bitPos = 1;
    let ctrlByte = 0;
    const out = [];

    function getBit() {
        if (--bitPos === 0) {
            ctrlByte = src[sp++] || 0;
            bitPos = 8;
        }
        const bit = ctrlByte & 1;
        ctrlByte >>>= 1;
        return bit;
    }

    while (sp <= src.length) {
        if (getBit()) {
            out.push(src[sp++] || 0);
        } else {
            let len = 0;
            let offset = 0;
            if (getBit()) {
                const b0 = src[sp++] || 0;
                const b1 = src[sp++] || 0;
                if (b0 === 0 && b1 === 0) break;
                offset = ((b1 << 8) | b0) >> 3;
                len = b0 & 7;
                if (len === 0) {
                    len = (src[sp++] || 0) + 1;
                } else {
                    len += 2;
                }
                offset -= 8192;
            } else {
                len = (getBit() << 1) | getBit();
                len += 2;
                offset = (src[sp++] || 0) - 256;
            }
            for (let i = 0; i < len; i++) {
                const idx = out.length + offset;
                out.push(idx >= 0 && idx < out.length ? out[idx] : 0);
            }
        }
    }
    return Buffer.from(out);
}

/**
 * Decrypts and PRS-decompresses a PSOBB `.cpt` or `.rlc` entry chunk.
 * Header layout:
 *   uint32LE[0] = uncompressed byte size
 *   uint32LE[1] = Knuth 55-state subtractive PRNG seed
 *   uint8[8..]  = encrypted PRS stream
 */
function decryptAndDecompressPsoChunk(buf) {
    const seed = buf.readUInt32LE(4);
    const state = new Uint32Array(56);
    let s = seed >>> 0;
    state[55] = s;
    let k = 1;
    for (let i = 1; i <= 54; i++) {
        const j = (21 * i) % 55;
        state[j] = k >>> 0;
        k = (s - k) >>> 0;
        s = state[j];
    }
    function mix() {
        for (let i = 1; i <= 24; i++) {
            state[i] = (state[i] - state[i + 31]) >>> 0;
        }
        for (let i = 25; i <= 55; i++) {
            state[i] = (state[i] - state[i - 24]) >>> 0;
        }
    }
    mix();
    mix();
    mix();
    mix();

    let idx = 55;
    function nextU32() {
        if (++idx > 55) {
            mix();
            idx = 1;
        }
        return state[idx];
    }

    const out = Buffer.from(buf.slice(8));
    const nWords = Math.floor(out.length / 4);
    for (let i = 0; i < nWords; i++) {
        out.writeUInt32LE((out.readUInt32LE(i * 4) ^ nextU32()) >>> 0, i * 4);
    }
    if (out.length % 4 !== 0) {
        const kw = nextU32();
        const base = nWords * 4;
        for (let b = 0; b < out.length % 4; b++) {
            out[base + b] ^= (kw >>> (b * 8)) & 0xff;
        }
    }
    return prsDecompress(out);
}

// ---------------------------------------------------------------------------
// 3. Sega GSL Archive & BML Container Helpers
// ---------------------------------------------------------------------------

function loadGslIndex(gslBuf) {
    const map = new Map();
    for (let i = 0; i < 4096; i++) {
        const off = i * 48;
        if (off + 48 > gslBuf.length) break;
        if (gslBuf[off] === 0) continue;
        const name = gslBuf
            .slice(off, off + 32)
            .toString("ascii")
            .replace(/\0.*$/, "");
        const fOff = gslBuf.readUInt32LE(off + 32) * 2048;
        const fSz = gslBuf.readUInt32LE(off + 36);
        if (name && fSz > 0 && fOff + fSz <= gslBuf.length) {
            map.set(name.toLowerCase(), { name, fOff, fSz });
        }
    }
    return map;
}

function getGslFile(gslBuf, gslMap, filename) {
    const entry = gslMap.get(filename.toLowerCase());
    if (!entry) return null;
    return gslBuf.slice(entry.fOff, entry.fOff + entry.fSz);
}

function parseBmlEntries(bmlBuf) {
    const count = bmlBuf.readUInt32LE(4);
    // Header flag 0x100 (e.g. 0x150) packs entries on 0x20 boundaries; without it (e.g. 0x50, bm_technic.bml)
    // every entry starts on a 0x800 sector boundary.
    const entryAlign = bmlBuf.readUInt32LE(8) & 0x100 ? 0x20 : 0x800;
    const alignUp = (v) => Math.ceil(v / entryAlign) * entryAlign;
    let dataOff = 0x40 + count * 0x40;
    if (dataOff % 0x800 !== 0) {
        dataOff = Math.ceil(dataOff / 0x800) * 0x800;
    }
    const entries = [];
    for (let i = 0; i < count; i++) {
        const o = 0x40 + i * 0x40;
        const name = bmlBuf
            .slice(o, o + 0x20)
            .toString("ascii")
            .replace(/\0.*$/, "");
        const cSize = bmlBuf.readUInt32LE(o + 0x20);
        const uSize = bmlBuf.readUInt32LE(o + 0x28);
        const pvmCSize = bmlBuf.readUInt32LE(o + 0x2c);
        const pvmUSize = bmlBuf.readUInt32LE(o + 0x30);

        const rawMain = bmlBuf.slice(dataOff, dataOff + cSize);
        const mainDec = prsDecompress(rawMain);
        dataOff = alignUp(dataOff + cSize);

        let extraDec = null;
        if (pvmCSize > 0 && dataOff + pvmCSize <= bmlBuf.length) {
            const rawExtra = bmlBuf.slice(dataOff, dataOff + pvmCSize);
            extraDec = prsDecompress(rawExtra);
            dataOff = alignUp(dataOff + pvmCSize);
        }

        entries.push({ name, cSize, uSize, pvmCSize, pvmUSize, mainDec, extraDec });
    }
    return entries;
}

// ---------------------------------------------------------------------------
// 4. Compact RelChunkVer0.20 (8-byte NJS_MKEY_SA) -> NMDM (16-byte) Converter
// ---------------------------------------------------------------------------

function convertRelMotionAt(buf, hdrPtr, numBones = 64) {
    const mdataPtr = buf.readUInt32LE(hdrPtr);
    const nbFrame = buf.readUInt32LE(hdrPtr + 4);

    const newMdata = Buffer.alloc(numBones * 16);
    const keyChunks = [];
    let curOff = 12 + numBones * 16;

    for (let b = 0; b < numBones; b++) {
        const entryOff = mdataPtr + b * 16;
        const pPos = buf.readUInt32LE(entryOff);
        const pRot = buf.readUInt32LE(entryOff + 4);
        const nbPos = buf.readUInt32LE(entryOff + 8);
        const nbRot = buf.readUInt32LE(entryOff + 12);

        let newPosPtr = 0;
        let newRotPtr = 0;
        if (nbPos > 0) {
            newPosPtr = curOff;
            const posBuf = Buffer.from(buf.slice(pPos, pPos + nbPos * 16));
            keyChunks.push(posBuf);
            curOff += posBuf.length;
        }
        if (nbRot > 0) {
            newRotPtr = curOff;
            const rotBuf = Buffer.alloc(nbRot * 16);
            for (let k = 0; k < nbRot; k++) {
                const srcOff = pRot + k * 8;
                rotBuf.writeUInt32LE(buf.readUInt16LE(srcOff), k * 16);
                rotBuf.writeInt32LE(buf.readInt16LE(srcOff + 2), k * 16 + 4);
                rotBuf.writeInt32LE(buf.readInt16LE(srcOff + 4), k * 16 + 8);
                rotBuf.writeInt32LE(buf.readInt16LE(srcOff + 6), k * 16 + 12);
            }
            keyChunks.push(rotBuf);
            curOff += rotBuf.length;
        }

        newMdata.writeUInt32LE(newPosPtr, b * 16);
        newMdata.writeUInt32LE(newRotPtr, b * 16 + 4);
        newMdata.writeUInt32LE(nbPos, b * 16 + 8);
        newMdata.writeUInt32LE(nbRot, b * 16 + 12);
    }

    const motionHdr = Buffer.alloc(12);
    motionHdr.writeUInt32LE(12, 0);
    motionHdr.writeUInt32LE(nbFrame, 4);
    motionHdr.writeUInt16LE(3, 8);
    motionHdr.writeUInt16LE(0x43, 10);

    const body = Buffer.concat([motionHdr, newMdata, ...keyChunks]);
    const nmdm = Buffer.alloc(8 + body.length);
    nmdm.write("NMDM", 0, 4, "ascii");
    nmdm.writeUInt32LE(body.length, 4);
    body.copy(nmdm, 8);
    return nmdm;
}

// ---------------------------------------------------------------------------
// 5. Asset Manifest Definitions
// ---------------------------------------------------------------------------

const DIRECT_CHAR_MODELS = [
    "plAbdy00.nj", "plAhai00.nj", "plAhed00.nj",
    "plBbdy00.nj", "plBhai00.nj", "plBhed00.nj",
    "plCbdy00.nj", "plChed00.nj",
    "plDbdy00.nj", "plDcap00.nj", "plDhai00.nj", "plDhed00.nj",
    "plEbdy00.nj", "plEhed00.nj",
    "plFbdy00.nj", "plFhed00.nj",
    "plGbdy00.nj", "plGcap00.nj", "plGhai00.nj", "plGhed00.nj",
    "plHbdy00.nj", "plHcap00.nj", "plHhai00.nj", "plHhed00.nj",
    "plIbdy00.nj", "plIcap00.nj", "plIhai00.nj", "plIhed00.nj",
    "plJbdy00.nj", "plJhed00.nj",
    "plKbdy00.nj", "plKcap00.nj", "plKhai00.nj", "plKhed00.nj",
    "plLbdy00.nj", "plLcap00.nj", "plLhai00.nj", "plLhed00.nj",
    "plOhai00.nj", "plOhed00.nj",
    "plPhai00.nj", "plPhed00.nj",
    "plQhai00.nj", "plQhed00.nj",
    "plRhai00.nj", "plRhed00.nj",
    "plShai00.nj", "plShed00.nj",
    "plThai00.nj", "plThed00.nj",
    "plUhed00.nj", "plVhed00.nj", "plWhed00.nj", "plXhed00.nj", "plYhed00.nj",
];

const PLAYER_CLASS_PREFIXES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const AFS_DEFAULT_COSTUME_INDICES = [0, 1, 2, 3, 4, 88, 89, 108, 110];

const DIRECT_SCENE_FILES = [
    "map_ancient01.xvm", "map_ancient01_00c.rel", "map_ancient01_00n.rel",
    "map_cave01.xvm", "map_cave01_00c.rel", "map_cave01_00n.rel",
    "map_city00.xvm", "map_city00_00c.rel", "map_city00_00n.rel",
    "map_city00_00e.dat", "map_city00_00e_c1.dat", "map_city00_00e_d.dat", "map_city00_00e_s.dat",
    "map_city00_00o.dat", "map_city00_00o_c1.dat", "map_city00_00o_d.dat", "map_city00_00o_s.dat",
    "map_forest01.xvm", "map_forest01c.rel", "map_forest01n.rel",
    "map_labo00.xvm", "map_labo00_00c.rel", "map_labo00_00n.rel",
    "map_lobby_01.xvm", "map_lobby_01c.rel", "map_lobby_01n.rel",
    "map_machine01.xvm", "map_machine01_00c.rel", "map_machine01_00n.rel",
    "map_ruins01.xvm", "map_ruins01_00c.rel", "map_ruins01_00n.rel",
];

const DIRECT_OGG_FILES = [
    "CITY.ogg", "GUILD.ogg", "LABO.ogg", "LOBBY.ogg", "MEDICAL.ogg", "SHOP.ogg", "slbgm_forest.ogg",
];

// Sample indices are 0-based in bank order, matching PAC Manager's numbering. The game's own sound ids
// are noted where its menu code was traced: it opens windows and confirms with the same sound.
const SFX_TARGETS = [
    { out: "cursor.wav", pac: "common.pac", index: 182 }, // 0x56f
    { out: "cancel.wav", pac: "common.pac", index: 183 }, // 0x570
    { out: "menu_close.wav", pac: "common.pac", index: 186 },
    { out: "use_item.wav", pac: "common.pac", index: 198 },
    { out: "confirm.wav", pac: "common.pac", index: 203 }, // 0x585
    { out: "menu_open.wav", pac: "common.pac", index: 203 }, // 0x585
    { out: "game_start.wav", pac: "city.pac", index: 7 },
];

/**
 * A `data/sound/*.pac` bank is a run of RIFF-less WAV samples: a 16-byte PCM `fmt ` body
 * (optionally padded to 18), chunks such as `JUNK`/`cue `, then `data`, each aligned with padding.
 */
function splitPacSamples(buf) {
    const headerAt = (h) => {
        if (buf.readUInt16LE(h) !== 1) return null;
        const channels = buf.readUInt16LE(h + 2);
        const rate = buf.readUInt32LE(h + 4);
        const block = buf.readUInt16LE(h + 12);
        if ((channels !== 1 && channels !== 2) || rate < 4000 || rate > 96000) return null;
        if (buf.readUInt32LE(h + 8) !== rate * block) return null;
        const c = buf.readUInt16LE(h + 16) === 0 ? h + 18 : h + 16;
        return /^[A-Za-z ]{4}$/.test(buf.toString("ascii", c, c + 4)) ? { h, chunks: c } : null;
    };
    const heads = [];
    for (let h = 0; h + 28 <= buf.length; h += 2) {
        const head = headerAt(h);
        if (head) {
            heads.push(head);
            h += 26;
        }
    }
    return heads.map((head, i) => {
        const end = i + 1 < heads.length ? heads[i + 1].h : buf.length;
        let pcm = Buffer.alloc(0);
        for (let c = head.chunks; c + 8 <= end; ) {
            const tag = buf.toString("ascii", c, c + 4);
            const size = buf.readUInt32LE(c + 4);
            if (tag === "data") {
                // The size is repeated after a copy of the first two samples; audio starts after the repeat.
                const start = c + 16 <= end && buf.readUInt32LE(c + 12) === size ? c + 16 : c + 8;
                pcm = buf.subarray(start, Math.min(start + size, end));
                break;
            }
            c += 8 + size;
        }
        const wav = Buffer.alloc(44);
        wav.write("RIFF", 0, "ascii");
        wav.writeUInt32LE(36 + pcm.length, 4);
        wav.write("WAVEfmt ", 8, "ascii");
        wav.writeUInt32LE(16, 16);
        buf.copy(wav, 20, head.h, head.h + 16);
        wav.write("data", 36, "ascii");
        wav.writeUInt32LE(pcm.length, 40);
        return Buffer.concat([wav, pcm]);
    });
}

const NPC_BML_TARGETS = [
    { out: "npc_trunk", bml: "bm_n_trunk_i_body.bml", stripNjtl: true },
    { out: "npc_nurse", bml: "bm_n_nurse_i_body.bml", stripNjtl: true },
    { out: "npc_tekker", bml: "bm_n_kanteif_i_body.bml", stripNjtl: true },
    { out: "npc_tyrell", bml: "bm_n_soutoku_i_body.bml", stripNjtl: true },
    { out: "npc_irene", bml: "bm_n_hisyo_i_body.bml", stripNjtl: true },
    { out: "npc_hakase", bml: "bm_n_hakase_i_body.bml", stripNjtl: true },
    { out: "npc_gunm", bml: "bm_n_gunm_i_body.bml", stripNjtl: true },
    { out: "npc_gunb2", bml: "bm_n_gunb2_i_body.bml", stripNjtl: true },
    { out: "npc_shop_weap", bml: "bm_n_emm_i_body.bml", stripNjtl: true },
    { out: "npc_shop_armor", bml: "bm_n_efm_i_body.bml", stripNjtl: true },
    { out: "npc_shop_tool", bml: "bm_n_emw_i_body.bml", stripNjtl: true },
    { out: "npc_cit_efw", bml: "bm_n_efw_i_body.bml", stripNjtl: true },
    { out: "npc_cit_etw", bml: "bm_n_etw_i_body.bml", stripNjtl: true },
    { out: "npc_cit_eom", bml: "bm_n_eom_i_body.bml", stripNjtl: true },
    { out: "npc_cit_efsm", bml: "bm_n_efsm_i_body_3.bml", stripNjtl: true },
    { out: "npc_momoka", bml: "bm_npc_momoka.bml", stripNjtl: false },
    { out: "npc_hosa", bml: "bm_npc_hosa.bml", stripNjtl: false },
    { out: "npc_hosa2", bml: "bm_npc_hosa2.bml", stripNjtl: false },
    { out: "npc_kenkyu", bml: "bm_npc_kenkyu.bml", stripNjtl: false },
    { out: "npc_kenkyu2", bml: "bm_npc_kenkyu2.bml", stripNjtl: false },
    { out: "npc_kenkyu_w", bml: "bm_npc_kenkyu_w.bml", stripNjtl: false },
    { out: "npc_soutokufu", bml: "bm_npc_soutokufu.bml", stripNjtl: false },
];

const BML_MOTION_TARGETS = [
    { bml: "npcapcmot.bml", entry: "pxuZ00_B02_M_body.njm", out: "mot_wait_town_m.njm" },
    { bml: "npcapcmot.bml", entry: "pxuS01_B02_W_body.njm", out: "mot_wait_town_w.njm" },
    { bml: "npcapcmot.bml", entry: "pxuS01_B02_F_body.njm", out: "mot_wait_town_f.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_B01_M_body.njm", out: "mot_walk_town_m.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_B01_W_body.njm", out: "mot_walk_town_w.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_B01_F_body.njm", out: "mot_walk_town_f.njm" },
    { bml: "npcapcmot.bml", entry: "pxuS01_A06_M_body.njm", out: "mot_wait_battle_m.njm" },
    { bml: "npcapcmot.bml", entry: "pxuS01_A06_W_body.njm", out: "mot_wait_battle_w.njm" },
    { bml: "npcapcmot.bml", entry: "pxuS01_A06_F_body.njm", out: "mot_wait_battle_f.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_A01_M_body.njm", out: "mot_run_m.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_A01_W_body.njm", out: "mot_run_w.njm" },
    { bml: "npcapcmot.bml", entry: "pxuZ00_A01_F_body.njm", out: "mot_run_f.njm" },
];

/*
 * plymotiondata.rlc holds one global list of 572 player motions (0-based here; the community
 * catalogue at docs.google.com/spreadsheets/d/1e0WmX1Q9BImJy6eG1pWr7PFs5gRppUNs1lXRVOsvBgo is 1-based).
 * Suffixes: _m = male skeleton, _w = female skeleton, _f = FOmarl/FOnewearl skeleton.
 */
const RLC_MOTION_TARGETS = [
    { idx: 98, out: "mot_cast_m.njm" },
    { idx: 328, out: "mot_cast_w.njm" },
    { idx: 481, out: "mot_cast_f.njm" },
    { idx: 99, out: "mot_atk1_m.njm" },
    { idx: 100, out: "mot_atk2_m.njm" },
    { idx: 101, out: "mot_atk3_m.njm" },
    { idx: 329, out: "mot_atk1_w.njm" },
    { idx: 330, out: "mot_atk2_w.njm" },
    { idx: 331, out: "mot_atk3_w.njm" },
    { idx: 482, out: "mot_atk1_f.njm" },
    { idx: 483, out: "mot_atk2_f.njm" },
    { idx: 484, out: "mot_atk3_f.njm" },
    { idx: 237, out: "mot_sit_m.njm" },
    { idx: 442, out: "mot_sit_w.njm" },
    { idx: 208, out: "mot_wave_m.njm" },
    { idx: 417, out: "mot_wave_w.njm" },
    { idx: 216, out: "mot_cheer_m.njm" },
    { idx: 425, out: "mot_cheer_w.njm" },
    { idx: 224, out: "mot_dance_m.njm" },
    { idx: 433, out: "mot_dance_w.njm" },
    { idx: 222, out: "mot_bow_m.njm" },
    { idx: 431, out: "mot_bow_w.njm" },
];

/** The REL footer's root pointer sits 0x14 bytes past the motion header in every plymotiondata chunk. */
function findRelMotionHeader(relChunk) {
    const root = relChunk.readUInt32LE(relChunk.length - 32 + 0x10);
    return root - 0x14;
}

const CPT_TOWN_NPC_HDRS = [0x1a64, 0x0d00, 0x2770, 0x347c];

const CITY_STAGE_OBJECT_MAP = {
    "fe_obj_o_aircar01.nj": "obj_aircar01.nj",
    "fd_obj_warp_big.xj": "obj_warp_big.xj",
    "fd_obj_warp_small.xj": "obj_warp_small.xj",
    "fd_obj_n_elv_bmerge4.xj": "obj_elv_alcove.xj",
    "fd_obj_shopdoor_01.xj": "obj_shopdoor.xj",
    "hunter_door.xj": "obj_hunter_door.xj",
    "fe_obj_o_medical_door01l.xj": "obj_med_door.xj",
};

const DIRECT_UI_XVM_TARGETS = [
    { out: "texture_e.xvm", candidates: ["texture_e.xvm", "textureenglish.xvm"] },
    { out: "ccconsole_e.xvm", candidates: ["ccconsole_e.xvm", "ccconsole_j.xvm"] },
    { out: "infoicon.xvm", candidates: ["infoicon.xvm"] },
    { out: "radermapframe.xvm", candidates: ["radermapframe.xvm"] },
    { out: "ed128_font.xvm", candidates: ["ed128_font.xvm"] },
];

const PRS_UI_XVM_TARGETS = [
    { out: "f256_hyouji.xvm", prs: "f256_hyouji.prs" },
    { out: "f256_hyoujismall.xvm", prs: "f256_hyoujismall.prs" },
    { out: "f256_player_prate.xvm", prs: "f256_player_prate.prs" },
    { out: "f256_player_tex_eng.xvm", prs: "f256_player_tex_eng.prs" },
    { out: "f256_selectgamen_a_eng.xvm", prs: "f256_selectgamen_a_eng.prs" },
    { out: "f512_midashi_eng.xvm", prs: "f512_midashi_eng.prs" },
    { out: "f256_uniticon.xvm", prs: "f256_uniticon.prs" },
    { out: "f064_mucarsol.xvm", prs: "f064_mucarsol.prs" },
    { out: "f064_multiconfirm.xvm", prs: "f064_multiconfirm.prs" },
    { out: "f128_controller.xvm", prs: "f128_controller.prs" },
    { out: "f256_backtext.xvm", prs: "f256_backtext.prs" },
    { out: "f512_multiplay.xvm", prs: "f512_multiplay.prs" },
    { out: "nowloading.xvm", prs: "nowloading.prs" },
];

// ---------------------------------------------------------------------------
// 6. Main Extraction Pipeline
// ---------------------------------------------------------------------------

function buildPlayerCostumeXvmFromAfs(afsBuf) {
    const xvrs = [];
    for (const idx of AFS_DEFAULT_COSTUME_INDICES) {
        const off = afsBuf.readUInt32LE(8 + idx * 8);
        const sz = afsBuf.readUInt32LE(12 + idx * 8);
        xvrs.push(afsBuf.slice(off, off + sz));
    }
    const hdr = Buffer.alloc(64);
    hdr.write("XVMH", 0, 4, "ascii");
    hdr.writeUInt32LE(56, 4);
    hdr.writeUInt32LE(xvrs.length, 8);
    return Buffer.concat([hdr, ...xvrs]);
}

function main() {
    const { source, out } = parseArgs(process.argv);
    const dataDir = resolveDataDir(source);
    const candidateWebPso = path.resolve(__dirname, "../apps/web/res/media/pso");
    const defaultOutDir = fs.existsSync(path.resolve(__dirname, "../apps/web"))
        ? candidateWebPso
        : path.resolve(__dirname, "../element-classic/apps/web/res/media/pso");
    const outDir = out ? path.resolve(out) : defaultOutDir;

    const charsOut = path.join(outDir, "chars");
    const sceneOut = path.join(outDir, "scene");
    const oggOut = path.join(outDir, "ogg");
    const uiOut = path.join(outDir, "ui");
    const seOut = path.join(outDir, "se");
    fs.mkdirSync(charsOut, { recursive: true });
    fs.mkdirSync(sceneOut, { recursive: true });
    fs.mkdirSync(oggOut, { recursive: true });
    fs.mkdirSync(uiOut, { recursive: true });

    const gslPath = findFileCaseInsensitive(dataDir, "data.gsl");
    console.log(`[PSOBB Extractor] Reading archive: ${gslPath}`);
    const gslBuf = fs.readFileSync(gslPath);
    const gslMap = loadGslIndex(gslBuf);
    console.log(`[PSOBB Extractor] Indexed ${gslMap.size} files inside data.gsl`);

    let extractedCount = 0;
    const writeAsset = (subDir, name, buf) => {
        const dest = path.join(outDir, subDir, name);
        fs.writeFileSync(dest, buf);
        extractedCount++;
    };

    // A. Direct playable character meshes (.nj)
    for (const name of DIRECT_CHAR_MODELS) {
        const loose = findFileCaseInsensitive(dataDir, name);
        if (loose) {
            writeAsset("chars", name, fs.readFileSync(loose));
        } else {
            const fromGsl = getGslFile(gslBuf, gslMap, name);
            if (fromGsl) writeAsset("chars", name, fromGsl);
        }
    }

    // B. Playable class default costume XVM packs built from pl*tex.afs
    for (const c of PLAYER_CLASS_PREFIXES) {
        const afsName = `pl${c}tex.afs`;
        const afsPath = findFileCaseInsensitive(dataDir, afsName);
        if (afsPath) {
            const xvmBuf = buildPlayerCostumeXvmFromAfs(fs.readFileSync(afsPath));
            writeAsset("chars", `pl${c}tex.xvm`, xvmBuf);
        }
    }

    // C. Direct stage geometry (.rel), textures (.xvm), and event/object tables (.dat)
    const sceneSrcDir = findFileCaseInsensitive(dataDir, "scene") || dataDir;
    for (const name of DIRECT_SCENE_FILES) {
        const looseScene = findFileCaseInsensitive(sceneSrcDir, name);
        const looseRoot = findFileCaseInsensitive(dataDir, name);
        const fromGsl = getGslFile(gslBuf, gslMap, name);
        if (looseScene) {
            writeAsset("scene", name, fs.readFileSync(looseScene));
        } else if (fromGsl) {
            writeAsset("scene", name, fromGsl);
        } else if (looseRoot) {
            writeAsset("scene", name, fs.readFileSync(looseRoot));
        }
    }

    // D. Direct soundtrack files (.ogg)
    const oggSrcDir = findFileCaseInsensitive(dataDir, "ogg") || dataDir;
    for (const name of DIRECT_OGG_FILES) {
        const looseOgg = findFileCaseInsensitive(oggSrcDir, name);
        if (looseOgg) {
            writeAsset("ogg", name, fs.readFileSync(looseOgg));
        }
    }

    // D2. UI sound effects from the `data/sound/*.pac` sample banks (.wav)
    const soundSrcDir = findFileCaseInsensitive(dataDir, "sound");
    if (soundSrcDir) {
        fs.mkdirSync(seOut, { recursive: true });
        const banks = new Map();
        for (const target of SFX_TARGETS) {
            if (!banks.has(target.pac)) {
                const pacPath = findFileCaseInsensitive(soundSrcDir, target.pac);
                banks.set(target.pac, pacPath ? splitPacSamples(fs.readFileSync(pacPath)) : []);
            }
            const sample = banks.get(target.pac)[target.index];
            if (sample) writeAsset("se", target.out, sample);
        }
    }

    // E. 22 Pioneer 2 NPCs from data.gsl (.bml -> .nj + .xvm)
    for (const npc of NPC_BML_TARGETS) {
        const bmlBuf = getGslFile(gslBuf, gslMap, npc.bml);
        if (!bmlBuf) continue;
        const entries = parseBmlEntries(bmlBuf);
        const njEntry = entries.find((e) => e.name.endsWith(".nj")) || entries[0];
        if (njEntry && njEntry.mainDec) {
            let njBuf = njEntry.mainDec;
            if (npc.stripNjtl) {
                const njcmIdx = njBuf.indexOf("NJCM", 0, "ascii");
                if (njcmIdx > 0) njBuf = njBuf.slice(njcmIdx);
            }
            writeAsset("chars", `${npc.out}.nj`, njBuf);
            if (njEntry.extraDec && njEntry.extraDec.slice(0, 4).toString("ascii") === "XVMH") {
                writeAsset("chars", `${npc.out}.xvm`, njEntry.extraDec);
            }
        }
    }

    // F. Core Town/Battle Motions from npcapcmot.bml
    const parsedMotionBmls = new Map();
    for (const bmlName of ["npcapcmot.bml"]) {
        const bmlBuf =
            getGslFile(gslBuf, gslMap, bmlName) ||
            (() => {
                const p = findFileCaseInsensitive(dataDir, bmlName);
                return p ? fs.readFileSync(p) : null;
            })();
        if (bmlBuf) {
            parsedMotionBmls.set(bmlName, parseBmlEntries(bmlBuf));
        }
    }
    for (const target of BML_MOTION_TARGETS) {
        const entries = parsedMotionBmls.get(target.bml) || [];
        const match = entries.find((e) => e.name.toLowerCase() === target.entry.toLowerCase());
        if (match && match.mainDec) {
            writeAsset("chars", target.out, match.mainDec);
        }
    }

    // G. Cast/Emote/Attack/Sit Motions from plymotiondata.rlc (Knuth PRNG + PRS + NMDM)
    const rlcRaw = getGslFile(gslBuf, gslMap, "plymotiondata.rlc");
    if (rlcRaw) {
        for (const target of RLC_MOTION_TARGETS) {
            const off = rlcRaw.readUInt32BE(0x20 + target.idx * 8);
            const sz = rlcRaw.readUInt32BE(0x20 + target.idx * 8 + 4);
            if (off > 0 && sz > 8 && off + sz <= rlcRaw.length) {
                const relChunk = decryptAndDecompressPsoChunk(rlcRaw.slice(off, off + sz));
                const nmdm = convertRelMotionAt(relChunk, findRelMotionHeader(relChunk), 64);
                writeAsset("chars", target.out, nmdm);
            }
        }
    }

    // H. 4 Town NPC Idle/Talk Motions from plymotionnpctown.cpt (Knuth PRNG + PRS + NMDM)
    const cptRaw = getGslFile(gslBuf, gslMap, "plymotionnpctown.cpt");
    if (cptRaw) {
        const cptDec = decryptAndDecompressPsoChunk(cptRaw);
        for (let i = 0; i < CPT_TOWN_NPC_HDRS.length; i++) {
            const nmdm = convertRelMotionAt(cptDec, CPT_TOWN_NPC_HDRS[i], 64);
            writeAsset("chars", `mot_npc_town_${i}.njm`, nmdm);
        }
    }

    // I. 3D Photon Chair from bm_ply_photon_chair.bml (entry[1] = fs_obj_lobby_isu.nj)
    const chairBml = getGslFile(gslBuf, gslMap, "bm_ply_photon_chair.bml");
    if (chairBml) {
        const entries = parseBmlEntries(chairBml);
        const lobbyChair = entries.find((e) => e.name === "fs_obj_lobby_isu.nj") || entries[1] || entries[0];
        if (lobbyChair) {
            writeAsset("chars", "obj_photon_chair.nj", lobbyChair.mainDec);
            if (lobbyChair.extraDec) {
                writeAsset("chars", "obj_photon_chair.xvm", lobbyChair.extraDec);
            }
        }
    }

    // J. Pioneer 2 Interactive Stage Objects from bm_obj_city_common.bml & .xvm
    const cityCommonXvm = getGslFile(gslBuf, gslMap, "bm_obj_city_common.xvm");
    if (cityCommonXvm) {
        writeAsset("scene", "obj_city_common.xvm", cityCommonXvm);
    }
    const cityCommonBml = getGslFile(gslBuf, gslMap, "bm_obj_city_common.bml");
    if (cityCommonBml) {
        for (const entry of parseBmlEntries(cityCommonBml)) {
            const outName = CITY_STAGE_OBJECT_MAP[entry.name.toLowerCase()];
            if (outName && entry.mainDec) {
                writeAsset("scene", outName, entry.mainDec);
            }
        }
    }

    // J2. Technique effect meshes (.xj), their motions (.njm) and textures from bm_technic.bml / bm_tec_regurar.bml
    fs.mkdirSync(path.join(outDir, "tech"), { recursive: true });
    for (const bmlName of ["bm_technic.bml", "bm_tec_regurar.bml"]) {
        const bmlBuf = getGslFile(gslBuf, gslMap, bmlName);
        if (!bmlBuf) continue;
        for (const entry of parseBmlEntries(bmlBuf)) {
            const magic = entry.mainDec ? entry.mainDec.slice(0, 4).toString("ascii") : "";
            if (magic === "NJCM" || magic === "NMDM") writeAsset("tech", entry.name.toLowerCase(), entry.mainDec);
        }
    }
    for (const xvmName of ["technic.xvm", "tecregular.xvm"]) {
        const xvmBuf = getGslFile(gslBuf, gslMap, xvmName);
        if (xvmBuf && xvmBuf.slice(0, 4).toString("ascii") === "XVMH") writeAsset("tech", xvmName, xvmBuf);
    }

    // K. Direct & PRS-Compressed PSOBB UI Texture Atlases (`ui/*.xvm`)
    for (const target of DIRECT_UI_XVM_TARGETS) {
        let buf = null;
        for (const cand of target.candidates) {
            const loose = findFileCaseInsensitive(dataDir, cand);
            if (loose) {
                buf = fs.readFileSync(loose);
                break;
            }
            const fromGsl = getGslFile(gslBuf, gslMap, cand);
            if (fromGsl) {
                buf = fromGsl;
                break;
            }
        }
        if (buf && buf.slice(0, 4).toString("ascii") === "XVMH") {
            writeAsset("ui", target.out, buf);
        }
    }
    for (const target of PRS_UI_XVM_TARGETS) {
        const loose = findFileCaseInsensitive(dataDir, target.prs);
        const rawPrs = loose ? fs.readFileSync(loose) : getGslFile(gslBuf, gslMap, target.prs);
        if (rawPrs) {
            const dec = prsDecompress(rawPrs);
            if (dec && dec.slice(0, 4).toString("ascii") === "XVMH") {
                writeAsset("ui", target.out, dec);
            }
        }
    }

    // L. Parse `unitxt_e.prs` (or `unitxt_j.prs`) and compile `game-pack.json` directly from `.rel`, `.dat`, and `unitxt`
    const unitxtRaw =
        (() => {
            const p = findFileCaseInsensitive(dataDir, "unitxt_e.prs") || findFileCaseInsensitive(dataDir, "unitxt_j.prs");
            return p ? fs.readFileSync(p) : null;
        })() ||
        getGslFile(gslBuf, gslMap, "unitxt_e.prs") ||
        getGslFile(gslBuf, gslMap, "unitxt_j.prs");
    const unitxtCategories = unitxtRaw ? parseUnitxtPrsCategories(prsDecompress(unitxtRaw)) : [];

    const compiledGamePack = compileGamePackManifest(sceneOut, unitxtCategories);
    fs.writeFileSync(path.join(outDir, "game-pack.json"), JSON.stringify(compiledGamePack, null, 2));
    console.log(
        `[PSOBB Extractor] Compiled clean-room game-pack.json (${Object.keys(compiledGamePack.stages).length} stages, ${Object.values(compiledGamePack.cityNpcLayouts).reduce((a, b) => a + b.length, 0)} NPC placements, ${compiledGamePack.cityStageObjects.length} stage objects, ${unitxtCategories.length} unitxt categories)`,
    );

    console.log(
        `[PSOBB Extractor] Successfully extracted ${extractedCount} binary assets + game-pack.json to:\n  ${outDir}`,
    );
}

// ---------------------------------------------------------------------------
// 7. Clean-Room Game Pack Compiler (`n.rel` Sections + `*e*.dat` + `*o.dat`)
// ---------------------------------------------------------------------------

function parseRelSectionTable(relBuf) {
    const secs = new Map();
    if (!relBuf || relBuf.length < 64) return secs;
    const rootOff = relBuf.readUInt32LE(relBuf.length - 16);
    if (rootOff === 0 || rootOff + 24 > relBuf.length) return secs;
    const secCount = relBuf.readUInt32LE(rootOff + 8);
    const secTblOff = relBuf.readUInt32LE(rootOff + 16);
    for (let s = 0; s < Math.min(secCount, 96); s++) {
        const so = secTblOff + s * 52;
        if (so + 52 > relBuf.length) break;
        const id = relBuf.readInt32LE(so);
        const sx = relBuf.readFloatLE(so + 4);
        const sy = relBuf.readFloatLE(so + 8);
        const sz = relBuf.readFloatLE(so + 12);
        const sry = relBuf.readInt32LE(so + 20);
        secs.set(id, { sx, sy, sz, sry });
    }
    return secs;
}

function transformSectionLocalToWorld(secs, secId, lx, ly, lz, ry, scale = 0.08) {
    const sec = secs.get(secId) || { sx: 0, sy: 0, sz: 0, sry: 0 };
    const ang = (sec.sry * 2 * Math.PI) / 65536;
    const cosY = Math.cos(ang);
    const sinY = Math.sin(ang);
    const wx = Number(((sec.sx + (lx * cosY + lz * sinY)) * scale).toFixed(2));
    const wy = Number(((sec.sy + ly) * scale).toFixed(2));
    const wz = Number(((sec.sz + (-lx * sinY + lz * cosY)) * scale).toFixed(2));
    const wyaw = Number((((((sec.sry + ry) * 360) / 65536) % 360) + 360).toFixed(1)) % 360;
    return { wx, wy, wz, wyaw };
}

function mapNpcBinaryEntryToSpec(idx, typeHex, secId, f60, wanderRadius, wx, wy, wz, wyaw, layoutKey) {
    const isOfflineLike = layoutKey === "e_d" || layoutKey === "e_c1";
    // Map PSOBB `e.dat` NPC type ID (`typeHex`) + script trigger (`f60`) to model & role
    let npcModelId = "npc_cit_efw";
    let c = "humar";
    let name = `PIONEER CITIZEN #${idx}`;

    if (f60 === 850) {
        npcModelId = isOfflineLike ? "npc_shop_armor" : "npc_trunk";
        c = isOfflineLike ? "humar" : "fomarl";
        name = isOfflineLike ? "GUILD OFFICER [Offline Counter]" : "GUILD CLERK [Quest Counter]";
    } else if (f60 === 840) {
        npcModelId = "npc_trunk";
        c = "fonewearl";
        name = "BANK CLERK [Check Room]";
    } else if (f60 === 830 || typeHex === 0x1c) {
        npcModelId = "npc_tekker";
        c = "fomar";
        name = "THE TEKKER [Special Appraiser]";
    } else if (f60 === 800 || typeHex === 0x0c) {
        npcModelId = "npc_shop_weap";
        c = "humar";
        name = "WEAPON SHOP [Arms Dealer]";
    } else if (f60 === 820) {
        npcModelId = "npc_shop_tool";
        c = "hunewearl";
        name = "TOOL SHOP [Items & Tech Disks]";
    } else if (f60 === 810) {
        npcModelId = "npc_shop_armor";
        c = "ramar";
        name = "ARMOR SHOP [Frames & Barriers]";
    } else if (f60 === 860) {
        npcModelId = "npc_nurse";
        c = "fomarl";
        name = "MEDICAL NURSE [Heal Counter]";
    } else if (typeHex === 0x1f) {
        npcModelId = "npc_nurse";
        c = "fomarl";
        name = "CLINIC NURSE [Medical Lobby]";
    } else if (typeHex === 0x1b || f60 === 1) {
        npcModelId = "npc_tyrell";
        c = "fomar";
        name = "👑 PRINCIPAL COLIN TYRELL";
    } else if (typeHex === 0x20 || f60 === 20) {
        npcModelId = "npc_irene";
        c = "fomarl";
        name = "SECRETARY IRENE";
    } else if (typeHex === 0x100 || f60 === 870) {
        npcModelId = "npc_momoka";
        c = "fonewearl";
        name = "MOMOKA [Government Quest]";
    } else if (secId === 41 && typeHex === 0x1e) {
        npcModelId = "npc_hakase";
        c = "fonewm";
        name = f60 === 30 ? "LAB RESEARCHER [Alpha]" : "LAB RESEARCHER [Beta]";
    } else if (typeHex === 0x1a || (typeHex === 0x09 && idx === 3)) {
        npcModelId = "npc_gunb2";
        c = "ramar";
        name = f60 === 230 ? "CHALLENGE OFFICER [Patrol]" : "MILITARY GUARD [Ragol Gate S]";
    } else if (typeHex === 0x19 || (typeHex === 0x09 && idx === 4)) {
        npcModelId = "npc_gunm";
        c = "ramar";
        name = "MILITARY GUARD [Ragol Gate N]";
    } else if (secId === 30) {
        npcModelId = "npc_cit_etw";
        c = "ramarl";
        name = "PLAZA SHOPPER [Sec 30]";
    } else if (typeHex === 0x0a || typeHex === 0x02) {
        npcModelId = "npc_cit_etw";
        c = "ramarl";
        name = "PIONEER CITIZEN [Concourse S]";
    } else if (typeHex === 0x05 || typeHex === 0x0d) {
        npcModelId = isOfflineLike ? "npc_cit_efw" : "npc_cit_eom";
        c = "fomar";
        name = wz < -5 ? "PIONEER CITIZEN [South Promenade]" : "PIONEER CITIZEN [Central Bridge]";
    } else if (typeHex === 0x1e) {
        npcModelId = isOfflineLike ? "npc_cit_efw" : "npc_cit_efsm";
        c = "humar";
        name = "PIONEER CITIZEN [West Promenade]";
    } else {
        npcModelId = isOfflineLike ? "npc_cit_eom" : "npc_cit_efw";
        c = "fomarl";
        name = "PIONEER CITIZEN [Concourse N]";
    }

    const spec = {
        id: `npc-${layoutKey}-${idx}`,
        name,
        x: wx,
        y: Math.max(0, wy),
        z: wz,
        yawDeg: wyaw,
        c,
        npcModelId,
    };
    if (wanderRadius > 0) {
        spec.wanderRadius = Math.round(wanderRadius);
    }
    return spec;
}

function parseUnitxtPrsCategories(unitxtBuf) {
    if (!unitxtBuf || unitxtBuf.length < 16) return [];
    const catCount = unitxtBuf.readUInt32LE(0);
    if (catCount === 0 || catCount > 256) return [];
    const counts = [];
    for (let i = 0; i < catCount; i++) {
        counts.push(unitxtBuf.readUInt32LE(4 + i * 4));
    }
    let ptrOff = 4 + catCount * 4;
    const categories = [];
    for (let c = 0; c < catCount; c++) {
        const strs = [];
        for (let s = 0; s < counts[c]; s++) {
            if (ptrOff + 4 > unitxtBuf.length) break;
            const strOff = unitxtBuf.readUInt32LE(ptrOff);
            ptrOff += 4;
            let end = strOff;
            while (end + 1 < unitxtBuf.length && unitxtBuf.readUInt16LE(end) !== 0) {
                end += 2;
            }
            const rawStr =
                strOff < unitxtBuf.length && end >= strOff
                    ? unitxtBuf.slice(strOff, end).toString("utf16le").replace(/\r?\n/g, " ").trim()
                    : "";
            strs.push(rawStr);
        }
        categories.push(strs);
    }
    return categories;
}

function buildCompiledUiMenuSpec(unitxtCategories) {
    const getCat = (c) => (Array.isArray(unitxtCategories[c]) ? unitxtCategories[c] : []);
    const getStr = (c, idx, fallback) => {
        const s = getCat(c)[idx];
        return typeof s === "string" && s.length > 0 ? s : fallback;
    };

    // `unitxt_e.prs` Cat[11]: 0..47 are the main-menu help lines, 153..166 the status window labels,
    // 192..194 the Mag window labels, 353..364 the function key labels.
    const helpTexts = {
        customize: getStr(11, 0, ""),
        item_pack: getStr(11, 2, ""),
        technique: getStr(11, 3, ""),
        chat: getStr(11, 5, ""),
        options: getStr(11, 6, ""),
        quit_offline: getStr(11, 7, ""),
        quit_online: getStr(11, 8, ""),
        equip: getStr(11, 9, ""),
        use_items: getStr(11, 11, ""),
        area_map: getStr(11, 12, ""),
        guild_card: getStr(11, 14, ""),
        shortcuts: getStr(11, 17, ""),
        symbol_chat: getStr(11, 18, ""),
        simple_mail: getStr(11, 19, ""),
        log_window: getStr(11, 21, ""),
        mag: getStr(11, 23, ""),
        status: getStr(11, 25, ""),
        team_setup: getStr(11, 35, ""),
        team_list: getStr(11, 37, ""),
        team_log: getStr(11, 39, ""),
        team_info: getStr(11, 43, ""),
    };

    const functionKeyLabels = [];
    for (let i = 0; i < 12; i++) {
        functionKeyLabels.push(getStr(11, 353 + i, `F${i + 1}`));
    }

    const techNames = getCat(5).slice(0, 19);
    const techDescs = getCat(6);
    const techniques = techNames
        .map((name, i) => ({ id: `tech_${i}`, name, description: techDescs[i] || "" }))
        .filter((t) => t.name);

    // Cat[1] 0..12 are the stackable tools (Monomate .. Trap Vision).
    const itemNames = getCat(1);
    const itemDescs = getCat(3);
    const toolItems = [];
    for (let i = 0; i <= 12; i++) {
        if (itemNames[i]) toolItems.push({ id: `tool_${i}`, name: itemNames[i], description: itemDescs[i] || "" });
    }

    return {
        uiSpecVersion: 2,
        functionKeyLabels,
        helpTexts,
        statLabels: {
            totalExp: getStr(11, 153, "Total EXP"),
            toNextLv: getStr(11, 154, "To Next Lv"),
            money: getStr(11, 155, "Money"),
            atp: getStr(11, 156, "ATP"),
            dfp: getStr(11, 157, "DFP"),
            mst: getStr(11, 158, "MST"),
            ata: getStr(11, 159, "ATA"),
            evp: getStr(11, 160, "EVP"),
            lck: getStr(11, 161, "LCK"),
            efr: getStr(11, 162, "EFR"),
            eic: getStr(11, 163, "EIC"),
            eth: getStr(11, 164, "ETH"),
            edk: getStr(11, 165, "EDK"),
            elt: getStr(11, 166, "ELT"),
            magLevel: getStr(11, 192, "Level"),
            synchro: getStr(11, 193, "Synchro"),
            iq: getStr(11, 194, "IQ"),
            meseta: getStr(12, 0, "Meseta"),
        },
        classNames: getCat(8).slice(0, 12),
        sectionIds: getCat(72).slice(0, 10),
        techniques,
        toolItems,
        uiXvmSheets: {
            hudGauges: "media/pso/ui/f256_hyouji.xvm",
            cursorsAndSectionIds: "media/pso/ui/f064_mucarsol.xvm",
            unitIcons: "media/pso/ui/f256_uniticon.xvm",
            consoleChrome: "media/pso/ui/ccconsole_e.xvm",
            mainUiTex: "media/pso/ui/texture_e.xvm",
        },
    };
}

function compileGamePackManifest(sceneOutDir, unitxtCategories = []) {
    const cityRelPath = path.join(sceneOutDir, "map_city00_00n.rel");
    const citySecs = fs.existsSync(cityRelPath)
        ? parseRelSectionTable(fs.readFileSync(cityRelPath))
        : new Map();

    // 1. Parse all 4 Pioneer 2 Event NPC layouts (`map_city00_00e*.dat`)
    const cityNpcLayouts = { e: [], e_s: [], e_d: [], e_c1: [] };
    const layoutFiles = {
        e: "map_city00_00e.dat",
        e_s: "map_city00_00e_s.dat",
        e_d: "map_city00_00e_d.dat",
        e_c1: "map_city00_00e_c1.dat",
    };

    for (const [layoutKey, fileName] of Object.entries(layoutFiles)) {
        const datPath = path.join(sceneOutDir, fileName);
        if (!fs.existsSync(datPath)) continue;
        const buf = fs.readFileSync(datPath);
        const count = Math.floor(buf.length / 72);
        for (let i = 0; i < count; i++) {
            const off = i * 72;
            const typeHex = buf.readUInt16LE(off);
            const secId = buf.readUInt16LE(off + 12);
            const lx = buf.readFloatLE(off + 20);
            const ly = buf.readFloatLE(off + 24);
            const lz = buf.readFloatLE(off + 28);
            const ry = buf.readInt32LE(off + 36);
            const wanderRadius = buf.readFloatLE(off + 44);
            const f60 = buf.readFloatLE(off + 60);
            const { wx, wy, wz, wyaw } = transformSectionLocalToWorld(citySecs, secId, lx, ly, lz, ry);
            cityNpcLayouts[layoutKey].push(
                mapNpcBinaryEntryToSpec(i, typeHex, secId, f60, wanderRadius, wx, wy, wz, wyaw, layoutKey),
            );
        }
    }

    // 2. Parse `map_city00_00o.dat` 68-byte object entries for stage objects, doors, teleporters, and counter triggers
    const cityStageObjects = [];
    const cityStations = [];
    const oDatPath = path.join(sceneOutDir, "map_city00_00o.dat");
    if (fs.existsSync(oDatPath)) {
        const obuf = fs.readFileSync(oDatPath);
        const ocount = Math.floor(obuf.length / 68);
        let shopTriggerAccum = { x: 0, z: 0, count: 0 };

        for (let i = 0; i < ocount; i++) {
            const off = i * 68;
            const objType = obuf.readUInt16LE(off);
            const secId = obuf.readUInt16LE(off + 12);
            const lx = obuf.readFloatLE(off + 16);
            const ly = obuf.readFloatLE(off + 20);
            const lz = obuf.readFloatLE(off + 24);
            const ry = obuf.readInt32LE(off + 32);
            const i52 = obuf.readInt32LE(off + 52);
            const { wx, wy, wz, wyaw } = transformSectionLocalToWorld(citySecs, secId, lx, ly, lz, ry);

            // Stage 3D Meshes (`warp_big`, `warp_small`, `elv_alcove`, `shopdoor`, `hunter_door`, `med_door`)
            if (objType === 67) {
                cityStageObjects.push({ kind: "warp_big", x: wx, y: 0.08, z: wz, yawDeg: wyaw });
                cityStations.push({
                    id: "teleporter_pad",
                    title: "🟢 RAGOL AREA TELEPORTER (FOREST / CAVES / MINES / RUINS) [F]",
                    x: wx,
                    y: 2.15,
                    z: wz,
                    radius: 4.2,
                    color: "#50f296",
                });
            } else if (objType === 69) {
                cityStageObjects.push({ kind: "warp_small", x: wx, y: 0.0, z: wz, yawDeg: wyaw });
                if (wz > -50) {
                    cityStageObjects.push({ kind: "elv_alcove", x: wx, y: 0.0, z: wz, yawDeg: 0 });
                    cityStations.push({
                        id: "principal_warp_to_office",
                        title: "🏛️ PRINCIPAL'S OFFICE TELEPORTER PAD [F]",
                        x: wx,
                        y: 1.95,
                        z: wz,
                        radius: 3.2,
                        color: "#c88aff",
                    });
                } else {
                    cityStations.push({
                        id: "principal_warp_to_city",
                        title: "🏙️ RETURN TO PIONEER 2 CITY CONCOURSE [F]",
                        x: wx,
                        y: 1.95,
                        z: wz,
                        radius: 3.6,
                        color: "#50f296",
                    });
                }
            } else if (objType === 70) {
                cityStageObjects.push({ kind: "shopdoor", x: wx, y: 0.0, z: wz, yawDeg: wyaw });
            } else if (objType === 71 || objType === 72) {
                cityStageObjects.push({
                    kind: "hunter_door",
                    x: wx,
                    y: 0.0,
                    z: wz,
                    yawDeg: objType === 72 ? 90 : wyaw,
                });
            } else if (objType === 73) {
                cityStageObjects.push({ kind: "med_door", x: wx, y: 0.0, z: wz, yawDeg: wyaw });
            } else if (objType === 64) {
                // Interactive Counter Triggers (`type = 64`, `i52 = counter role`)
                if (i52 === 4) {
                    cityStations.push({
                        id: "guild_counter",
                        title: "💁‍♀️ HUNTER'S GUILD COUNTER [F]",
                        x: wx,
                        y: 2.35,
                        z: wz,
                        radius: 3.8,
                        color: "#f2c650",
                    });
                } else if (i52 === 1) {
                    cityStations.push({
                        id: "medical_center",
                        title: "🏥 PIONEER 2 MEDICAL CENTER [F]",
                        x: wx,
                        y: 2.35,
                        z: wz,
                        radius: 4.5,
                        color: "#6fffa8",
                    });
                } else if (i52 === 5) {
                    cityStations.push({
                        id: "bank_counter",
                        title: "🏦 CHECK ROOM & SYMBOL BANK [F]",
                        x: wx,
                        y: 2.35,
                        z: wz,
                        radius: 4.2,
                        color: "#7cc8ff",
                    });
                } else if (i52 === 7) {
                    cityStations.push({
                        id: "principal_tyrell",
                        title: "👑 PRINCIPAL TYRELL, IRENE & MOMOKA — GOVERNMENT DESK [F]",
                        x: 0.0,
                        y: 2.55,
                        z: wz,
                        radius: 5.2,
                        color: "#f2c650",
                    });
                } else if (i52 === 0 || i52 === 2 || i52 === 3 || i52 === 6) {
                    shopTriggerAccum.x += wx;
                    shopTriggerAccum.z += wz;
                    shopTriggerAccum.count++;
                }
            }
        }

        if (shopTriggerAccum.count > 0) {
            cityStations.push({
                id: "shop_plaza",
                title: "⚔️ PIONEER 2 SHOPPING PLAZA & TEKKER [F]",
                x: Number((shopTriggerAccum.x / shopTriggerAccum.count).toFixed(2)),
                y: 2.35,
                z: Number((shopTriggerAccum.z / shopTriggerAccum.count).toFixed(2)),
                radius: 7.5,
                color: "#ffe26a",
            });
        }
    }

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceGame: "PSOBB data.gsl + scene/*.rel + scene/*.dat",
        stages: {
            bb_lobby_01: {
                vis: "media/pso/scene/map_lobby_01n.rel",
                col: "media/pso/scene/map_lobby_01c.rel",
                xvm: "media/pso/scene/map_lobby_01.xvm",
                label: "PSOBB Visual Lobby 01 (map_lobby_01n/c.rel)",
                shortLabel: "🏛️ Map: Visual Lobby 01",
                scale: 0.08,
                defaultFloorY: 1.6,
                defaultBgm: "LOBBY.ogg",
            },
            bb_city00: {
                vis: "media/pso/scene/map_city00_00n.rel",
                col: "media/pso/scene/map_city00_00c.rel",
                xvm: "media/pso/scene/map_city00.xvm",
                label: "PSOBB Pioneer 2 City + Principal's Office (map_city00_00n/c.rel)",
                shortLabel: "🏙️ Map: Pioneer 2 City",
                scale: 0.08,
                defaultFloorY: 0.0,
                defaultBgm: "CITY.ogg",
            },
            bb_forest01: {
                vis: "media/pso/scene/map_forest01n.rel",
                col: "media/pso/scene/map_forest01c.rel",
                xvm: "media/pso/scene/map_forest01.xvm",
                label: "PSOBB Area 1 // Ragol Forest 1 (map_forest01n/c.rel)",
                shortLabel: "🌲 Map: Ragol Forest 1",
                scale: 0.08,
                defaultFloorY: 1.75,
                defaultBgm: "slbgm_forest.ogg",
            },
            bb_cave01: {
                vis: "media/pso/scene/map_cave01_00n.rel",
                col: "media/pso/scene/map_cave01_00c.rel",
                xvm: "media/pso/scene/map_cave01.xvm",
                label: "PSOBB Area 2 // Ragol Caves 1 (map_cave01_00n/c.rel)",
                shortLabel: "🌋 Map: Ragol Caves 1",
                scale: 0.08,
                defaultFloorY: 0.0,
                defaultBgm: "CITY.ogg",
            },
            bb_machine01: {
                vis: "media/pso/scene/map_machine01_00n.rel",
                col: "media/pso/scene/map_machine01_00c.rel",
                xvm: "media/pso/scene/map_machine01.xvm",
                label: "PSOBB Area 3 // Ragol Mines 1 (map_machine01_00n/c.rel)",
                shortLabel: "🤖 Map: Ragol Mines 1",
                scale: 0.08,
                defaultFloorY: 0.0,
                defaultBgm: "CITY.ogg",
            },
            bb_ruins01: {
                vis: "media/pso/scene/map_ruins01_00n.rel",
                col: "media/pso/scene/map_ruins01_00c.rel",
                xvm: "media/pso/scene/map_ruins01.xvm",
                label: "PSOBB Area 4 // Ragol Ruins 1 (map_ruins01_00n/c.rel)",
                shortLabel: "🏛️ Map: Ragol Ruins 1",
                scale: 0.08,
                defaultFloorY: 0.0,
                defaultBgm: "CITY.ogg",
            },
            bb_labo00: {
                vis: "media/pso/scene/map_labo00_00n.rel",
                col: "media/pso/scene/map_labo00_00c.rel",
                xvm: "media/pso/scene/map_labo00.xvm",
                label: "PSOBB Episode II Lab (map_labo00_00n/c.rel)",
                shortLabel: "🔬 Map: Episode II Lab",
                scale: 0.08,
                defaultFloorY: 0.0,
                defaultBgm: "LABO.ogg",
            },
        },
        classModels: {
            humar: { bdy: "plAbdy00.nj", hed: "plAhed00.nj", hai: "plAhai00.nj", xvm: "plAtex.xvm", tint: [0.95, 0.38, 0.32] },
            hunewearl: { bdy: "plBbdy00.nj", hed: "plBhed00.nj", hai: "plBhai00.nj", xvm: "plBtex.xvm", tint: [0.96, 0.42, 0.68] },
            hucast: { bdy: "plCbdy00.nj", hed: "plChed00.nj", xvm: "plCtex.xvm", tint: [0.42, 0.78, 0.98] },
            ramar: { bdy: "plDbdy00.nj", hed: "plDhed00.nj", hai: "plDhai00.nj", xvm: "plDtex.xvm", tint: [0.35, 0.68, 0.42] },
            racast: { bdy: "plEbdy00.nj", hed: "plEhed00.nj", xvm: "plEtex.xvm", tint: [0.92, 0.68, 0.25] },
            racaseal: { bdy: "plFbdy00.nj", hed: "plFhed00.nj", xvm: "plFtex.xvm", tint: [0.95, 0.78, 0.88] },
            fomarl: { bdy: "plGbdy00.nj", hed: "plGhed00.nj", hai: "plGhai00.nj", xvm: "plGtex.xvm", tint: [0.92, 0.85, 0.52] },
            fonewm: { bdy: "plHbdy00.nj", hed: "plHhed00.nj", hai: "plHhai00.nj", xvm: "plHtex.xvm", tint: [0.68, 0.45, 0.95] },
            fonewearl: { bdy: "plIbdy00.nj", hed: "plIhed00.nj", hai: "plIhai00.nj", xvm: "plItex.xvm", tint: [0.95, 0.48, 0.85] },
            hucaseal: { bdy: "plJbdy00.nj", hed: "plJhed00.nj", xvm: "plJtex.xvm", tint: [0.85, 0.28, 0.42] },
            fomar: { bdy: "plKbdy00.nj", hed: "plKhed00.nj", hai: "plKhai00.nj", xvm: "plKtex.xvm", tint: [0.32, 0.58, 0.95] },
            ramarl: { bdy: "plLbdy00.nj", hed: "plLhed00.nj", hai: "plLhai00.nj", xvm: "plLtex.xvm", tint: [0.38, 0.92, 0.58] },
        },
        npcModels: {
            npc_trunk: { nj: "npc_trunk.nj", xvm: "npc_trunk.xvm", tint: [0.95, 0.82, 0.55] },
            npc_nurse: { nj: "npc_nurse.nj", xvm: "npc_nurse.xvm", tint: [0.96, 0.85, 0.9] },
            npc_tekker: { nj: "npc_tekker.nj", xvm: "npc_tekker.xvm", tint: [0.75, 0.52, 0.95] },
            npc_tyrell: { nj: "npc_tyrell.nj", xvm: "npc_tyrell.xvm", tint: [0.95, 0.82, 0.42] },
            npc_irene: { nj: "npc_irene.nj", xvm: "npc_irene.xvm", tint: [0.55, 0.82, 0.95] },
            npc_momoka: { nj: "npc_momoka.nj", xvm: "npc_momoka.xvm", tint: [0.95, 0.58, 0.82] },
            npc_hakase: { nj: "npc_hakase.nj", xvm: "npc_hakase.xvm", tint: [0.88, 0.92, 0.96] },
            npc_gunm: { nj: "npc_gunm.nj", xvm: "npc_gunm.xvm", tint: [0.45, 0.68, 0.52] },
            npc_gunb2: { nj: "npc_gunb2.nj", xvm: "npc_gunb2.xvm", tint: [0.42, 0.52, 0.68] },
            npc_shop_weap: { nj: "npc_shop_weap.nj", xvm: "npc_shop_weap.xvm", tint: [0.95, 0.52, 0.38] },
            npc_shop_armor: { nj: "npc_shop_armor.nj", xvm: "npc_shop_armor.xvm", tint: [0.42, 0.78, 0.95] },
            npc_shop_tool: { nj: "npc_shop_tool.nj", xvm: "npc_shop_tool.xvm", tint: [0.48, 0.92, 0.58] },
            npc_cit_efw: { nj: "npc_cit_efw.nj", xvm: "npc_cit_efw.xvm", tint: [0.92, 0.68, 0.78] },
            npc_cit_etw: { nj: "npc_cit_etw.nj", xvm: "npc_cit_etw.xvm", tint: [0.85, 0.78, 0.52] },
            npc_cit_eom: { nj: "npc_cit_eom.nj", xvm: "npc_cit_eom.xvm", tint: [0.62, 0.75, 0.88] },
            npc_cit_efsm: { nj: "npc_cit_efsm.nj", xvm: "npc_cit_efsm.xvm", tint: [0.72, 0.85, 0.68] },
        },
        stationsByStage: {
            bb_city00: cityStations,
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
        cityNpcLayouts,
        cityStageObjects,
        cityAircarLanes: [
            { x: -29.5, y: -3.2, z0: -38, z1: 38, speed: 9.5, phase: 0.0, dir: 1 },
            { x: -34.0, y: -1.8, z0: 38, z1: -38, speed: 11.2, phase: 2.4, dir: -1 },
            { x: -39.0, y: -5.4, z0: -42, z1: 42, speed: 8.4, phase: 5.1, dir: 1 },
            { x: -44.0, y: 0.5, z0: 42, z1: -42, speed: 12.6, phase: 7.7, dir: -1 },
        ],
        uiMenuSpec: buildCompiledUiMenuSpec(unitxtCategories),
    };
}

main();
