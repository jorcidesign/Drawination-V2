// src/tools/interaction/transform/TransformContextActions.ts
//
// Responsabilidad ÚNICA: ejecutar las acciones de la barra contextual
// (DELETE, FLIP_H, FLIP_V, DUPLICATE) sobre la selección activa.
//
// Cada método es autocontenido: hace el commit en history, persiste en storage,
// actualiza la bbox en selection, y llama al rebuilder.
// El TransformHandleTool llama a estos métodos y reacciona al resultado.
//
// CONTRATOS:
//   delete()     → oculta los trazos seleccionados, devuelve true
//   flipH/flipV()→ aplica matriz de espejo, actualiza bbox, regenera sandbox
//   duplicate()  → clona trazos con offset, selecciona los nuevos
//
// CALLBACK onSandboxNeedsRegen: el Tool lo conecta para que las acciones
// puedan pedir regeneración del sandbox sin importar TransformSandbox directamente.

import type { ToolContext } from '../../core/ITool';
import type { BoundingBox } from '../../../core/math/BoundingBox';
import type { TimelineEvent } from '../../../history/TimelineTypes';
import { DiagnosticsService } from '../../../history/DiagnosticsService';
import { TransformGestureHandler } from './TransformGestureHandler';

export class TransformContextActions {

    private ctx: ToolContext;

    /** Callback que el Tool registra para que las acciones pidan rebuild del sandbox. */
    public onSandboxNeedsRegen: (() => Promise<void>) | null = null;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
    }

    // ── DELETE ────────────────────────────────────────────────────────────

    public async delete(): Promise<boolean> {
        if (!this.ctx.selection.hasSelection()) return false;

        const targetIds = Array.from(this.ctx.selection.selectedIds);
        const event = this.ctx.history.commitHide(targetIds, 'transform-handle');
        await this.ctx.storage.saveEvent(event);
        event.isSaved = true;

        DiagnosticsService.logTransformState('delete', 'none');
        return true;
    }

    // ── FLIP H / FLIP V ───────────────────────────────────────────────────

    public async flipH(): Promise<void> {
        await this._flip('H');
    }

    public async flipV(): Promise<void> {
        await this._flip('V');
    }

    private async _flip(axis: 'H' | 'V'): Promise<void> {
        if (!this.ctx.selection.hasSelection() || !this.ctx.selection.bbox) return;

        const bbox = this.ctx.selection.bbox;
        const cx = (bbox.minX + bbox.maxX) / 2;
        const cy = (bbox.minY + bbox.maxY) / 2;
        const targetIds = Array.from(this.ctx.selection.selectedIds);

        const m = axis === 'H'
            ? [-1, 0, 0, 1, cx * 2, 0]
            : [1, 0, 0, -1, 0, cy * 2];

        const event = await this.ctx.history.commitTransform(targetIds, m);
        await this.ctx.storage.saveEvent(event);
        event.isSaved = true;
        this.ctx.history.enforceRamLimit();

        // Actualizar bbox proyectada
        const newBbox = TransformGestureHandler.projectBbox(bbox, m);
        this.ctx.selection.setBbox(newBbox);

        await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        await this.onSandboxNeedsRegen?.();
    }

    // ── DUPLICATE ─────────────────────────────────────────────────────────

    /**
     * Clona los trazos seleccionados con un offset de +20/+20.
     * Devuelve los IDs nuevos para que el Tool reseleccione sobre ellos.
     */
    public async duplicate(): Promise<string[]> {
        if (!this.ctx.selection.hasSelection()) return [];

        const targetIds = Array.from(this.ctx.selection.selectedIds);
        const { active, transforms } = this.ctx.history.getState();
        const newIds: string[] = [];

        for (const id of targetIds) {
            const ev = active.find(e => e.id === id);
            if (!ev) continue;
            if (!ev.data) ev.data = await this.ctx.storage.loadEventData(id);
            if (!ev.data) continue;

            const newId = crypto.randomUUID();
            newIds.push(newId);

            const clone: TimelineEvent = {
                ...ev,
                id: newId,
                timestamp: Date.now(),
                isSaved: false,
            };
            this.ctx.history.push(clone);
            await this.ctx.storage.saveEvent(clone);
            clone.isSaved = true;

            const existingMatrix = transforms.get(id) ?? new DOMMatrix();
            const offsetMatrix = new DOMMatrix().translate(20, 20).multiply(existingMatrix);

            const m = [
                offsetMatrix.a, offsetMatrix.b,
                offsetMatrix.c, offsetMatrix.d,
                offsetMatrix.e, offsetMatrix.f,
            ];
            const transformEv = await this.ctx.history.commitTransform([newId], m);
            await this.ctx.storage.saveEvent(transformEv);
            transformEv.isSaved = true;
        }

        this.ctx.history.commitLayerAction('DUPLICATE_GROUP' as any, this.ctx.engine.activeLayerIndex, {
            sourceIds: targetIds,
            newIds,
        });
        this.ctx.history.rebuildSpatialGrid();

        return newIds;
    }
}