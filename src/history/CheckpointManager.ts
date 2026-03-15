// src/history/CheckpointManager.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';

export interface CheckpointRecord {
    lastEventId: string;
    layers: { layerIndex: number; blob: Blob }[];
    savedAt: number;
    eventCount: number;
}

export class CheckpointManager {
    private static readonly DB_NAME = 'DrawinationCheckpointDB';
    private static readonly STORE_NAME = 'checkpoints';
    private static readonly CHECKPOINT_KEY = 'current';
    private static readonly DB_VERSION = 2; // Subimos versión

    private db: IDBDatabase | null = null;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly DEBOUNCE_MS = 1500;

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CheckpointManager.DB_NAME, CheckpointManager.DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(CheckpointManager.STORE_NAME)) {
                    db.createObjectStore(CheckpointManager.STORE_NAME);
                } else {
                    db.deleteObjectStore(CheckpointManager.STORE_NAME);
                    db.createObjectStore(CheckpointManager.STORE_NAME);
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    public scheduleCheckpoint(
        lastEventId: string,
        engine: CanvasEngine,
        eventCount: number
    ): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(() => {
            this._persist(lastEventId, engine, eventCount).catch(err => {
                console.warn('[CheckpointManager] Error al guardar checkpoint:', err);
            });
        }, CheckpointManager.DEBOUNCE_MS);
    }

    public async tryRestore(
        expectedLastEventId: string,
        expectedEventCount: number
    ): Promise<Map<number, ImageBitmap> | null> {
        if (!this.db) return null;

        try {
            const record = await this._load();
            if (!record) return null;

            if (record.lastEventId !== expectedLastEventId || record.eventCount !== expectedEventCount) {
                console.info(`[CheckpointManager] Checkpoint desactualizado. Se hará rebuild completo.`);
                return null;
            }

            const bitmaps = new Map<number, ImageBitmap>();
            await Promise.all(record.layers.map(async (layer) => {
                bitmaps.set(layer.layerIndex, await createImageBitmap(layer.blob));
            }));

            console.info(`[CheckpointManager] ✅ Checkpoint restaurado. ${expectedEventCount} eventos.`);
            return bitmaps;

        } catch (err) {
            console.warn('[CheckpointManager] Error al restaurar checkpoint:', err);
            return null;
        }
    }

    public async invalidate(): Promise<void> {
        if (!this.db) return;
        if (this.saveTimer) clearTimeout(this.saveTimer);

        return new Promise((resolve) => {
            const tx = this.db!.transaction(CheckpointManager.STORE_NAME, 'readwrite');
            tx.objectStore(CheckpointManager.STORE_NAME).delete(CheckpointManager.CHECKPOINT_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    private async _persist(lastEventId: string, engine: CanvasEngine, eventCount: number): Promise<void> {
        if (!this.db) return;

        const layers: { layerIndex: number; blob: Blob }[] = [];

        // Extracción paralela y asíncrona de los 10 canvas
        await Promise.all(Array.from({ length: 10 }).map(async (_, i) => {
            const canvas = engine.getLayerCanvas(i);
            const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error()), 'image/png'));
            layers.push({ layerIndex: i, blob });
        }));

        const record: CheckpointRecord = {
            lastEventId, layers, savedAt: Date.now(), eventCount
        };

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(CheckpointManager.STORE_NAME, 'readwrite');
            tx.objectStore(CheckpointManager.STORE_NAME).put(record, CheckpointManager.CHECKPOINT_KEY);
            tx.oncomplete = () => {
                console.info(`[CheckpointManager] 💾 Checkpoint multicapa guardado. events: ${eventCount}`);
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    private async _load(): Promise<CheckpointRecord | null> {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db!.transaction(CheckpointManager.STORE_NAME, 'readonly');
            const request = tx.objectStore(CheckpointManager.STORE_NAME).get(CheckpointManager.CHECKPOINT_KEY);
            request.onsuccess = () => resolve(request.result as CheckpointRecord | null);
            request.onerror = () => resolve(null);
        });
    }
}