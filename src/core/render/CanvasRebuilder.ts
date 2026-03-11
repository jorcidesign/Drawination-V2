// src/core/render/CanvasRebuilder.ts
import type { CanvasEngine } from '../engine/CanvasEngine';
import type { HistoryManager } from '../../history/HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from './BrushEngine';
import { BinarySerializer } from '../io/BinarySerializer';
import type { SelectionManager } from '../selection/SelectionManager';

export class CanvasRebuilder {
    private engine: CanvasEngine;
    private history: HistoryManager;
    private storage: StorageManager;
    private selection: SelectionManager;
    private isRebuilding = false;

    constructor(engine: CanvasEngine, history: HistoryManager, storage: StorageManager, selection: SelectionManager) {
        this.engine = engine;
        this.history = history;
        this.storage = storage;
        this.selection = selection;
    }

    public async rebuild(activeBrush: BrushEngine): Promise<void> {
        if (this.isRebuilding) return;
        this.isRebuilding = true;
        const startTime = performance.now();

        try {
            const ctx = this.engine.getActiveLayerContext();
            const activeCommands = this.history.getActiveCommands(activeBrush);

            let snapshot: ImageBitmap | null = null;
            let startIndex = 0;

            for (let i = activeCommands.length - 1; i >= 0; i--) {
                snapshot = await this.history.cacheManager.getSnapshot(activeCommands[i].id);
                if (snapshot) {
                    startIndex = i + 1;
                    break;
                }
            }

            for (let i = startIndex; i < activeCommands.length; i++) {
                await activeCommands[i].loadDataIfNeeded(this.storage);
            }

            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            this.engine.clearActiveLayer();
            ctx.restore();

            if (snapshot) ctx.drawImage(snapshot, 0, 0);

            for (let i = startIndex; i < activeCommands.length; i++) {
                const command = activeCommands[i];

                // === EL GUARDIÁN: Si está seleccionado, NO SE DIBUJA en la capa base ===
                if (this.selection.isSelected(command.id)) continue;

                if (command.type === 'ERASE' || command.type === 'TRANSFORM') {
                    command.execute(ctx);
                } else {
                    this.engine.clearPaintingCanvas();
                    command.execute(this.engine.paintingContext);
                    this.engine.commitPaintingCanvas();
                }
            }

            const timeTaken = performance.now() - startTime;
            if (timeTaken > 16 && activeCommands.length > 0) {
                const lastCommand = activeCommands[activeCommands.length - 1];
                this.history.cacheManager.bake(lastCommand.id, this.engine.getActiveLayerContext().canvas);
            }

        } finally {
            this.isRebuilding = false;
        }
    }
    public debugDrawPoints(activeBrush: BrushEngine) {
        const ctx = this.engine.getActiveLayerContext();
        const activeCommands = this.history.getActiveCommands(activeBrush);

        for (const command of activeCommands) {
            const rawData = command.getRawData();
            if (rawData) {
                const pts = BinarySerializer.decode(rawData);
                ctx.fillStyle = 'red';
                for (const pt of pts) {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
}