// src/core/render/CanvasRebuilder.ts
//
// CAMBIOS vs versión anterior:
//
// 1. FIDELIDAD: todos los comandos van directo al canvas destino (igual que timelapse).
//    No se usa paintingContext como intermediario — elimina la divergencia visual.
//
// 2. PREPARACIÓN FASE 4 — Enrutamiento por capa:
//    Cada comando tiene un layerIndex. El rebuilder pide al engine el contexto
//    correcto para esa capa antes de ejecutar el comando.
//    Mientras solo existe la capa 0, getLayerContext(0) === getActiveLayerContext().
//    Cuando Fase 4 añada multicapa, el engine expondrá getLayerContext(n) y
//    este rebuilder funcionará sin ningún cambio adicional.
//
// 3. CHECKPOINT: persiste el canvas en IDB post-rebuild para arranque O(1).

import type { CanvasEngine } from '../engine/CanvasEngine';
import type { HistoryManager } from '../../history/HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from './BrushEngine';
import { BinarySerializer } from '../io/BinarySerializer';
import type { SelectionManager } from '../selection/SelectionManager';
import type { CheckpointManager } from '../../history/CheckpointManager';

export class CanvasRebuilder {
    private engine: CanvasEngine;
    private history: HistoryManager;
    private storage: StorageManager;
    private selection: SelectionManager;
    private checkpoint: CheckpointManager | null;
    private isRebuilding = false;

    constructor(
        engine: CanvasEngine,
        history: HistoryManager,
        storage: StorageManager,
        selection: SelectionManager,
        checkpoint: CheckpointManager | null = null,
    ) {
        this.engine = engine;
        this.history = history;
        this.storage = storage;
        this.selection = selection;
        this.checkpoint = checkpoint;
    }

    public async rebuild(activeBrush: BrushEngine): Promise<void> {
        if (this.isRebuilding) return;
        this.isRebuilding = true;
        const startTime = performance.now();

        try {
            // ── Contexto de la capa activa (única por ahora) ──────────────
            // FASE 4: getLayerContext(n) enrutará a la capa correcta.
            // Por ahora todas las capas son la misma — compatibilidad perfecta.
            const ctx = this._getLayerContext(this.engine.activeLayerIndex);

            const activeCommands = this.history.getActiveCommands(activeBrush);

            // ── Snapshot más reciente en caché ────────────────────────────
            let snapshot = null;
            let startIndex = 0;

            for (let i = activeCommands.length - 1; i >= 0; i--) {
                snapshot = await this.history.cacheManager.getSnapshot(activeCommands[i].id);
                if (snapshot) {
                    startIndex = i + 1;
                    break;
                }
            }

            // ── Batch load IDB ────────────────────────────────────────────
            const commandsToRender = activeCommands.slice(startIndex);
            const idsToLoad: string[] = [];

            for (const cmd of commandsToRender) {
                if (!cmd.getRawData()) idsToLoad.push(cmd.id);
            }

            if (idsToLoad.length > 0) {
                const batchData = await this.storage.loadEventDataBatch(idsToLoad);
                const { active } = this.history.getState();
                for (const [id, buffer] of batchData.entries()) {
                    const ev = active.find(e => e.id === id);
                    if (ev) ev.data = buffer;
                }
            }

            // ── Limpiar canvas ────────────────────────────────────────────
            // FASE 4: limpiar cada capa por separado.
            // Por ahora solo existe activeLayerIndex.
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            this.engine.clearActiveLayer();
            ctx.restore();

            if (snapshot) ctx.drawImage(snapshot, 0, 0);

            // ── Redibujar — path idéntico al timelapse ────────────────────
            // FASE 4: cada comando se enruta a su capa usando command.layerIndex.
            // Mientras solo existe la capa 0, _getLayerContext siempre devuelve
            // el mismo contexto — zero overhead, cero cambios visibles.
            for (const command of commandsToRender) {
                if (this.selection.isSelected(command.id)) continue;

                // Enrutamiento por capa — preparado para Fase 4
                const targetCtx = this._getLayerContext(
                    (command as any).layerIndex ?? this.engine.activeLayerIndex
                );
                command.execute(targetCtx);
            }

            const timeTaken = performance.now() - startTime;

            // ── Cache de snapshots ────────────────────────────────────────
            if (activeCommands.length > 0 && !this.selection.hasSelection()) {
                const lastCmd = activeCommands[activeCommands.length - 1];
                const isKeyframe = (activeCommands.length % 50 === 0);

                if (timeTaken > 8 || isKeyframe) {
                    this.history.cacheManager.bake(
                        lastCmd.id,
                        this.engine.getActiveLayerContext().canvas,
                        isKeyframe
                    );
                }

                // ── Checkpoint persistente ────────────────────────────────
                if (this.checkpoint && (timeTaken > 8 || isKeyframe)) {
                    const { spine } = this.history.getState();
                    if (spine.length > 0) {
                        this.checkpoint.scheduleCheckpoint(
                            spine[spine.length - 1].id,
                            this.engine.getActiveLayerContext().canvas,
                            spine.length
                        );
                    }
                }
            }

        } finally {
            this.isRebuilding = false;
        }
    }

    // ── Enrutamiento de capa ──────────────────────────────────────────────
    // Fase 3 (ahora): siempre devuelve activeLayerContext.
    // Fase 4: el engine expondrá getLayerContext(index) y este método
    // lo llamará directamente — un solo cambio aquí cubre todo el sistema.
    private _getLayerContext(layerIndex: number): CanvasRenderingContext2D {
        // Cuando CanvasEngine tenga multicapa:
        // if (typeof this.engine.getLayerContext === 'function') {
        //     return this.engine.getLayerContext(layerIndex);
        // }
        return this.engine.getActiveLayerContext();
    }

    public debugDrawPoints(activeBrush: BrushEngine): void {
        const ctx = this.engine.getActiveLayerContext();
        const activeCommands = this.history.getActiveCommands(activeBrush);

        for (const command of activeCommands) {
            const rawData = command.getRawData();
            if (!rawData) continue;
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