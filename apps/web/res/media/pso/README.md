# PSOBB 3D Lobby & Pioneer 2 Assets (Bring-Your-Own-Assets)

This directory holds the extracted 3D character meshes (`.nj`), stage models & collision (`.rel`, `.xj`, `.dat`), textures (`.xvm`), 64-bone skeletal motions (`.njm`), and soundtrack files (`.ogg`) used by the 3D Visual Lobby & Pioneer 2 Hub (`apps/web/src/components/views/pso/`).

Because these binary assets are copyrighted game data from **Phantasy Star Online: Blue Burst (PSOBB)**, the `chars/`, `scene/`, and `ogg/` subdirectories are excluded from Git via `.gitignore`.

## Extracting Assets (Linux / macOS / Windows)

Point the zero-dependency Node.js extractor at any local PSOBB installation directory (containing `data/data.gsl`, `data/scene/`, `data/ogg/`, and `data/pl*tex.afs`):

```bash
# From element-classic/ root:
pnpm run extract:psobb -- --source /path/to/PSOBB

# Or using an environment variable:
PSOBB_DIR=/path/to/PSOBB node scripts/extract-psobb-assets.mjs
```

This unpacks all **198** assets into:
- `res/media/pso/chars/` (151 files: playable classes, 22 Pioneer 2 NPCs, 3D Photon Chair, and 38 `.njm` skeletal animations)
- `res/media/pso/scene/` (40 files: Visual Lobby, Pioneer 2 City, Principal's Office, Lab, Forest, Cave, Mine, Ruins, Temple, Spaceship, and interactive stage objects)
- `res/media/pso/ogg/` (7 files: area background music tracks)
