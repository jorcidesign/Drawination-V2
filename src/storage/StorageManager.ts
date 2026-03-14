// src/storage/StorageManager.ts
//
// CAMBIO vs versión anterior:
//   saveEvent() ahora persiste eventos de control (UNDO, REDO) además de
//   eventos de dibujo (STROKE, ERASE, FILL).
//
// POR QUÉ:
//   Los eventos UNDO/REDO son necesarios para que computeTimelineState()
//   reconstruya el estado correcto al recargar la página. Sin ellos,
//   todos los STROKE/ERASE/FILL aparecen como activos — incluyendo los
//   que el usuario había deshecho.
//
// TAMAÑO: un evento UNDO/REDO en IDB ocupa ~200 bytes (solo metadata JSON,
//   sin ArrayBuffer). Es despreciable comparado con los trazos binarios.
//
// GUARD ACTUALIZADO:
//   Antes: solo guardaba si (isDataEvent && hasPayload)
//   Ahora: guarda si (isDataEvent && hasPayload) || isControlEvent
//   Los eventos TRANSFORM, HIDE etc. ya se guardaban por el flujo normal
//   (no son isDataEvent, no tienen el guard).

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
        const isControlEvent = event.type === 'UNDO' || event.type === 'REDO';

        // Eventos de dibujo: requieren data binaria
        if (isDataEvent) {
            const hasPayload = event.data !== null || event.compressedData !== undefined;
            if (!hasPayload) return 0;
        }

        // Eventos de control (UNDO/REDO): se persisten como metadata pura, sin data.
        // Todos los demás (TRANSFORM, HIDE, etc.) pasan directamente.

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

    public async loadEventDataBatch(ids: string[]): Promise<Map<string, ArrayBuffer>> {
        await this.readyPromise;
        if (!this.db || ids.length === 0) return new Map();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const results = new Map<string, ArrayBuffer | null>();
            const eventsToDecompress: Array<{ id: string, data: ArrayBuffer }> = [];

            let pending = ids.length;

            const checkDone = () => {
                pending--;
                if (pending === 0) {
                    this.processBatchDecompression(results, eventsToDecompress)
                        .then(resolve)
                        .catch(reject);
                }
            };

            for (const id of ids) {
                const request = store.get(id);
                request.onsuccess = () => {
                    const ev = request.result as TimelineEvent;
                    if (ev) {
                        if (ev.isCompressed && ev.data) {
                            eventsToDecompress.push({ id, data: ev.data });
                        } else if (ev.data) {
                            results.set(id, ev.data);
                        }
                    }
                    checkDone();
                };
                request.onerror = () => {
                    console.error(`[Storage] Error getting ${id}`, request.error);
                    checkDone();
                };
            }
        });
    }

    private async processBatchDecompression(
        results: Map<string, ArrayBuffer | null>,
        toDecompress: Array<{ id: string, data: ArrayBuffer }>
    ): Promise<Map<string, ArrayBuffer>> {
        await Promise.all(
            toDecompress.map(async (item) => {
                try {
                    const decomp = await this.decompressData(item.data);
                    results.set(item.id, decomp);
                } catch (e) {
                    console.error(`[Storage] Batch decompress err id ${item.id}`, e);
                }
            })
        );

        const finalMap = new Map<string, ArrayBuffer>();
        for (const [id, buffer] of results.entries()) {
            if (buffer) finalMap.set(id, buffer);
        }
        return finalMap;
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
                    // Solo nullear data de eventos de dibujo — los de control no tienen data
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