# PSOBB 3D Lobby & Pioneer 2 Assets + Compiled Game Pack (Bring-Your-Own-Assets)

This directory holds the extracted 3D character meshes (`.nj`), stage models & collision (`.rel`, `.xj`, `.dat`), textures (`.xvm`), 64-bone skeletal motions (`.njm`), soundtrack files (`.ogg`), and the compiled **`game-pack.json`** stage/NPC/object manifest used by the 3D Visual Lobby & Pioneer 2 Hub (`apps/web/src/components/views/pso/`).

Because these binary assets and stage/NPC placement tables derive from **Phantasy Star Online: Blue Burst (PSOBB)**, `chars/`, `scene/`, `ogg/`, and `game-pack.json` are excluded from Git via `.gitignore`.

## Extracting Assets & Compiling `game-pack.json` (Linux / macOS / Windows)

Point the zero-dependency Node.js compiler/extractor at any local PSOBB installation directory (containing `data/data.gsl`, `data/scene/`, `data/ogg/`, and `data/pl*tex.afs`):

```bash
# From element-classic/ root:
pnpm run extract:psobb -- --source /path/to/PSOBB

# Or using an environment variable:
PSOBB_DIR=/path/to/PSOBB node scripts/extract-psobb-assets.mjs
```

This unpacks all **198** binary assets and compiles **`game-pack.json`** directly from the game's `.rel` section headers and `.dat` placement tables:
- `res/media/pso/game-pack.json` (Compiled stage registry, section-to-world transformed NPC placement tables from `map_city00_00e*.dat`, interactive counter triggers & doors from `map_city00_00o.dat`, and class/NPC model mappings)
- `res/media/pso/chars/` (151 files: playable classes, 22 Pioneer 2 NPCs, 3D Photon Chair, and 38 `.njm` skeletal animations)
- `res/media/pso/scene/` (40 files: Visual Lobby, Pioneer 2 City, Principal's Office, Lab, Forest, Cave, Mine, Ruins, Temple, Spaceship, and interactive stage objects)
- `res/media/pso/ogg/` (7 files: area background music tracks)

If `game-pack.json` is not present at runtime, `PsoGamePackLoader.ts` automatically falls back to `FALLBACK_PROCEDURAL_GAME_PACK` (a clean-room procedural Holodeck with zero copyrighted tables or coordinates).
