// src/history/CacheManager.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';

export interface MemorySnapshot {
    eventId: string;
    bitmaps: Map<number, ImageBitmap>;
    timestamp: number;
}

export interface DBSnapshot {
    eventId: string;
    layers: { layerIndex: number; blob: Blob }[];
}

export class CacheManager {
    private memoryCache: Map<string, MemorySnapshot> = new Map();
    private db: IDBDatabase | null = null;
    private readonly canvasWidth: number;
    private readonly canvasHeight: number;

    private readonly MAX_MEMORY_SNAPS = 15;

    constructor(canvasWidth: number, canvasHeight: number) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.initDB();
    }

    private initDB() {
        const req = indexedDB.open('DrawinationCacheDB', 2);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('snapshots')) {
                db.createObjectStore('snapshots', { keyPath: 'eventId' });
            } else {
                db.deleteObjectStore('snapshots');
                db.createObjectStore('snapshots', { keyPath: 'eventId' });
            }
        };
        req.onsuccess = (e) => { this.db = (e.target as IDBOpenDBRequest).result; };
    }

    public async bake(eventId: string, engine: CanvasEngine, isKeyframe: boolean = false): Promise<void> {
        const bitmaps = new Map<number, ImageBitmap>();

        for (let i = 0; i < 10; i++) {
            const canvas = engine.getLayerCanvas(i);
            bitmaps.set(i, await createImageBitmap(canvas));
        }

        this.addToMemory(eventId, bitmaps);

        if (isKeyframe) {
            this.persistToDB(eventId, bitmaps);
        }
    }

    public async getSnapshot(eventId: string): Promise<Map<number, ImageBitmap> | null> {
        if (this.memoryCache.has(eventId)) {
            const entry = this.memoryCache.get(eventId)!;
            entry.timestamp = Date.now();
            return entry.bitmaps;
        }

        if (!this.db) return null;

        return new Promise((resolve) => {
            const tx = this.db!.transaction('snapshots', 'readonly');
            const req = tx.objectStore('snapshots').get(eventId);

            req.onsuccess = async () => {
                const result = req.result as DBSnapshot;
                if (result && result.layers) {
                    const bitmaps = new Map<number, ImageBitmap>();
                    await Promise.all(result.layers.map(async (layer) => {
                        bitmaps.set(layer.layerIndex, await createImageBitmap(layer.blob));
                    }));

                    this.addToMemory(eventId, bitmaps);
                    resolve(bitmaps);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }

    private addToMemory(eventId: string, bitmaps: Map<number, ImageBitmap>) {
        this.memoryCache.set(eventId, { eventId, bitmaps, timestamp: Date.now() });

        if (this.memoryCache.size > this.MAX_MEMORY_SNAPS) {
            let oldestId = '';
            let oldestTime = Infinity;
            for (const [id, entry] of this.memoryCache.entries()) {
                if (entry.timestamp < oldestTime) {
                    oldestTime = entry.timestamp;
                    oldestId = id;
                }
            }
            if (oldestId) {
                this.memoryCache.delete(oldestId);
            }
        }
    }

    private persistToDB(eventId: string, bitmaps: Map<number, ImageBitmap>) {
        if (!this.db) return;

        Promise.all(Array.from(bitmaps.entries()).map(async ([index, bmp]) => {
            const offscreen = new OffscreenCanvas(this.canvasWidth, this.canvasHeight);
            const ctx = offscreen.getContext('2d')!;
            ctx.drawImage(bmp, 0, 0);
            const blob = await offscreen.convertToBlob({ type: 'image/png' });
            return { layerIndex: index, blob };
        })).then(layers => {
            if (!this.db) return;
            const tx = this.db.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').put({ eventId, layers });
        });
    }

    public garbageCollect(validEventIds: string[]) {
        const validSet = new Set(validEventIds);
        for (const [id] of this.memoryCache.entries()) {
            if (!validSet.has(id)) this.memoryCache.delete(id);
        }
        if (this.db) {
            const tx = this.db.transaction('snapshots', 'readwrite');
            const store = tx.objectStore('snapshots');
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                if (cursor) {
                    if (!validSet.has(cursor.key as string)) cursor.delete();
                    cursor.continue();
                }
            };
        }
    }

    // Invalida snapshots a partir de un eventId específico.
    // Los snapshots anteriores al evento desecho siguen siendo válidos
    // para que el rebuild arranque desde el más cercano en lugar de desde cero.
    public invalidateFrom(eventId: string, allEventIds: string[]): void {
        const cutoffIndex = allEventIds.indexOf(eventId);
        if (cutoffIndex === -1) {
            // Evento no encontrado — safe fallback, no tocamos nada
            return;
        }

        const validIds = new Set(allEventIds.slice(0, cutoffIndex));

        // Limpiar memoria solo para snapshots posteriores al cutoff
        for (const [id] of this.memoryCache.entries()) {
            if (!validIds.has(id)) {
                this.memoryCache.delete(id);
            }
        }

        // Limpiar IDB solo para snapshots posteriores al cutoff
        if (this.db) {
            const tx = this.db.transaction('snapshots', 'readwrite');
            const store = tx.objectStore('snapshots');
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                if (cursor) {
                    if (!validIds.has(cursor.key as string)) cursor.delete();
                    cursor.continue();
                }
            };
        }
    }

    public clearAll() {
        this.memoryCache.clear();
        if (this.db) {
            const tx = this.db.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').clear();
        }
    }

    public getStats() {
        return { memoryCacheSize: this.memoryCache.size };
    }
}