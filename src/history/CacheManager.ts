// src/history/CacheManager.ts
export interface MemorySnapshot {
    eventId: string;
    bitmap: ImageBitmap;
    timestamp: number;
}

export interface DBSnapshot {
    eventId: string;
    blob: Blob;
}

export class CacheManager {
    private memoryCache: Map<string, MemorySnapshot> = new Map();
    private db: IDBDatabase | null = null;
    private readonly canvasWidth: number;
    private readonly canvasHeight: number;

    // Ring Buffer: RAM suficiente para Ctrl+Z ultrarrápido (aprox 40-50MB)
    private readonly MAX_MEMORY_SNAPS = 15;

    constructor(canvasWidth: number, canvasHeight: number) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.initDB();
    }

    private initDB() {
        const req = indexedDB.open('DrawinationCacheDB', 1);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('snapshots')) {
                db.createObjectStore('snapshots', { keyPath: 'eventId' });
            }
        };
        req.onsuccess = (e) => { this.db = (e.target as IDBOpenDBRequest).result; };
    }

    // Bake ahora distingue si es un Keyframe (va a disco) o solo Ring Buffer (RAM)
    public async bake(eventId: string, canvas: HTMLCanvasElement, isKeyframe: boolean = false): Promise<void> {
        const bitmap = await createImageBitmap(canvas);
        this.addToMemory(eventId, bitmap);

        // Solo guardamos en disco si es un Keyframe ancla (cada 50 trazos)
        if (isKeyframe) {
            this.persistToDB(eventId, bitmap);
        }
    }

    public async getSnapshot(eventId: string): Promise<ImageBitmap | null> {
        if (this.memoryCache.has(eventId)) {
            const entry = this.memoryCache.get(eventId)!;
            entry.timestamp = Date.now(); // Actualiza uso (LRU)
            return entry.bitmap;
        }

        if (!this.db) return null;

        return new Promise((resolve) => {
            const tx = this.db!.transaction('snapshots', 'readonly');
            const req = tx.objectStore('snapshots').get(eventId);

            req.onsuccess = async () => {
                const result = req.result as DBSnapshot;
                if (result && result.blob) {
                    const bitmap = await createImageBitmap(result.blob);
                    // Al traerlo de disco, lo subimos a la RAM temporalmente
                    this.addToMemory(eventId, bitmap);
                    resolve(bitmap);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }

    private addToMemory(eventId: string, bitmap: ImageBitmap) {
        this.memoryCache.set(eventId, { eventId, bitmap, timestamp: Date.now() });

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
                // Ya NO lo mandamos a disco obligatoriamente. Lo descartamos de RAM.
                // Si era un keyframe, ya está en disco. Si no, no importa.
                this.memoryCache.delete(oldestId);
            }
        }
    }

    private persistToDB(eventId: string, bitmap: ImageBitmap) {
        if (!this.db) return;
        const offscreen = new OffscreenCanvas(this.canvasWidth, this.canvasHeight);
        const ctx = offscreen.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);

        offscreen.convertToBlob({ type: 'image/png' }).then(blob => {
            if (!this.db) return;
            const tx = this.db.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').put({ eventId, blob });
        });
    }

    // === ESTRATEGIA: Garbage Collection Diferido ===
    // Solo borra fotos que pertenecen a IDs que ya NO EXISTEN en la línea de tiempo viva ni deshecha.
    public garbageCollect(validEventIds: string[]) {
        const validSet = new Set(validEventIds);

        for (const [id, _] of this.memoryCache.entries()) {
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