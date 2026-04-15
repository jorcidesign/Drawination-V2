// src/tools/interaction/transform/TransformContextActions.ts
import type { ToolContext } from '../../core/ITool';
import type { ClonePayload } from '../../../history/TimelineTypes';
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

    // ── DUPLICATE atómico ─────────────────────────────────────────────────
    //
    // Crea un evento DUPLICATE_GROUP con los datos de todos los clones embebidos.
    // Cada clon lleva:
    //   - data:   los mismos bytes del trazo original (puntos sin modificar)
    //   - matrix: la matriz completa del clon (offset + transform heredado)
    //   - bbox:   el bbox ORIGINAL (sin proyectar), igual que los eventos STROKE normales.
    //             getBboxForIds() aplicará la matriz sobre él para calcular
    //             el bbox final → mismo pipeline que cualquier trazo transformado.
    //
    // NO se usa projectBbox() aquí porque computeTimelineState almacena la
    // matriz en `transforms` y getBboxForIds() la aplica internamente.
    // Usar projectBbox() aquí causaría doble proyección → handle desplazado.
    public async duplicate(): Promise<string[]> {
        if (!this.ctx.selection.hasSelection()) return [];

        const targetIds = Array.from(this.ctx.selection.selectedIds);
        const { active, transforms } = this.ctx.history.getState();
        const newIds: string[] = [];
        const clonePayloads: ClonePayload[] = [];

        DiagnosticsService.logDuplicate('start', targetIds.length);

        for (const id of targetIds) {
            const ev = active.find(e => e.id === id);
            if (!ev) continue;

            // Asegurar que tenemos los datos binarios
            if (!ev.data) ev.data = await this.ctx.storage.loadEventData(id);
            if (!ev.data) {
                DiagnosticsService.logDuplicate('missing_data', id);
                continue;
            }

            const newId = crypto.randomUUID();
            newIds.push(newId);

            // Matriz del clon = offset (+20,+20) compuesto con la matriz original
            const existingMatrix = transforms.get(id) ?? new DOMMatrix();
            const offsetMatrix = new DOMMatrix()
                .translate(20, 20)
                .multiply(existingMatrix);

            const matrix: number[] = [
                offsetMatrix.a, offsetMatrix.b,
                offsetMatrix.c, offsetMatrix.d,
                offsetMatrix.e, offsetMatrix.f,
            ];

            // Pasamos el bbox ORIGINAL (ev.bbox), no el proyectado.
            // computeTimelineState almacenará esta matrix en `transforms`,
            // y getBboxForIds() la aplicará sobre ev.bbox para obtener
            // el bbox correcto del clon — mismo comportamiento que STROKE + TRANSFORM.
            clonePayloads.push({
                id: newId,
                sourceId: id,
                profileId: ev.profileId,
                color: ev.color,
                size: ev.size,
                opacity: ev.opacity,
                data: ev.data,
                matrix,
                bbox: ev.bbox, // bbox original sin proyectar
            });
        }

        if (clonePayloads.length === 0) {
            DiagnosticsService.logDuplicate('no_payloads', 0);
            return [];
        }

        // Un solo evento atómico — el único que entra al timeline
        const groupEvent = this.ctx.history.commitDuplicateGroup(
            targetIds,
            newIds,
            clonePayloads,
            this.ctx.engine.activeLayerIndex,
        );
        await this.ctx.storage.saveEvent(groupEvent);
        groupEvent.isSaved = true;
        this.ctx.history.enforceRamLimit();

        // Actualizar la spatial grid usando el bbox proyectado del clon
        // (para que el lazo y el borrador vectorial lo encuentren en su posición real).
        for (const payload of clonePayloads) {
            if (payload.bbox && payload.matrix) {
                const projectedBbox = TransformGestureHandler.projectBbox(payload.bbox, payload.matrix);
                this.ctx.history.spatialGrid.insert(payload.id, projectedBbox);
            } else if (payload.bbox) {
                this.ctx.history.spatialGrid.insert(payload.id, payload.bbox);
            }
        }

        DiagnosticsService.logDuplicate('done', newIds.length);

        return newIds;
    }
}