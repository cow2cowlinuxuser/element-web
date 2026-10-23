/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { tryPaths } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** A freshly built webapp dropped next to `webapp.asar` to be picked up by a hot reload or the next start. */
export const STAGED_WEBAPP_NAME = "webapp.next.asar";

/**
 * Runs `fn` with Electron's asar shim off, so `.asar` files are handled as plain files rather than as directories.
 */
export function withoutAsarShim<T>(fn: () => T): T {
    const previous = process.noAsar;
    process.noAsar = true;
    try {
        return fn();
    } finally {
        process.noAsar = previous;
    }
}

/** Before anything has opened the webapp archive, swap a staged build in over it. */
function promoteStagedWebapp(asarPath: string): void {
    if (!asarPath.endsWith(".asar")) return;
    const staged = path.join(path.dirname(asarPath), STAGED_WEBAPP_NAME);
    withoutAsarShim(() => {
        if (!fs.existsSync(staged)) return;
        try {
            fs.renameSync(staged, asarPath);
            console.log(`Promoted staged webapp ${staged}`);
        } catch (e) {
            console.warn(`Could not promote staged webapp ${staged}:`, e);
        }
    });
}

let packagedAsarPathPromise: Promise<string> | undefined;
let packagedAsarPath: string | undefined;
let hotAsarPath: string | undefined;

/** The webapp archive that shipped with the app (after promoting any staged build at startup); memoized. */
export function getPackagedAsarPath(): Promise<string> {
    if (!packagedAsarPathPromise) {
        packagedAsarPathPromise = tryPaths("webapp", __dirname, [
            // If run from the source checkout, this will be in the directory above
            "../webapp.asar",
            // but if run from a packaged application, electron-main.js will be in
            // a different asar file, so it will be two levels above
            "../../webapp.asar",
            // also try without the 'asar' suffix to allow symlinking in a directory
            "../webapp",
            // from a packaged application
            "../../webapp",
        ]).then((p) => {
            promoteStagedWebapp(p);
            packagedAsarPath = p;
            return p;
        });
    }
    return packagedAsarPathPromise;
}

/** Get the webapp resource file path currently being served: a hot-reloaded build if one is active. */
export async function getAsarPath(): Promise<string> {
    return hotAsarPath ?? (await getPackagedAsarPath());
}

/** Synchronous form of {@link getAsarPath}, for use once startup has resolved the packaged path. */
export function currentAsarPath(): string {
    const p = hotAsarPath ?? packagedAsarPath;
    if (!p) throw new Error("webapp path requested before it was resolved");
    return p;
}

/** Serve the webapp from another archive from now on (used by hot reload). */
export function setHotAsarPath(p: string): void {
    hotAsarPath = p;
}
