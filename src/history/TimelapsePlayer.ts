// src/history/TimelapsePlayer.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { TimelineEvent } from './HistoryManager';
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

    public async play(spine: TimelineEvent[], brush: BrushEngine, delayMs: number = 30) {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this.engine.clearActiveLayer();
        const ctx = this.engine.getActiveLayerContext();

        const drawnCommands: ICommand[] = [];
        // === NUEVO: Acumulador de Matrices ===
        const currentTransforms = new Map<string, DOMMatrix>();

        console.log(`🎬 Iniciando Timelapse Inteligente...`);

        for (const event of spine) {
            if (!this.isPlaying) break;

            // === EVENTO DE MATRIZ ===
            if (event.type === 'TRANSFORM' && event.targetIds && event.transformMatrix) {
                const newMatrix = new DOMMatrix(event.transformMatrix);

                for (const id of event.targetIds) {
                    const current = currentTransforms.get(id) || new DOMMatrix();
                    current.multiplySelf(newMatrix); // Acumulamos las transformaciones
                    currentTransforms.set(id, current);
                }

                // Flash visual: Limpiamos y redibujamos todo en su nueva posición
                this.engine.clearActiveLayer();
                for (const cmd of drawnCommands) {
                    const t = currentTransforms.get(cmd.id);
                    if (t) {
                        cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    }
                    cmd.execute(ctx);
                }

                // Pausa dramática para que el usuario vea el movimiento
                await new Promise(resolve => setTimeout(resolve, delayMs * 3));
                continue;
            }

            // === TRAZOS NORMALES ===
            if (event.type === 'STROKE' || event.type === 'ERASE') {
                // Usamos la Factory respetando el Principio Open/Closed
                const cmd = CommandFactory.create(event, brush);
                await cmd.loadDataIfNeeded(this.storage);

                // Aplicamos la matriz si por alguna razón ya tuviera una
                const t = currentTransforms.get(cmd.id);
                if (t) {
                    cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                }

                // Para el timelapse rápido, ejecutamos todo directo en la capa final
                cmd.execute(ctx);
                drawnCommands.push(cmd);

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        console.log("✅ Timelapse finalizado");
        this.isPlaying = false;
    }
}