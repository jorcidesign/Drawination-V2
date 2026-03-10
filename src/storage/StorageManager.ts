// src/core/StorageManager.ts
import type { TimelineEvent } from '../history/HistoryManager';

export class StorageManager {
    private dbName = 'DrawinationDB';
    private storeName = 'timeline_events';
    private db: IDBDatabase | null = null;

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => { this.db = request.result; resolve(); };
            request.onerror = () => reject(request.error);
        });
    }

    private async decompressData(buffer: ArrayBuffer): Promise<ArrayBuffer> {
        const stream = new DecompressionStream('deflate-raw');
        const writer = stream.writable.getWriter();
        writer.write(buffer);
        writer.close();
        return await new Response(stream.readable).arrayBuffer();
    }

    public async saveEvent(event: TimelineEvent): Promise<number> {
        if (!this.db) return 0;
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

    // === NUEVO: Recuperador Quirúrgico ===
    // Busca un solo trazo en el disco y lo descomprime al vuelo
    public async loadEventData(id: string): Promise<ArrayBuffer | null> {
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const request = tx.objectStore(this.storeName).get(id);

            request.onsuccess = async () => {
                const ev = request.result as TimelineEvent;
                if (!ev) return resolve(null);

                if (ev.isCompressed && ev.data) {
                    resolve(await this.decompressData(ev.data));
                } else {
                    resolve(ev.data || null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async loadTimeline(): Promise<TimelineEvent[]> {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const request = tx.objectStore(this.storeName).getAll();

            request.onsuccess = async () => {
                const events = request.result as TimelineEvent[];
                events.sort((a, b) => a.timestamp - b.timestamp);
                // Al cargar la app por primera vez, NO descomprimimos la data (ahorramos RAM).
                // Dejamos que el Controller pida los datos solo cuando los necesite pintar.
                for (const ev of events) {
                    ev.data = null; // Vaciamos la RAM inicial
                }
                resolve(events);
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async clearAll(): Promise<void> {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}