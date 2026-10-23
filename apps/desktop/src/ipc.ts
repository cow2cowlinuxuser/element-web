/*
Copyright 2022-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, autoUpdater, desktopCapturer, ipcMain, powerSaveBlocker, screen, TouchBar, nativeImage } from "electron";

import IpcMainEvent = Electron.IpcMainEvent;
import { randomArray } from "./utils.js";
import { consumeDisplayMediaCallback } from "./displayMediaCallback.js";
import Store, { clearData } from "./store.js";
import { getConfig } from "./config.js";
import { reloadWebapp } from "./webapp-hot-reload.js";

type PsoSnapZone = "maximize" | "left" | "right" | "top-left" | "bottom-left" | "top-right" | "bottom-right" | null;

interface PsoWinExt {
    _psoPreMaxBounds?: Electron.Rectangle;
    _psoSnapZone?: PsoSnapZone;
}

const psoBoundsDelta = {
    dx: 0,
    dy: 0,
    dw: 0,
    dh: 0,
};

/**
 * Sets BrowserWindow bounds while compensating for the Windows Electron transparent+frameless
 * non-client border / DPI rounding delta (where setBounds(getBounds()) otherwise grows right/downward).
 */
export function setPsoWindowBounds(win: Electron.BrowserWindow, target: Electron.Rectangle): void {
    const x = Math.round(target.x);
    const y = Math.round(target.y);
    const width = Math.max(640, Math.round(target.width));
    const height = Math.max(480, Math.round(target.height));

    win.setBounds({
        x: x - psoBoundsDelta.dx,
        y: y - psoBoundsDelta.dy,
        width: Math.max(200, width - psoBoundsDelta.dw),
        height: Math.max(200, height - psoBoundsDelta.dh),
    });

    const actual = win.getBounds();
    const errX = actual.x - x;
    const errY = actual.y - y;
    const errW = actual.width - width;
    const errH = actual.height - height;

    if (errX !== 0 || errY !== 0 || errW !== 0 || errH !== 0) {
        psoBoundsDelta.dx += errX;
        psoBoundsDelta.dy += errY;
        psoBoundsDelta.dw += errW;
        psoBoundsDelta.dh += errH;
        win.setBounds({
            x: x - psoBoundsDelta.dx,
            y: y - psoBoundsDelta.dy,
            width: Math.max(200, width - psoBoundsDelta.dw),
            height: Math.max(200, height - psoBoundsDelta.dh),
        });
    }
}

export function getValidRestoreBounds(
    saved: Electron.Rectangle | undefined,
    wa: Electron.Rectangle,
): Electron.Rectangle {
    const minW = 720;
    const minH = 520;
    const defaultW = Math.max(minW, Math.min(1180, Math.round(wa.width * 0.78)));
    const defaultH = Math.max(minH, Math.min(780, Math.round(wa.height * 0.82)));
    if (
        saved &&
        saved.width >= minW &&
        saved.height >= minH &&
        (saved.width < wa.width - 24 || saved.height < wa.height - 24)
    ) {
        const clampedW = Math.min(saved.width, wa.width - 24);
        const clampedH = Math.min(saved.height, wa.height - 24);
        const clampedX = Math.max(wa.x, Math.min(saved.x, wa.x + wa.width - clampedW));
        const clampedY = Math.max(wa.y, Math.min(saved.y, wa.y + wa.height - clampedH));
        return { x: clampedX, y: clampedY, width: clampedW, height: clampedH };
    }
    return {
        x: Math.round(wa.x + (wa.width - defaultW) / 2),
        y: Math.round(wa.y + (wa.height - defaultH) / 2),
        width: defaultW,
        height: defaultH,
    };
}

const psoDragState: {
    active: boolean;
    hasMoved: boolean;
    startCursorX: number;
    startCursorY: number;
    lastCursorX: number;
    lastCursorY: number;
    dragWidth: number;
    dragHeight: number;
    offsetX: number;
    offsetY: number;
    relativeXRatio: number;
    wasSnapped: boolean;
    pendingSnapZone: PsoSnapZone;
    pendingSnapBounds: Electron.Rectangle | null;
} = {
    active: false,
    hasMoved: false,
    startCursorX: 0,
    startCursorY: 0,
    lastCursorX: 0,
    lastCursorY: 0,
    dragWidth: 1120,
    dragHeight: 760,
    offsetX: 0,
    offsetY: 0,
    relativeXRatio: 0.5,
    wasSnapped: false,
    pendingSnapZone: null,
    pendingSnapBounds: null,
};

function computeSnapForZone(wa: Electron.Rectangle, zone: Exclude<PsoSnapZone, null>): Electron.Rectangle {
    const halfW = Math.floor(wa.width / 2);
    const halfH = Math.floor(wa.height / 2);
    switch (zone) {
        case "left":
            return { x: wa.x, y: wa.y, width: halfW, height: wa.height };
        case "right":
            return { x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: wa.height };
        case "top-left":
            return { x: wa.x, y: wa.y, width: halfW, height: halfH };
        case "bottom-left":
            return { x: wa.x, y: wa.y + halfH, width: halfW, height: wa.height - halfH };
        case "top-right":
            return { x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: halfH };
        case "bottom-right":
            return { x: wa.x + halfW, y: wa.y + halfH, width: wa.width - halfW, height: wa.height - halfH };
        case "maximize":
            return { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
    }
}

let focusHandlerAttached = false;
ipcMain.on("loudNotification", function (): void {
    if (process.platform === "win32" || process.platform === "linux") {
        if (global.mainWindow && !global.mainWindow.isFocused() && !focusHandlerAttached) {
            global.mainWindow.flashFrame(true);
            global.mainWindow.once("focus", () => {
                global.mainWindow?.flashFrame(false);
                focusHandlerAttached = false;
            });
            focusHandlerAttached = true;
        }
    }
});

let powerSaveBlockerId: number | null = null;
ipcMain.on("app_onAction", function (_ev: IpcMainEvent, payload) {
    switch (payload.action) {
        case "call_state": {
            if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
                if (payload.state === "ended") {
                    powerSaveBlocker.stop(powerSaveBlockerId);
                    powerSaveBlockerId = null;
                }
            } else {
                if (powerSaveBlockerId === null && payload.state === "connected") {
                    powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");
                }
            }
            break;
        }
    }
});

ipcMain.on("ipcCall", async function (_ev: IpcMainEvent, payload) {
    const store = Store.instance;
    if (!global.mainWindow || !store) return;

    const args = payload.args || [];
    let ret: any;
    let error: string | { message: string; name?: string } | undefined;

    switch (payload.name) {
        case "getUpdateFeedUrl":
            ret = autoUpdater.getFeedURL();
            break;
        case "setLanguage":
            global.appLocalization.setAppLocale(args[0]);
            break;
        case "getAppVersion":
            ret = app.getVersion();
            break;
        case "focusWindow":
            if (global.mainWindow.isMinimized()) {
                global.mainWindow.restore();
            } else {
                global.mainWindow.show();
                global.mainWindow.focus();
            }
            break;

        case "navigateBack":
            if (global.mainWindow.webContents.canGoBack()) {
                global.mainWindow.webContents.goBack();
            }
            break;
        case "navigateForward":
            if (global.mainWindow.webContents.canGoForward()) {
                global.mainWindow.webContents.goForward();
            }
            break;
        case "setSpellCheckEnabled":
            if (typeof args[0] !== "boolean") return;

            global.mainWindow.webContents.session.setSpellCheckerEnabled(args[0]);
            store.set("spellCheckerEnabled", args[0]);
            break;

        case "getSpellCheckEnabled":
            ret = store.get("spellCheckerEnabled");
            break;

        case "setSpellCheckLanguages":
            try {
                global.mainWindow.webContents.session.setSpellCheckerLanguages(args[0]);
            } catch (er) {
                console.log("There were problems setting the spellcheck languages", er);
            }
            break;

        case "getSpellCheckLanguages":
            ret = global.mainWindow.webContents.session.getSpellCheckerLanguages();
            break;
        case "getAvailableSpellCheckLanguages":
            ret = global.mainWindow.webContents.session.availableSpellCheckerLanguages;
            break;

        case "getPickleKey":
            try {
                ret = (await store.getSecret(`${args[0]}|${args[1]}`)) ?? null;
            } catch (e) {
                // An error is thrown if we can't initialise safeStorage, or if a stored secret exists
                // but can't be decrypted this launch (SafeStorageDecryptionError, e.g. the OS keychain
                // is temporarily unavailable). Report this to the renderer as an error rather than as
                // an absent pickle key: the two need very different handling. An absent key means a
                // new one can safely be created, whereas here we must NOT destroy the existing secret
                // (see createPickleKey below) and the read may well succeed if retried once the
                // keychain is readable again. See element-web#32521 / #32715.
                console.error("Failed to get pickle key", e);
                error = {
                    name: e instanceof Error ? e.name : "Error",
                    message: e instanceof Error ? e.message : String(e),
                };
            }
            break;

        case "createPickleKey":
            try {
                // Never overwrite a pickle key that already exists but is currently undecryptable.
                // Overwriting it with a freshly-generated key would turn a transient keychain failure
                // into permanent session and encryption-key loss. Preserve it so the existing session
                // can be restored on a later launch once the keychain is readable again.
                if (await store.isSecretUndecryptable(`${args[0]}|${args[1]}`)) {
                    console.warn("Refusing to overwrite an existing undecryptable pickle key; preserving it");
                    ret = null;
                } else {
                    const pickleKey = await randomArray(32);
                    await store.setSecret(`${args[0]}|${args[1]}`, pickleKey);
                    ret = pickleKey;
                }
            } catch (e) {
                console.error("Failed to create pickle key", e);
                ret = null;
            }
            break;

        case "destroyPickleKey":
            try {
                await store.deleteSecret(`${args[0]}|${args[1]}`);
            } catch (e) {
                console.error("Failed to destroy pickle key", e);
            }
            break;
        case "getDesktopCapturerSources":
            try {
                ret = (await desktopCapturer.getSources(args[0])).map((source) => ({
                    id: source.id,
                    name: source.name,
                    thumbnailURL: source.thumbnail.toDataURL(),
                }));
            } catch (e) {
                console.error("Failed to get desktop capturer sources", e);
                ret = [];
            }
            break;
        case "callDisplayMediaCallback":
            consumeDisplayMediaCallback()?.({ video: args[0] });
            ret = null;
            break;

        case "clearStorage":
            await clearData(global.mainWindow.webContents.session);
            ret = null;
            break;

        case "breadcrumbs": {
            if (process.platform === "darwin") {
                const { TouchBarPopover, TouchBarButton } = TouchBar;

                const recentsBar = new TouchBar({
                    items: args[0].map((r: { roomId: string; avatarUrl: string | null; initial: string }) => {
                        const defaultColors = ["#0DBD8B", "#368bd6", "#ac3ba8"];
                        let total = 0;
                        for (let i = 0; i < r.roomId.length; ++i) {
                            total += r.roomId.charCodeAt(i);
                        }

                        const button = new TouchBarButton({
                            label: r.initial,
                            backgroundColor: defaultColors[total % defaultColors.length],
                            click: (): void => {
                                void global.mainWindow?.loadURL(`vector://vector/webapp/#/room/${r.roomId}`);
                            },
                        });
                        if (r.avatarUrl) {
                            void global.mainWindow?.webContents.session
                                .fetch(r.avatarUrl)
                                .then((resp) => {
                                    if (!resp.ok) return;
                                    return resp.arrayBuffer();
                                })
                                .then((arrayBuffer) => {
                                    if (!arrayBuffer) return;
                                    const buffer = Buffer.from(arrayBuffer);
                                    button.icon = nativeImage.createFromBuffer(buffer);
                                    button.label = "";
                                    button.backgroundColor = "";
                                });
                        }
                        return button;
                    }),
                });

                const touchBar = new TouchBar({
                    items: [
                        new TouchBarPopover({
                            label: "Recents",
                            showCloseButton: true,
                            items: recentsBar,
                        }),
                    ],
                });
                global.mainWindow.setTouchBar(touchBar);
            }
            break;
        }

        case "setPsoStreamOverlayMode": {
            const enabled = Boolean(args[0]);
            global.mainWindow.setAlwaysOnTop(enabled, enabled ? "screen-saver" : "normal");
            if (enabled) {
                global.mainWindow.setBackgroundColor("#00000000");
            } else {
                global.mainWindow.setIgnoreMouseEvents(false);
            }
            ret = enabled;
            break;
        }

        case "setPsoAlwaysOnTop": {
            const enabled = Boolean(args[0]);
            global.mainWindow.setAlwaysOnTop(enabled, enabled ? "screen-saver" : "normal");
            ret = enabled;
            break;
        }

        case "setPsoTransparentMode": {
            const transparent = Boolean(args[0]);
            global.mainWindow.setBackgroundColor(transparent ? "#00000000" : "#030b14");
            ret = transparent;
            break;
        }

        case "setPsoIgnoreMouseEvents": {
            const ignore = Boolean(args[0]);
            global.mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
            ret = ignore;
            break;
        }

        case "psoReleaseFocusToBackground": {
            if (global.mainWindow.isFocused()) {
                global.mainWindow.blur();
            }
            ret = true;
            break;
        }

        case "psoFocusWindow": {
            global.mainWindow.focus();
            ret = true;
            break;
        }

        case "psoWindowDragStart": {
            const cursor = screen.getCursorScreenPoint();
            const bounds = global.mainWindow.getBounds();
            const display = screen.getDisplayMatching(bounds);
            const wa = display.workArea;
            const winExt = global.mainWindow as unknown as PsoWinExt;
            const isAtWorkArea =
                Math.abs(bounds.x - wa.x) <= 8 &&
                Math.abs(bounds.y - wa.y) <= 8 &&
                Math.abs(bounds.width - wa.width) <= 16 &&
                Math.abs(bounds.height - wa.height) <= 16;
            const wasSnapped = Boolean(winExt._psoSnapZone) || isAtWorkArea || global.mainWindow.isMaximized();

            psoDragState.active = true;
            psoDragState.hasMoved = false;
            psoDragState.startCursorX = cursor.x;
            psoDragState.startCursorY = cursor.y;
            psoDragState.lastCursorX = cursor.x;
            psoDragState.lastCursorY = cursor.y;
            psoDragState.dragWidth = Math.max(640, bounds.width);
            psoDragState.dragHeight = Math.max(480, bounds.height);
            psoDragState.offsetX = cursor.x - bounds.x;
            psoDragState.offsetY = cursor.y - bounds.y;
            psoDragState.relativeXRatio = Math.min(0.88, Math.max(0.12, (cursor.x - bounds.x) / Math.max(1, bounds.width)));
            psoDragState.wasSnapped = wasSnapped;
            psoDragState.pendingSnapZone = null;
            psoDragState.pendingSnapBounds = null;
            ret = true;
            break;
        }

        case "psoWindowDragMove": {
            if (!psoDragState.active) {
                ret = null;
                break;
            }
            const cursor = screen.getCursorScreenPoint();
            if (cursor.x === psoDragState.lastCursorX && cursor.y === psoDragState.lastCursorY) {
                ret = psoDragState.pendingSnapZone;
                break;
            }
            psoDragState.lastCursorX = cursor.x;
            psoDragState.lastCursorY = cursor.y;

            const distFromStart = Math.hypot(
                cursor.x - psoDragState.startCursorX,
                cursor.y - psoDragState.startCursorY,
            );
            if (!psoDragState.hasMoved) {
                const threshold = psoDragState.wasSnapped ? 10 : 4;
                if (distFromStart < threshold) {
                    ret = null;
                    break;
                }
                psoDragState.hasMoved = true;
            }

            const winExt = global.mainWindow as unknown as PsoWinExt;
            const display = screen.getDisplayNearestPoint(cursor);
            const wa = display.workArea;

            if (psoDragState.wasSnapped) {
                if (global.mainWindow.isMaximized()) {
                    global.mainWindow.unmaximize();
                }
                const restoreRect = getValidRestoreBounds(winExt._psoPreMaxBounds, wa);
                psoDragState.dragWidth = restoreRect.width;
                psoDragState.dragHeight = restoreRect.height;
                psoDragState.offsetX = Math.round(restoreRect.width * psoDragState.relativeXRatio);
                psoDragState.offsetY = 14;
                psoDragState.wasSnapped = false;
                winExt._psoSnapZone = null;
            }

            setPsoWindowBounds(global.mainWindow, {
                x: cursor.x - psoDragState.offsetX,
                y: cursor.y - psoDragState.offsetY,
                width: psoDragState.dragWidth,
                height: psoDragState.dragHeight,
            });

            const edgeMargin = 18;
            const cornerMargin = 56;
            const nearLeft = cursor.x <= wa.x + edgeMargin;
            const nearRight = cursor.x >= wa.x + wa.width - edgeMargin;
            const nearTop = cursor.y <= wa.y + edgeMargin;
            const inTopCorner = cursor.y <= wa.y + cornerMargin;
            const inBottomCorner = cursor.y >= wa.y + wa.height - cornerMargin;

            let zone: PsoSnapZone = null;
            if (nearLeft && inTopCorner) {
                zone = "top-left";
            } else if (nearLeft && inBottomCorner) {
                zone = "bottom-left";
            } else if (nearRight && inTopCorner) {
                zone = "top-right";
            } else if (nearRight && inBottomCorner) {
                zone = "bottom-right";
            } else if (nearLeft) {
                zone = "left";
            } else if (nearRight) {
                zone = "right";
            } else if (nearTop) {
                zone = "maximize";
            }

            const snapBounds = zone ? computeSnapForZone(wa, zone) : null;
            if (zone !== psoDragState.pendingSnapZone) {
                psoDragState.pendingSnapZone = zone;
                psoDragState.pendingSnapBounds = snapBounds;
                global.mainWindow.webContents.send("psoHudEvent", {
                    type: "snapPreview",
                    zone,
                });
            } else {
                psoDragState.pendingSnapBounds = snapBounds;
            }
            ret = zone;
            break;
        }

        case "psoWindowDragEnd": {
            const winExt = global.mainWindow as unknown as PsoWinExt;
            const zone = psoDragState.hasMoved ? psoDragState.pendingSnapZone : null;
            const snapBounds = psoDragState.hasMoved ? psoDragState.pendingSnapBounds : null;
            psoDragState.active = false;
            psoDragState.hasMoved = false;
            psoDragState.pendingSnapZone = null;
            psoDragState.pendingSnapBounds = null;

            if (zone && snapBounds) {
                const currentBounds = global.mainWindow.getBounds();
                const display = screen.getDisplayMatching(currentBounds);
                const wa = display.workArea;
                if (
                    !winExt._psoPreMaxBounds ||
                    winExt._psoPreMaxBounds.width < 640 ||
                    winExt._psoPreMaxBounds.height < 480
                ) {
                    winExt._psoPreMaxBounds = getValidRestoreBounds(currentBounds, wa);
                }
                winExt._psoSnapZone = zone;
                setPsoWindowBounds(global.mainWindow, snapBounds);
            }
            global.mainWindow.webContents.send("psoHudEvent", {
                type: "snapPreview",
                zone: null,
            });
            ret = zone;
            break;
        }

        case "psoWindowSnapTo": {
            const requestedZone = args[0] as "left" | "right" | "maximize" | "cycle";
            const bounds = global.mainWindow.getBounds();
            const display = screen.getDisplayMatching(bounds);
            const wa = display.workArea;
            const winExt = global.mainWindow as unknown as PsoWinExt;

            let targetZone: Exclude<PsoSnapZone, null> | "restore";
            if (requestedZone === "cycle") {
                if (winExt._psoSnapZone === "left") targetZone = "right";
                else if (winExt._psoSnapZone === "right") targetZone = "maximize";
                else if (winExt._psoSnapZone === "maximize") targetZone = "restore";
                else targetZone = "left";
            } else if (winExt._psoSnapZone === requestedZone) {
                targetZone = "restore";
            } else {
                targetZone = requestedZone;
            }

            if (targetZone === "restore") {
                const restoreRect = getValidRestoreBounds(winExt._psoPreMaxBounds, wa);
                setPsoWindowBounds(global.mainWindow, restoreRect);
                winExt._psoPreMaxBounds = undefined;
                winExt._psoSnapZone = null;
                ret = null;
            } else {
                if (!winExt._psoSnapZone) {
                    winExt._psoPreMaxBounds = getValidRestoreBounds(bounds, wa);
                }
                winExt._psoSnapZone = targetZone;
                setPsoWindowBounds(global.mainWindow, computeSnapForZone(wa, targetZone));
                ret = targetZone;
            }
            break;
        }

        case "psoWindowMinimize": {
            global.mainWindow.minimize();
            ret = true;
            break;
        }

        case "psoReloadWebapp":
            ret = await reloadWebapp(global.mainWindow);
            break;

        case "psoWindowToggleMaximize": {
            const bounds = global.mainWindow.getBounds();
            const display = screen.getDisplayMatching(bounds);
            const workArea = display.workArea;
            const fullBounds = display.bounds;
            const isAtWorkArea =
                Math.abs(bounds.x - workArea.x) <= 8 &&
                Math.abs(bounds.y - workArea.y) <= 8 &&
                Math.abs(bounds.width - workArea.width) <= 16 &&
                Math.abs(bounds.height - workArea.height) <= 16;
            const isAtFullDisplay =
                Math.abs(bounds.x - fullBounds.x) <= 8 &&
                Math.abs(bounds.y - fullBounds.y) <= 8 &&
                Math.abs(bounds.width - fullBounds.width) <= 16 &&
                Math.abs(bounds.height - fullBounds.height) <= 16;
            const winExt = global.mainWindow as unknown as PsoWinExt;
            const isCurrentlyMaximized =
                global.mainWindow.isFullScreen() ||
                global.mainWindow.isMaximized() ||
                isAtWorkArea ||
                isAtFullDisplay ||
                winExt._psoSnapZone === "maximize";

            if (isCurrentlyMaximized) {
                if (global.mainWindow.isFullScreen()) {
                    global.mainWindow.setFullScreen(false);
                }
                if (global.mainWindow.isMaximized()) {
                    global.mainWindow.unmaximize();
                }
                const restoreRect = getValidRestoreBounds(winExt._psoPreMaxBounds, workArea);
                setPsoWindowBounds(global.mainWindow, restoreRect);
                winExt._psoPreMaxBounds = undefined;
                winExt._psoSnapZone = null;
                ret = false;
            } else {
                if (!winExt._psoSnapZone) {
                    winExt._psoPreMaxBounds = getValidRestoreBounds(bounds, workArea);
                }
                winExt._psoSnapZone = "maximize";
                setPsoWindowBounds(global.mainWindow, workArea);
                ret = true;
            }
            break;
        }

        case "psoWindowToggleFullScreen": {
            const bounds = global.mainWindow.getBounds();
            const display = screen.getDisplayMatching(bounds);
            const fullBounds = display.bounds;
            const workArea = display.workArea;
            // On Windows DWM, exact monitor-matching bounds trigger Direct Flip / exclusive fullscreen,
            // which disables per-pixel alpha composition and renders transparent pixels as solid black.
            // Using height - 1 preserves full-screen coverage while keeping DWM alpha transparency active.
            const isBorderlessFull =
                Math.abs(bounds.x - fullBounds.x) <= 8 &&
                Math.abs(bounds.y - fullBounds.y) <= 8 &&
                Math.abs(bounds.width - fullBounds.width) <= 16 &&
                Math.abs(bounds.height - (fullBounds.height - 1)) <= 16;
            const winExt = global.mainWindow as unknown as PsoWinExt;
            if (global.mainWindow.isFullScreen()) {
                global.mainWindow.setFullScreen(false);
            }
            if (isBorderlessFull) {
                const restoreRect = getValidRestoreBounds(winExt._psoPreMaxBounds, workArea);
                setPsoWindowBounds(global.mainWindow, restoreRect);
                winExt._psoPreMaxBounds = undefined;
                winExt._psoSnapZone = null;
                ret = false;
            } else {
                if (!winExt._psoSnapZone) {
                    winExt._psoPreMaxBounds = getValidRestoreBounds(bounds, workArea);
                }
                setPsoWindowBounds(global.mainWindow, {
                    x: fullBounds.x,
                    y: fullBounds.y,
                    width: fullBounds.width,
                    height: fullBounds.height - 1,
                });
                ret = true;
            }
            break;
        }

        case "psoWindowClose": {
            global.mainWindow.close();
            ret = true;
            break;
        }

        case "psoWindowResizeEdge": {
            const [edge, dx, dy] = args as [string, number, number];
            const b = global.mainWindow.getBounds();
            const minW = 640;
            const minH = 480;
            let { x, y, width, height } = b;
            if (edge.includes("e")) width = Math.max(minW, width + dx);
            if (edge.includes("s")) height = Math.max(minH, height + dy);
            if (edge.includes("w")) {
                const nextW = Math.max(minW, width - dx);
                x += width - nextW;
                width = nextW;
            }
            if (edge.includes("n")) {
                const nextH = Math.max(minH, height - dy);
                y += height - nextH;
                height = nextH;
            }
            setPsoWindowBounds(global.mainWindow, { x, y, width, height });
            ret = { x, y, width, height };
            break;
        }

        default:
            global.mainWindow.webContents.send("ipcReply", {
                id: payload.id,
                error: "Unknown IPC Call: " + payload.name,
            });
            return;
    }

    global.mainWindow?.webContents.send("ipcReply", {
        id: payload.id,
        reply: ret,
        error,
    });
});

ipcMain.handle("getConfig", getConfig);

const initialisePromiseWithResolvers = Promise.withResolvers<void>();
export const initialisePromise = initialisePromiseWithResolvers.promise;

ipcMain.once("initialise", () => {
    initialisePromiseWithResolvers.resolve();
});
