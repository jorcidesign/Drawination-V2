// src/history/TimelapsePlayer.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
// === CAMBIAMOS EL IMPORT ===
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

    // Actualizamos el tipo aquí
    public async play(timeline: TimelineEvent[], brush: BrushEngine, delayMs: number = 30) {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this.engine.clearActiveLayer();
        const ctx = this.engine.getActiveLayerContext();

        console.log(`🎬 Iniciando Timelapse Inteligente...`);

        for (const event of timeline) {
            if (!this.isPlaying) break;
            if (event.type === 'UNDO' || event.type === 'REDO') continue;

            let command: ICommand;
            if (event.type === 'ERASE') {
                command = new EraseCommand(event, brush);
            } else {
                command = new StrokeCommand(event, brush);
            }

            await command.loadDataIfNeeded(this.storage);
            command.execute(ctx);

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        console.log("✅ Timelapse finalizado");
        this.isPlaying = false;
    }
}