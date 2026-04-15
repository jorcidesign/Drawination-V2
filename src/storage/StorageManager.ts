// src/storage/StorageManager.ts
import type { TimelineEvent } from '../history/HistoryManager';

export class StorageManager {
    private dbName = 'DrawinationDB';
    private storeName = 'timeline_events';
    private db: IDBDatabase | null = null;

    private readyPromise: Promise<void>;
    private resolveReady!: () => void;

    constructor() {
        this.readyPromise = new Promise(resolve => {
            this.resolveReady = resolve;
        });
    }

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.resolveReady();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async saveEvent(event: TimelineEvent): Promise<number> {
        await this.readyPromise;
        if (!this.db) return 0;

        const isDataEvent = event.type === 'STROKE' || event.type === 'ERASE' || event.type === 'FILL';
        // const _isControlEvent = event.type === 'UNDO' || event.type === 'REDO';

        if (isDataEvent) {
            const hasPayload = event.data !== null || event.compressedData !== undefined;
            if (!hasPayload) return 0;
        }

        const dbEvent = { ...event };
        let savedBytes = 0;

        if (dbEvent.compressedData) {
            dbEvent.data = dbEvent.compressedData;
            dbEvent.isCompressed = true;
            savedBytes = dbEvent.data.byteLength;
        } else if (dbEvent.data) {
            dbEvent.isCompressed = false;
            savedBytes = dbEvent.data.byteLength;
        }

        delete dbEvent.compressedData;

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(dbEvent);
            tx.oncomplete = () => resolve(savedBytes);
            tx.onerror = () => reject(tx.error);
        });
    }

    private async decompressData(buffer: ArrayBuffer): Promise<ArrayBuffer> {
        const stream = new DecompressionStream('deflate-raw');
        const writer = stream.writable.getWriter();
        writer.write(buffer);
        writer.close();
        return await new Response(stream.readable).arrayBuffer();
    }

    // Un único cursor IDB recorre el store una sola vez y recoge
    // solo los IDs que necesitamos — en lugar de N peticiones get() separadas.
    // La interfaz pública no cambia: recibe string[] y devuelve Map<string, ArrayBuffer>.
    public async loadEventDataBatch(ids: string[]): Promise<Map<string, ArrayBuffer>> {
        await this.readyPromise;
        if (!this.db || ids.length === 0) return new Map();

        const needed = new Set(ids);
        const raw = new Map<string, ArrayBuffer>();
        const toDecompress: Array<{ id: string; data: ArrayBuffer }> = [];

        await new Promise<void>((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const req = tx.objectStore(this.storeName).openCursor();

            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                if (!cursor) { resolve(); return; }

                const id = cursor.key as string;
                if (needed.has(id)) {
                    const ev = cursor.value as TimelineEvent;
                    if (ev.isCompressed && ev.data) {
                        toDecompress.push({ id, data: ev.data });
                    } else if (ev.data) {
                        raw.set(id, ev.data);
                    }
                    // Si ya recogimos todos los que necesitamos, no seguimos
                    if (raw.size + toDecompress.length === needed.size) {
                        resolve();
                        return;
                    }
                }
                cursor.continue();
            };

            req.onerror = () => reject(req.error);
        });

        // Descompresión en paralelo de los que lo necesitan
        await Promise.all(toDecompress.map(async (item) => {
            try {
                raw.set(item.id, await this.decompressData(item.data));
            } catch (e) {
                console.error(`[Storage] Batch decompress err id ${item.id}`, e);
            }
        }));

        return raw;
    }

    public async loadEventData(id: string): Promise<ArrayBuffer | null> {
        await this.readyPromise;
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const request = tx.objectStore(this.storeName).get(id);

            request.onsuccess = async () => {
                const ev = request.result as TimelineEvent;
                if (!ev) {
                    console.warn(`[Storage] IDB.get empty for id ${id}`);
                    return resolve(null);
                }

                if (ev.isCompressed && ev.data) {
                    try {
                        resolve(await this.decompressData(ev.data));
                    } catch (e) {
                        console.error(`[Storage] err decompress id ${id}`, e);
                        resolve(null);
                    }
                } else {
                    resolve(ev.data || null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async loadTimeline(): Promise<TimelineEvent[]> {
        await this.readyPromise;
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const request = tx.objectStore(this.storeName).getAll();

            request.onsuccess = async () => {
                const events = request.result as TimelineEvent[];
                events.sort((a, b) => a.timestamp - b.timestamp);
                for (const ev of events) {
                    if (ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL') {
                        ev.data = null;
                    }
                }
                resolve(events);
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async clearAll(): Promise<void> {
        await this.readyPromise;
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}