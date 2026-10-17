/*
Copyright 2026 zigmaster

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Stores custom notification sounds in IndexedDB on this device, so they can be played without being uploaded
 * to (or downloaded from) the homeserver.
 *
 * Sounds are keyed by a "local sound URL" which is saved in the room's `notificationSound` setting in place of an
 * mxc URL. A new key is minted for every saved sound so that a cached decoded copy is never reused for a
 * replacement file.
 */

const DB_NAME = "element-local-notification-sounds";
const STORE_NAME = "sounds";

/** Prefix of the `url` stored in the `notificationSound` setting for sounds kept on this device. */
export const LOCAL_SOUND_URL_PREFIX = "element-local-sound:";

/**
 * Whether a `notificationSound` URL refers to a sound stored on this device.
 */
export function isLocalSoundUrl(url: string): boolean {
    return url.startsWith(LOCAL_SOUND_URL_PREFIX);
}

/**
 * Creates a new, unique local sound URL for a room.
 */
export function newLocalSoundUrl(roomId: string): string {
    return `${LOCAL_SOUND_URL_PREFIX}${roomId}:${Date.now()}`;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (): void => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void => reject(request.error);
    });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const txn = db.transaction(STORE_NAME, mode);
            const request = run(txn.objectStore(STORE_NAME));
            txn.oncomplete = (): void => resolve(request.result);
            txn.onerror = (): void => reject(txn.error);
            txn.onabort = (): void => reject(txn.error);
        });
    } finally {
        db.close();
    }
}

/**
 * Saves a sound file under the given local sound URL.
 */
export async function saveLocalSound(url: string, sound: Blob): Promise<void> {
    const data = await sound.arrayBuffer();
    await withStore("readwrite", (store) => store.put(data, url));
}

/**
 * Loads the bytes of the sound file saved under the given local sound URL, if there is one.
 */
export async function loadLocalSound(url: string): Promise<ArrayBuffer | undefined> {
    return withStore<ArrayBuffer | undefined>("readonly", (store) => store.get(url));
}

/**
 * Deletes the sound file saved under the given local sound URL. Does nothing if there is none.
 */
export async function deleteLocalSound(url: string): Promise<void> {
    await withStore("readwrite", (store) => store.delete(url));
}
