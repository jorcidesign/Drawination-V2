// src/core/render/CanvasRebuilder.ts
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
            const state = this.history.getState();
            const activeCommands = this.history.getActiveCommands(activeBrush);

            // ── Búsqueda de Snapshot Multicapa ────────────────────────────
            let snapshotBitmaps: Map<number, ImageBitmap> | null = null;
            let startIndex = 0;

            // === FIX: Búsqueda basada en el Spine Cronológico ===
            // Los snapshots ahora se ligan al evento exacto en el root del historial,
            // garantizando que las modificaciones (TRANSFORM, etc) no reutilicen fotos.
            if (!this.selection.hasSelection()) {
                const spine = this.history.getTimelineSpine();
                let foundSpineIndex = -1;
                for (let i = spine.length - 1; i >= 0; i--) {
                    snapshotBitmaps = await this.history.cacheManager.getSnapshot(spine[i].id);
                    if (snapshotBitmaps) {
                        foundSpineIndex = i;
                        break;
                    }
                }

                if (snapshotBitmaps) {
                    const coveredSpineIds = new Set(spine.slice(0, foundSpineIndex + 1).map(e => e.id));
                    for (let j = 0; j < activeCommands.length; j++) {
                        if (coveredSpineIds.has(activeCommands[j].id)) {
                            startIndex = j + 1;
                        }
                    }
                }
            }

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

            // ── Limpiar e inyectar el Snapshot ────────────────────────────
            this.engine.clearAllLayers();

            if (snapshotBitmaps) {
                for (const [layerIndex, bmp] of snapshotBitmaps.entries()) {
                    const ctx = this.engine.getLayerContext(layerIndex);
                    ctx.drawImage(bmp, 0, 0);
                }
            }

            // ── Redibujar los trazos faltantes ────────────────────────────
            for (const command of commandsToRender) {
                if (this.selection.isSelected(command.id)) continue;

                const originalLayer = (command as any).event?.layerIndex ?? 0;
                const targetLayer = state.layerRoute.get(originalLayer) ?? originalLayer;

                const targetCtx = this.engine.getLayerContext(targetLayer);
                command.execute(targetCtx);
            }

            const timeTaken = performance.now() - startTime;

            // ── Guardado en Caché ─────────────────────────────────────────
            // Ya estaba protegido: solo guardamos si NO hay selección activa
            if (activeCommands.length > 0 && !this.selection.hasSelection()) {
                const spine = this.history.getTimelineSpine();
                const lastSpineEnd = spine.length > 0 ? spine[spine.length - 1] : null;
                const isKeyframe = (activeCommands.length % 50 === 0);

                if (lastSpineEnd && (timeTaken > 8 || isKeyframe)) {
                    // Pasamos el engine completo para que tome foto de todas las capas
                    this.history.cacheManager.bake(lastSpineEnd.id, this.engine, isKeyframe);
                }

                if (this.checkpoint && (timeTaken > 8 || isKeyframe)) {
                    const { spine } = this.history.getState();
                    if (spine.length > 0) {
                        this.checkpoint.scheduleCheckpoint(
                            spine[spine.length - 1].id,
                            this.engine,
                            spine.length
                        );
                    }
                }
            }

            if ((this.history as any).eventBus) {
                (this.history as any).eventBus.emit('SYNC_LAYERS_CSS');
            }

        } finally {
            this.isRebuilding = false;
        }
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