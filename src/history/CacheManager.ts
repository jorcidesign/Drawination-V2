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

    // === OPTIMIZACIÓN DESKTOP: Subimos la memoria RAM al máximo ===
    // En Desktop, 20 snapshots de 1000x1000 pesan unos 80MB. ¡Eso es nada!
    private readonly MAX_MEMORY_SNAPS = 20;

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

    // "Hornea" el estado actual del Canvas y lo guarda usando el ID del último comando
    public async bake(eventId: string, canvas: HTMLCanvasElement): Promise<void> {
        const bitmap = await createImageBitmap(canvas);
        this.addToMemory(eventId, bitmap);
    }

    // Busca la foto de un comando específico (Busca en RAM primero, luego en Disco)
    public async getSnapshot(eventId: string): Promise<ImageBitmap | null> {
        if (this.memoryCache.has(eventId)) {
            const entry = this.memoryCache.get(eventId)!;
            entry.timestamp = Date.now(); // Actualizamos el uso
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
                    this.addToMemory(eventId, bitmap); // Lo devolvemos a la RAM
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

        // Si llenamos la RAM, echamos la foto más vieja al disco duro
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
                const evicted = this.memoryCache.get(oldestId)!;
                this.memoryCache.delete(oldestId);
                this.persistToDB(oldestId, evicted.bitmap);
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