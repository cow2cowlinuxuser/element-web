# Element // Pioneer 2 Comm-Link (PSOBB Edition)

A custom fork of **Element Classic (Web + Electron Desktop)** transformed into a **Phantasy Star Online: Blue Burst (PSOBB) Episode I, II & IV** communication suite, 3D social hub, and transparent gaming overlay for Matrix + LiveKit (`Element Call`).

---

## What Makes This Fork Different from Standard Element

### 1. Authentic PSOBB Episode IV HUD, Glass Theme & CRT Scanlines
- **Cyan/Teal & Amber Glass UI (`_PsoTheme.pcss`)**: Replaces the standard Element flat theme with translucent Pioneer 2 glass panels, scanlines, Swatch `.beat` Internet Time readout, and orbital Ragol/Pioneer 2 or custom wallpaper backdrops.
- **Frameless Desktop Window & OS Click-Through Glass (`Alt+G`)**: Includes custom aero snap zones, always-on-top pinning, and smart hit-tested click-through glass that lets mouse and keyboard input pass directly through to games running behind Element while keeping the chat composer and HUD buttons interactive.
- **Compact Text-Only Chat Mode (`Alt+C`)**: Collapses the app into a floating bottom-right PSO chatbox with an optional **Text-Only Hide Bar & Overlays** toggle (`💬`) and a bottom-right restore dock (`▲ RESTORE TITLE BAR & OVERLAYS` / `⤢ RESTORE FULL APP`).
- **Episode IV Top-Left Hunter & Party Voice HUD**: Shows your live Matrix homeserver ping (`HP` bar), live WebAudio microphone dB meter (`TP` bar), `Shifta`/`Deband` peaking & noise-shield indicators, and stacked party member plates inside the 3D Lobby, Compact Chat, or Stream Overlay mode (`Alt+O`).
- **1–0 Hexagonal Action Palette & Draggable 4-Hex Diamond Cluster**: Customizable bottom quickbar (`Alt+1`..`Alt+0`) for instant mic mute, deafen, screen share, Symbol Chat, 3D Lobby toggle, and technique alerts (`Resta`, `Shifta`, `Deband`).

### 2. Interactive PSOBB Symbol Chat Maker & Synthesizer
- **Authentic Multi-Layer Symbol Chat Editor (`PsoSymbolChatMaker.tsx`)**: Build, layer, color, and save up to **30** custom Symbol Chat presets (including imported PNG sprite sheets) with authentic 4-choice sound chimes and floating parallelogram speech balloons.
- **Live Matrix Broadcast**: Transmits Symbol Chats across Matrix rooms (with optional auto-redaction or persistent chat log fallback) and displays them as 3D overhead balloons above your character in the lobby.

### 3. Embedded 3D WebGL Visual Lobby & Pioneer 2 Hub (`PsoLobby3dLayer.tsx`)
- **Native Sega Ninja (`.nj` / `.xj`), Texture (`.xvm`), Stage (`.rel` / `.dat`), and 64-Bone Skeletal Animation (`.njm`) Engine**:
  - Parses and renders authentic PSOBB character classes (`HUmar`, `HUnewearl`, `HUcast`, `HUcaseal`, `RAmar`, `RAmarl`, `RAcast`, `RAcaseal`, `FOmar`, `FOmarl`, `FOnewm`, `FOnewearl`), 22 Pioneer 2 NPCs, 3D Photon Chairs, and multi-stage environments (Visual Lobby, Pioneer 2 City, Principal's Office, Lab, Forest 1, Cave 1, Mine 1, Ruins 1, Temple, Spaceship).
  - Full 64-bone hierarchical skeletal animation (`NMDM`) with walk/run cycles, 3-step melee combos, casting, sitting in Photon Chairs, and lobby emotes (`Wave`, `Cheer`, `Dance`, `Bow`).
  - Built-in **WebGL Post-Processing / ReShade Pipeline** (Bloom, CRT Scanlines, Chromatic Aberration, Vignette, Vibrance, Sharpen) and area BGM soundtrack player.
- **Real-Time Multiplayer over Matrix (`<50ms` Ephemeral To-Device + Room State Sync)**:
  - Fellow room and voice-call members appear live in the 3D world with smooth velocity dead-reckoning, overhead chat bubbles, Section ID badges, and inspectable **Hunter Guild Cards**.
  - **Ghost Standby Mode (`👻`)**: Keeps your hologram Hunter resting at your saved coordinates in the 3D Lobby and relays your chat messages as 3D speech bubbles even when you close the 3D viewport to save GPU.
- **Pioneer 2 Hunter's Guild Counter**: Walk up to the Guild Counter, Medical Center, Shops, Bank, or Teleporter in Pioneer 2 to switch Matrix rooms ("Ship Blocks"), toggle voice comms, or warp between Ragol stages.

### 4. Split Chat + Collapsible Element Call Voice/Video Dock
- **Side-by-Side Timeline & LiveKit Call View**: Joining a voice/video call keeps the room text timeline open alongside a resizable, collapsible right-hand call pane (`❯ HIDE` / `❮ CALL` or top-right `📹` header button).
- **Persistent Bottom-Left Voice Dock (`UserVoiceDock.tsx`)**: Quick mute, deafen, screen-share, and per-user volume controls right from the room list sidebar.
- **Native Desktop Screen / Window Picker + Global Hotkeys**: Custom Electron IPC picker for sharing individual windows or screens with system audio, plus global `F9` (Mute) and `F10` (Deafen) shortcuts that work while gaming full-screen.

---

## Clean-Room Bring-Your-Own-Assets (BYOA) Setup

To keep this repository 100% free of copyrighted Sega binary assets, the extracted `.nj`, `.xj`, `.xvm`, `.rel`, `.dat`, `.njm`, and `.ogg` files under `apps/web/res/media/pso/{chars,scene,ogg}/` are git-ignored.

Instead, this repository includes a zero-dependency, cross-platform Node.js extractor (`scripts/extract-psobb-assets.mjs`) that unpacks all **198** required assets directly from your own local **Phantasy Star Online: Blue Burst** installation (`data/data.gsl`, `data/scene/`, `data/ogg/`, `data/pl*tex.afs`) in under 1 second on **Linux, macOS, and Windows**.

---

## Quick Start (Linux / macOS / Windows)

### Prerequisites
- **Node.js** `>= 22.18`
- **pnpm** (via Corepack or standalone install)
- *(Optional, for 3D Lobby & BGM assets)* A local copy of a **PSOBB** client folder containing `data/data.gsl`

### 1. Clone & Install Dependencies

```bash
git clone -b notification-sound-fixes https://github.com/cow2cowlinuxuser/element-web.git element-classic
cd element-classic
pnpm install
```

### 2. Extract PSOBB 3D Models, Animations, Stages & Audio

Point `--source` at your PSOBB installation directory (or its `data/` subfolder):

```bash
pnpm run extract:psobb -- --source "/path/to/your/PSOBB"
```

*(This extracts all 198 files into `apps/web/res/media/pso/{chars,scene,ogg}/`.)*

### 3. Run or Package the Application

#### Option A: Run Web Dev Server
```bash
pnpm --filter element-web start
```

#### Option B: Build & Package the Linux Electron Desktop App
```bash
pnpm run build:desktop:linux

# Launch the unpacked Linux desktop app:
./apps/desktop/dist/linux-unpacked/element-desktop
```

#### Option C: Build & Package on Windows
```bash
pnpm --filter element-web build
pnpm --filter element-desktop run build:ts
pnpm --filter element-desktop exec electron-builder --win --dir
```

---

## Keyboard Shortcuts & HUD Controls

| Shortcut / Control | Action |
| --- | --- |
| `Alt + 1` .. `Alt + 0` | Trigger equipped bottom Hex Action Palette slot `1`–`0` |
| `Alt + C` | Toggle **Compact Floating Chat Mode** (with top-left Party HUD & bottom-right restore bar) |
| `Alt + G` | Toggle **Click-Through Glass Mode** (pass mouse/keyboard through to game behind window) |
| `Alt + O` | Toggle **Stream Overlay Mode** (pin HUD gauges & hex bar over transparent desktop) |
| `F9` *(Desktop Global)* | Toggle Microphone Mute (works even when another game is focused) |
| `F10` *(Desktop Global)* | Toggle Audio Deafen (works even when another game is focused) |
| `🕹️` *(Title Bar)* | Open / Close **3D Pioneer 2 Visual Lobby** |
| `👻` *(Title Bar)* | Toggle **Ghost Standby Avatar** while 3D Lobby is closed |
| `🎨` *(Title Bar)* | Open **PSO Symbol Chat Maker** |
| `💬` *(Title Bar)* | Hide Title Bar & HUD Overlays in Compact Chat (restore from bottom-right button) |

---

## Upstream License

Based on [Element Web / Desktop](https://github.com/element-hq/element-web) by New Vector Ltd, licensed under `AGPL-3.0-only OR GPL-3.0-only`. See original license headers for full details.
