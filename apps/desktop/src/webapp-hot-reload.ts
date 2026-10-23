/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, type BrowserWindow } from "electron";

import { getPackagedAsarPath, setHotAsarPath, STAGED_WEBAPP_NAME, withoutAsarShim } from "./asar.js";

/*
 * Electron keeps an archive open and cached per path for the life of the process, so a new webapp build can't be
 * written over the archive being served. Instead a build staged as `webapp.next.asar` is copied to a path named
 * after its content hash and served from there; the next cold start promotes the staged file over `webapp.asar`.
 * Reloading the renderer keeps the Matrix session (IndexedDB / localStorage) and the open room (URL hash).
 */

function hotDir(): string {
    return path.join(app.getPath("userData"), "webapp-hot");
}

/** Copies left behind by hot reloads in a previous run; safe to drop before anything is served from them. */
export function clearHotWebapps(): void {
    withoutAsarShim(() => {
        try {
            fs.rmSync(hotDir(), { recursive: true, force: true });
        } catch (e) {
            console.warn("Could not clear hot-reloaded webapps:", e);
        }
    });
}

/**
 * Switches to the staged webapp build if there is one, then reloads the renderer without its HTTP cache.
 * With nothing staged this is a plain refresh of the current build.
 */
export async function reloadWebapp(win: BrowserWindow): Promise<{ build: string | null }> {
    const packaged = await getPackagedAsarPath();
    const staged = path.join(path.dirname(packaged), STAGED_WEBAPP_NAME);
    let build: string | null = null;
    withoutAsarShim(() => {
        if (!fs.existsSync(staged)) return;
        const bytes = fs.readFileSync(staged);
        build = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
        const dest = path.join(hotDir(), `webapp-${build}.asar`);
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(hotDir(), { recursive: true });
            fs.writeFileSync(`${dest}.tmp`, bytes);
            fs.renameSync(`${dest}.tmp`, dest);
        }
        setHotAsarPath(dest);
    });
    console.log(build ? `Hot-reloading webapp build ${build}` : "Reloading webapp");
    await win.webContents.session.clearCache();
    win.webContents.reloadIgnoringCache();
    return { build };
}
