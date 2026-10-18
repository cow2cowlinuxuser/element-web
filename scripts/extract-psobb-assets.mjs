#!/usr/bin/env node
/**
 * Clean-Room PSOBB Asset Extractor for Element Classic 3D Lobby & Pioneer 2
 *
 * Cross-platform (Linux / macOS / Windows), zero-dependency Node.js CLI tool.
 * Reads a user-supplied Phantasy Star Online: Blue Burst (PSOBB) installation
 * (`<psobb_dir>/data` and `<psobb_dir>/data/data.gsl`) and extracts all 198
 * 3D models (`.nj`, `.xj`), textures (`.xvm`), stage geometry/placements (`.rel`, `.dat`),
 * 64-bone skeletal animations (`.njm`), and soundtrack files (`.ogg`) into:
 *   `element-classic/apps/web/res/media/pso/{chars,scene,ogg}/`
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
        dataOff += cSize;
        if (dataOff % 0x20 !== 0) {
            dataOff = Math.ceil(dataOff / 0x20) * 0x20;
        }

        let extraDec = null;
        if (pvmCSize > 0 && dataOff + pvmCSize <= bmlBuf.length) {
            const rawExtra = bmlBuf.slice(dataOff, dataOff + pvmCSize);
            extraDec = prsDecompress(rawExtra);
            dataOff += pvmCSize;
            if (dataOff % 0x20 !== 0) {
                dataOff = Math.ceil(dataOff / 0x20) * 0x20;
            }
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
    { bml: "charamakingmot.bml", entry: "pxuZ00_C08_M_body.njm", out: "mot_cast_m.njm" },
    { bml: "charamakingmot.bml", entry: "pxuZ00_C08_W_body.njm", out: "mot_cast_w.njm" },
    { bml: "charamakingmot.bml", entry: "pxuZ00_C08_F_body.njm", out: "mot_cast_f.njm" },
];

const RLC_MOTION_TARGETS = [
    { idx: 99, hdr: 0x09a0, out: "mot_atk1_m.njm" },
    { idx: 100, hdr: 0x0b50, out: "mot_atk2_m.njm" },
    { idx: 101, hdr: 0x14e0, out: "mot_atk3_m.njm" },
    { idx: 329, hdr: 0x09a0, out: "mot_atk1_w.njm" },
    { idx: 330, hdr: 0x0b50, out: "mot_atk2_w.njm" },
    { idx: 331, hdr: 0x14e0, out: "mot_atk3_w.njm" },
    { idx: 482, hdr: 0x09a0, out: "mot_atk1_f.njm" },
    { idx: 483, hdr: 0x0b50, out: "mot_atk2_f.njm" },
    { idx: 484, hdr: 0x14e0, out: "mot_atk3_f.njm" },
    { idx: 237, hdr: 0x0f40, out: "mot_sit_m.njm" },
    { idx: 442, hdr: 0x0f40, out: "mot_sit_w.njm" },
    { idx: 208, hdr: 0x0fd0, out: "mot_wave_m.njm" },
    { idx: 417, hdr: 0x0eb0, out: "mot_wave_w.njm" },
    { idx: 209, hdr: 0x1840, out: "mot_cheer_m.njm" },
    { idx: 418, hdr: 0x14e0, out: "mot_cheer_w.njm" },
    { idx: 235, hdr: 0x2380, out: "mot_dance_m.njm" },
    { idx: 439, hdr: 0x3cd0, out: "mot_dance_w.njm" },
    { idx: 232, hdr: 0x1960, out: "mot_bow_m.njm" },
    { idx: 441, hdr: 0x1960, out: "mot_bow_w.njm" },
];

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
    fs.mkdirSync(charsOut, { recursive: true });
    fs.mkdirSync(sceneOut, { recursive: true });
    fs.mkdirSync(oggOut, { recursive: true });

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

    // F. 15 Core Town/Battle Motions from charamakingmot.bml & npcapcmot.bml
    const parsedMotionBmls = new Map();
    for (const bmlName of ["charamakingmot.bml", "npcapcmot.bml"]) {
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

    // G. 19 Emote/Attack/Sit Motions from plymotiondata.rlc (Knuth PRNG + PRS + NMDM)
    const rlcRaw = getGslFile(gslBuf, gslMap, "plymotiondata.rlc");
    if (rlcRaw) {
        for (const target of RLC_MOTION_TARGETS) {
            const off = rlcRaw.readUInt32BE(0x20 + target.idx * 8);
            const sz = rlcRaw.readUInt32BE(0x20 + target.idx * 8 + 4);
            if (off > 0 && sz > 8 && off + sz <= rlcRaw.length) {
                const relChunk = decryptAndDecompressPsoChunk(rlcRaw.slice(off, off + sz));
                const nmdm = convertRelMotionAt(relChunk, target.hdr, 64);
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

    console.log(
        `[PSOBB Extractor] Successfully extracted ${extractedCount} assets to:\n  ${outDir}`,
    );
}

main();
