// src/history/TimelapsePlayer.ts
//
// Reproduce el timeline cronológicamente como una animación.

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { TimelineEvent } from './TimelineTypes';
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

    private buildPlaylist(spine: TimelineEvent[]): any[] {
        const playlist: any[] = [];
        const hiddenIds = new Set<string>();

        for (const ev of spine) {
            if (ev.type === 'HIDE' && ev.targetIds) {
                for (const id of ev.targetIds) hiddenIds.add(id);
            }
        }

        let i = 0;
        while (i < spine.length) {
            const ev = spine[i];

            if (ev.type === 'HIDE') {
                i++;
                continue;
            }

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

            if ((ev.type === 'STROKE' || ev.type === 'ERASE') && !hiddenIds.has(ev.id)) {
                playlist.push(ev);
            }

            if (ev.type === 'FILL' && !hiddenIds.has(ev.id)) {
                playlist.push(ev);
            }

            i++;
        }

        return playlist;
    }

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

    public async play(spine: TimelineEvent[], brush: BrushEngine, delayMs = 30): Promise<void> {
        if (this.isPlaying) return;
        this.isPlaying = true;

        // === FIX 1: Limpiar TODAS las capas antes de empezar ===
        this.engine.clearAllLayers();

        const drawnCommands: ICommand[] = [];
        const currentTransforms = new Map<string, DOMMatrix>();

        console.log(`🎬 Timelapse: ${spine.length} eventos en la spine`);

        const dataMap = await this.preloadAllData(spine);
        const playlist = this.buildPlaylist(spine);

        // Necesitamos state para el enrutamiento virtual de capas (Merge Down) en el timelapse
        const state = (window as any).drawinationApp.container.history.getState();

        console.log(`🎬 Reproduciendo ${playlist.length} pasos...`);

        for (const event of playlist) {
            if (!this.isPlaying) break;

            if (event.type === 'TRANSFORM_COLLAPSED' && event.targetIds && event.transformMatrix) {
                const newMatrix = new DOMMatrix(event.transformMatrix);

                for (const id of event.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    current.multiplySelf(newMatrix);
                    currentTransforms.set(id, current);
                }

                // === FIX 2: Limpiar TODAS las capas al re-renderizar un transform ===
                this.engine.clearAllLayers();

                for (const cmd of drawnCommands) {
                    const t = currentTransforms.get(cmd.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

                    const originalLayer = (cmd as any).event?.layerIndex ?? 0;
                    const targetLayer = state.layerRoute.get(originalLayer) ?? originalLayer;
                    const targetCtx = this.engine.getLayerContext(targetLayer);

                    cmd.execute(targetCtx);
                }

                await new Promise(resolve => setTimeout(resolve, delayMs * 3));
                continue;
            }

            if (event.type === 'STROKE' || event.type === 'ERASE' || event.type === 'FILL') {
                const localData = dataMap.get(event.id);

                if (!localData) {
                    console.warn(`[Timelapse] Sin data para ${event.id} — omitido`);
                    continue;
                }

                const eventSnapshot: TimelineEvent = { ...event, data: localData };
                const cmd = CommandFactory.create(eventSnapshot, brush);

                const t = currentTransforms.get(cmd.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

                const originalLayer = event.layerIndex ?? 0;
                const targetLayer = state.layerRoute.get(originalLayer) ?? originalLayer;
                const targetCtx = this.engine.getLayerContext(targetLayer);

                cmd.execute(targetCtx);
                drawnCommands.push(cmd);

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        console.log('✅ Timelapse finalizado');
        this.isPlaying = false;
    }
}