// src/tools/interaction/transform/TransformContextActions.ts
import type { ToolContext } from '../../core/ITool';
import type { BoundingBox } from '../../../core/math/BoundingBox';
import type { TimelineEvent } from '../../../history/TimelineTypes';
import { DiagnosticsService } from '../../../history/DiagnosticsService';
import { TransformGestureHandler } from './TransformGestureHandler';

export class TransformContextActions {

    private ctx: ToolContext;
    public onSandboxNeedsRegen: (() => Promise<void>) | null = null;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
    }

    public async delete(): Promise<boolean> {
        if (!this.ctx.selection.hasSelection()) return false;

        const targetIds = Array.from(this.ctx.selection.selectedIds);
        const event = this.ctx.history.commitHide(targetIds, 'transform-handle');
        await this.ctx.storage.saveEvent(event);
        event.isSaved = true;

        DiagnosticsService.logTransformState('delete', 'none');
        return true;
    }

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

        const newBbox = TransformGestureHandler.projectBbox(bbox, m);
        this.ctx.selection.setBbox(newBbox);

        await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        await this.onSandboxNeedsRegen?.();
    }

    // === FIX: Agrupamos todos los eventos generados con un groupId ===
    public async duplicate(): Promise<string[]> {
        if (!this.ctx.selection.hasSelection()) return [];

        const targetIds = Array.from(this.ctx.selection.selectedIds);
        const { active, transforms } = this.ctx.history.getState();
        const newIds: string[] = [];

        const groupId = crypto.randomUUID();

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
                groupId
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
            const transformEv: TimelineEvent = {
                id: crypto.randomUUID(), type: 'TRANSFORM',
                toolId: 'transform-handle', profileId: 'system',
                layerIndex: this.ctx.engine.activeLayerIndex,
                color: '', size: 0, opacity: 1,
                timestamp: Date.now(), data: null,
                targetIds: [newId], transformMatrix: m,
                isSaved: false,
                groupId
            };
            this.ctx.history.push(transformEv);
            await this.ctx.storage.saveEvent(transformEv);
            transformEv.isSaved = true;
        }

        const groupEv = this.ctx.history.commitLayerAction('DUPLICATE_GROUP' as any, this.ctx.engine.activeLayerIndex, {
            sourceIds: targetIds,
            newIds,
            groupId
        });
        await this.ctx.storage.saveEvent(groupEv);
        groupEv.isSaved = true;

        this.ctx.history.rebuildSpatialGrid();

        return newIds;
    }
}