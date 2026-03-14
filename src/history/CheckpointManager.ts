// src/history/CheckpointManager.ts
//
// Responsabilidad: persistir y restaurar un "checkpoint" del canvas completo
// en IndexedDB para que el primer rebuild post-recarga sea O(1) en vez de O(n).
//
// PROBLEMA QUE RESUELVE:
//   Tras recargar la página, CacheManager empieza vacío.
//   rebuild() no encuentra ningún snapshot y recorre todo el timeline,
//   ejecutando cada StrokeCommand/EraseCommand desde cero — O(n) total.
//   Con 500 trazos y Ctrl+Z inmediato, eso son 500 × rebuild = 500² ops.
//
// SOLUCIÓN — Patrón: Write-Through Cache + Lazy Restore
//   1. Al terminar cada rebuild() exitoso, guardamos una imagen del canvas
//      en IDB bajo la clave del ÚLTIMO evento activo del timeline.
//   2. Al arrancar (AppContainer.start()), antes de llamar a rebuild(),
//      buscamos ese checkpoint. Si existe Y corresponde al estado actual,
//      lo restauramos directamente en el canvas y lo inyectamos en
//      CacheManager como si fuera un snapshot RAM.
//   3. Si el checkpoint no existe o está desactualizado (el timeline
//      continuó después), el rebuild normal se hace pero ahora el
//      CacheManager ya tiene al menos el checkpoint del evento ancla
//      más reciente, reduciendo el trabajo a (n - checkpoint_index) ops.
//
// INVARIANTE DE CORRECTITUD:
//   El checkpoint se guarda SOLO cuando rebuild() completa sin interrupciones.
//   Si el timeline cambia entre el checkpoint y el inicio, se descarta y
//   se hace un rebuild completo. Nunca se sirve un canvas corrompido.
//
// INTEGRACIÓN — Zero-Breaking Changes:
//   No modifica HistoryManager, CacheManager, ni CanvasRebuilder.
//   Se conecta como decorador opcional en AppContainer.start().

export interface CheckpointRecord {
    // ID del evento más reciente del timeline cuando se tomó el checkpoint.
    // Sirve como "firma" del estado del canvas en ese momento.
    lastEventId: string;

    // Snapshot del canvas comprimido como PNG blob
    blob: Blob;

    // Timestamp de creación — para GC y diagnóstico
    savedAt: number;

    // Número de eventos activos cuando se guardó (para validación rápida)
    eventCount: number;
}

export class CheckpointManager {
    private static readonly DB_NAME = 'DrawinationCheckpointDB';
    private static readonly STORE_NAME = 'checkpoints';
    private static readonly CHECKPOINT_KEY = 'current';
    private static readonly DB_VERSION = 1;

    private db: IDBDatabase | null = null;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounce: no guardar en cada Ctrl+Z, solo cuando el usuario
    // deja de operar por DEBOUNCE_MS milisegundos
    private static readonly DEBOUNCE_MS = 1500;

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CheckpointManager.DB_NAME, CheckpointManager.DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(CheckpointManager.STORE_NAME)) {
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

    // Guarda el estado actual del canvas como checkpoint.
    // Se llama con debounce después de cada rebuild exitoso.
    //
    // lastEventId: ID del último evento ACTIVO del timeline (spine[-1].id)
    // canvas:      el canvas de la capa activa, ya renderizado
    // eventCount:  longitud de spine activa, para validación posterior
    public scheduleCheckpoint(
        lastEventId: string,
        canvas: HTMLCanvasElement,
        eventCount: number
    ): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(() => {
            this._persist(lastEventId, canvas, eventCount).catch(err => {
                // Non-fatal: el checkpoint es una optimización, no un requisito
                console.warn('[CheckpointManager] Error al guardar checkpoint:', err);
            });
        }, CheckpointManager.DEBOUNCE_MS);
    }

    // Intenta restaurar el checkpoint. Retorna null si no existe o no
    // corresponde al estado actual del timeline.
    //
    // expectedLastEventId: ID del último evento activo del timeline actual
    // expectedEventCount:  longitud de spine activa actual
    public async tryRestore(
        expectedLastEventId: string,
        expectedEventCount: number
    ): Promise<ImageBitmap | null> {
        if (!this.db) return null;

        try {
            const record = await this._load();
            if (!record) return null;

            // Validar que el checkpoint corresponde exactamente al timeline actual
            if (record.lastEventId !== expectedLastEventId) {
                console.info(
                    `[CheckpointManager] Checkpoint desactualizado. ` +
                    `Esperado: ${expectedLastEventId}, guardado: ${record.lastEventId}. ` +
                    `Se hará rebuild completo.`
                );
                return null;
            }

            if (record.eventCount !== expectedEventCount) {
                console.info(
                    `[CheckpointManager] Checkpoint con conteo distinto. ` +
                    `Esperado: ${expectedEventCount}, guardado: ${record.eventCount}. ` +
                    `Se hará rebuild completo.`
                );
                return null;
            }

            // Checkpoint válido — convertir blob a ImageBitmap
            const bitmap = await createImageBitmap(record.blob);
            console.info(
                `[CheckpointManager] ✅ Checkpoint restaurado. ` +
                `${expectedEventCount} eventos, guardado ${this._ageStr(record.savedAt)} atrás.`
            );
            return bitmap;

        } catch (err) {
            console.warn('[CheckpointManager] Error al restaurar checkpoint:', err);
            return null;
        }
    }

    // Invalida el checkpoint actual (p.ej. cuando el usuario hace CLEAR_ALL)
    public async invalidate(): Promise<void> {
        if (!this.db) return;
        if (this.saveTimer) clearTimeout(this.saveTimer);

        return new Promise((resolve) => {
            const tx = this.db!.transaction(CheckpointManager.STORE_NAME, 'readwrite');
            tx.objectStore(CheckpointManager.STORE_NAME).delete(CheckpointManager.CHECKPOINT_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve(); // Non-fatal
        });
    }

    // ── Internals ────────────────────────────────────────────────────────

    private async _persist(
        lastEventId: string,
        canvas: HTMLCanvasElement,
        eventCount: number
    ): Promise<void> {
        if (!this.db) return;

        // Convertir canvas a blob PNG — más eficiente que toDataURL
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => b ? resolve(b) : reject(new Error('toBlob returned null')),
                'image/png'
            );
        });

        const record: CheckpointRecord = {
            lastEventId,
            blob,
            savedAt: Date.now(),
            eventCount,
        };

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(CheckpointManager.STORE_NAME, 'readwrite');
            tx.objectStore(CheckpointManager.STORE_NAME).put(record, CheckpointManager.CHECKPOINT_KEY);
            tx.oncomplete = () => {
                console.info(
                    `[CheckpointManager] 💾 Checkpoint guardado. ` +
                    `eventId: ${lastEventId.slice(0, 8)}… ` +
                    `events: ${eventCount}, ` +
                    `size: ${(blob.size / 1024).toFixed(1)}KB`
                );
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

    private _ageStr(savedAt: number): string {
        const ms = Date.now() - savedAt;
        if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
        return `${Math.round(ms / 3_600_000)}h`;
    }
}