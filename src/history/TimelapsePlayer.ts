// src/history/TimelapsePlayer.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { TimelineEvent } from './HistoryManager';
import type { StorageManager } from '../storage/StorageManager';
import type { ICommand } from './commands/ICommand';
import { StrokeCommand } from './commands/StrokeCommand';
import { EraseCommand } from './commands/EraseCommand';

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
        const currentTransforms = new Map<string, { dx: number, dy: number }>();

        console.log(`🎬 Iniciando Timelapse Inteligente...`);

        for (const event of spine) {
            if (!this.isPlaying) break;

            // Si es un evento de transformación, actualizamos coordenadas y hacemos FLASH
            if (event.type === 'TRANSFORM' && event.targetIds) {
                for (const id of event.targetIds) {
                    const t = currentTransforms.get(id) || { dx: 0, dy: 0 };
                    t.dx += event.transformDx || 0;
                    t.dy += event.transformDy || 0;
                    currentTransforms.set(id, t);
                }

                // Flash visual: Limpiamos y redibujamos todo a máxima velocidad
                this.engine.clearActiveLayer();
                for (const cmd of drawnCommands) {
                    const t = currentTransforms.get(cmd.id);
                    cmd.dx = t?.dx || 0;
                    cmd.dy = t?.dy || 0;
                    cmd.execute(ctx);
                }

                // Pausa dramática para que el usuario vea el movimiento
                await new Promise(resolve => setTimeout(resolve, delayMs * 3));
                continue;
            }

            // Si es un trazo normal o borrador
            if (event.type === 'STROKE' || event.type === 'ERASE') {
                let cmd: ICommand;
                if (event.type === 'ERASE') cmd = new EraseCommand(event, brush);
                else cmd = new StrokeCommand(event, brush);

                await cmd.loadDataIfNeeded(this.storage);

                // Para el timelapse rápido, ejecutamos todo directo en el ctx
                cmd.execute(ctx);
                drawnCommands.push(cmd);

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        console.log("✅ Timelapse finalizado");
        this.isPlaying = false;
    }
}