// src/history/TimelapsePlayer.ts
//
// Reproduce el timeline cronológicamente como una animación.
//
// Cambios vs versión anterior:
//   - Importa TimelineEvent desde TimelineTypes (no desde HistoryManager)
//   - Respeta HIDE: trazos ocultos no aparecen en el timelapse
//   - buildPlaylist() colapsa TRANSFORMs consecutivos del mismo grupo
//   - preloadAllData() carga todo en batch antes de reproducir (sigue igual)
//   - dataMap local — nunca toca event.data del objeto vivo (sigue igual)

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { TimelineEvent } from './TimelineTypes';   // ← importa de TimelineTypes
import type { StorageManager } from '../storage/StorageManager';
import type { ICommand } from './commands/ICommand';
import { CommandFactory } from './commands/CommandFactory';

export class TimelapsePlayer {
    private engine: CanvasEngine;
    private storage: StorageManager;
    public isPlaying: boolean = false;

    constructor(engine: CanvasEngine, storage: StorageManager) {
        this.engine = engine;
        this.storage = storage;
    }

    // ── Construcción de la playlist ───────────────────────────────────────
    // Colapsa TRANSFORMs consecutivos del mismo grupo en uno solo.
    // Esto evita que el timelapse muestre micro-movimientos intermedios.
    // También filtra eventos HIDE: los trazos ocultos no aparecen.
    private buildPlaylist(spine: TimelineEvent[]): any[] {
        const playlist: any[] = [];

        // Primero: acumular qué IDs están ocultos al llegar a cada evento HIDE
        // (respeta el orden cronológico de la spine)
        const hiddenIds = new Set<string>();
        for (const ev of spine) {
            if (ev.type === 'HIDE' && ev.targetIds) {
                for (const id of ev.targetIds) hiddenIds.add(id);
            }
        }

        let i = 0;
        while (i < spine.length) {
            const ev = spine[i];

            // HIDE: no emite nada al timelapse — el resultado ya está en hiddenIds
            if (ev.type === 'HIDE') {
                i++;
                continue;
            }

            // TRANSFORM: colapsar consecutivos del mismo grupo
            if (ev.type === 'TRANSFORM' && ev.targetIds && ev.transformMatrix) {
                let currentMatrix = new DOMMatrix(ev.transformMatrix);
                const sortedIds = ev.targetIds.slice().sort().join(',');

                let j = i + 1;
                while (
                    j < spine.length &&
                    spine[j].type === 'TRANSFORM' &&
                    spine[j].targetIds!.slice().sort().join(',') === sortedIds
                ) {
                    currentMatrix.multiplySelf(new DOMMatrix(spine[j].transformMatrix));
                    j++;
                }

                playlist.push({
                    ...ev,
                    type: 'TRANSFORM_COLLAPSED',
                    transformMatrix: [
                        currentMatrix.a, currentMatrix.b,
                        currentMatrix.c, currentMatrix.d,
                        currentMatrix.e, currentMatrix.f,
                    ],
                });

                i = j;
                continue;
            }

            // STROKE / ERASE: solo añadir si no está oculto
            if ((ev.type === 'STROKE' || ev.type === 'ERASE') && !hiddenIds.has(ev.id)) {
                playlist.push(ev);
            }

            // FILL y otros: añadir siempre que no estén ocultos
            if (ev.type === 'FILL' && !hiddenIds.has(ev.id)) {
                playlist.push(ev);
            }

            i++;
        }

        return playlist;
    }

    // ── Pre-carga batch — 1 transacción IDB para toda la sesión ──────────
    // Datos en Map LOCAL — nunca toca event.data del objeto vivo.
    // enforceRamLimit() puede operar sin interferir.
    private async preloadAllData(spine: TimelineEvent[]): Promise<Map<string, ArrayBuffer>> {
        const drawingEvents = spine.filter(
            ev => ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL'
        );

        const dataMap = new Map<string, ArrayBuffer>();
        const idsNeeded: string[] = [];

        for (const ev of drawingEvents) {
            if (ev.data) {
                dataMap.set(ev.id, ev.data);
            } else {
                idsNeeded.push(ev.id);
            }
        }

        if (idsNeeded.length > 0) {
            console.log(`[Timelapse] Cargando ${idsNeeded.length} trazos desde IDB...`);
            const batchResult = await this.storage.loadEventDataBatch(idsNeeded);

            for (const [id, buffer] of batchResult.entries()) {
                dataMap.set(id, buffer);
            }

            const missing = idsNeeded.filter(id => !batchResult.has(id));
            if (missing.length > 0) {
                console.error(
                    `[Timelapse] ⚠️ ${missing.length} trazos no encontrados en IDB ni en RAM.\n` +
                    `Causa probable: dibujados antes de que storage.init() completara.\n` +
                    `IDs:`, missing
                );
            }
        }

        console.log(`[Timelapse] Pre-carga completa: ${dataMap.size}/${drawingEvents.length} trazos`);
        return dataMap;
    }

    // ── Reproducción ──────────────────────────────────────────────────────
    public async play(spine: TimelineEvent[], brush: BrushEngine, delayMs = 30): Promise<void> {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this.engine.clearActiveLayer();
        const ctx = this.engine.getActiveLayerContext();
        const drawnCommands: ICommand[] = [];
        const currentTransforms = new Map<string, DOMMatrix>();

        console.log(`🎬 Timelapse: ${spine.length} eventos en la spine`);

        // Pre-cargar TODO antes de animar — eliminamos la dependencia de event.data
        const dataMap = await this.preloadAllData(spine);
        const playlist = this.buildPlaylist(spine);

        console.log(`🎬 Reproduciendo ${playlist.length} pasos...`);

        for (const event of playlist) {
            if (!this.isPlaying) break;

            // ── TRANSFORM colapsado ──────────────────────────────────────
            if (event.type === 'TRANSFORM_COLLAPSED' && event.targetIds && event.transformMatrix) {
                const newMatrix = new DOMMatrix(event.transformMatrix);

                for (const id of event.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    current.multiplySelf(newMatrix);
                    currentTransforms.set(id, current);
                }

                // Redibujar todo con las matrices actualizadas
                this.engine.clearActiveLayer();
                for (const cmd of drawnCommands) {
                    const t = currentTransforms.get(cmd.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    cmd.execute(ctx);
                }

                await new Promise(resolve => setTimeout(resolve, delayMs * 3));
                continue;
            }

            // ── STROKE / ERASE / FILL ─────────────────────────────────────
            if (event.type === 'STROKE' || event.type === 'ERASE' || event.type === 'FILL') {
                const localData = dataMap.get(event.id);

                if (!localData) {
                    console.warn(`[Timelapse] Sin data para ${event.id} — omitido`);
                    continue;
                }

                // Snapshot local del evento con data garantizada
                // NO mutamos el objeto vivo del timeline
                const eventSnapshot: TimelineEvent = { ...event, data: localData };
                const cmd = CommandFactory.create(eventSnapshot, brush);

                const t = currentTransforms.get(cmd.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

                cmd.execute(ctx);
                drawnCommands.push(cmd);

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        console.log('✅ Timelapse finalizado');
        this.isPlaying = false;
    }
}