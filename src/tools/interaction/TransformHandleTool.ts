// src/tools/interaction/TransformHandleTool.ts
//
// CAMBIOS vs versión anterior:
//
// 1. FLUJO DE UNDO/REDO corregido según la tabla de estados:
//
//    UNDO desde IDLE + evento es TRANSFORM:
//      → Foco: entra a FOCUSED sin retroceder historia. handled=true.
//    UNDO desde FOCUSED + evento es TRANSFORM del mismo grupo:
//      → Viaje: deja pasar. handled=false → UndoRedoController aplica el undo.
//        onAfterUndo de TransformCommand emite REFRESH → Handle actualiza bbox.
//    UNDO desde FOCUSED + evento NO es TRANSFORM (o no hay más):
//      → Salida: actúa como Escape. handled=true.
//
//    REDO desde IDLE + evento es TRANSFORM:
//      → Foco: entra a FOCUSED sin avanzar historia. handled=true.
//    REDO desde FOCUSED + evento es TRANSFORM del mismo grupo:
//      → Viaje: deja pasar. handled=false.
//    REDO desde FOCUSED + evento NO es TRANSFORM:
//      → Salida: cierra handle. handled=true.
//
// 2. REQUEST_TRANSFORM_HANDLE_REFRESH: el handler ahora actualiza la bbox
//    correctamente después de que el rebuild ya procesó la nueva posición.
//    Antes usaba getBboxForIds() antes del rebuild — ahora se llama post-rebuild
//    desde TransformCommand.onAfterUndo/Redo.

import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import type { BoundingBox } from '../../core/math/BoundingBox';
import type { TimelineEvent } from '../../history/TimelineTypes';
import type { IUndoInterceptor, InterceptorResult } from '../../history/UndoRedoController';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import { ToolRegistry } from '../core/ToolRegistry';
import { DiagnosticsService } from '../../history/DiagnosticsService';

const TransformState = {
    IDLE: 'IDLE',
    FOCUSED: 'FOCUSED',
    DRAGGING: 'DRAGGING',
} as const;
type TransformState = typeof TransformState[keyof typeof TransformState];

export class TransformHandleTool implements ITool, IUndoInterceptor {
    public readonly id = 'transform-handle';
    private ctx: ToolContext;
    private state: TransformState = TransformState.IDLE;
    private sandboxCanvas: HTMLCanvasElement;
    private dragStartX = 0;
    private dragStartY = 0;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.sandboxCanvas = document.createElement('canvas');
        this.sandboxCanvas.width = ctx.engine.width;
        this.sandboxCanvas.height = ctx.engine.height;

        ctx.undoRedoController.registerInterceptor(this);

        // REFRESH: llamado por TransformCommand.onAfterUndo/Redo después del rebuild.
        // En ese momento el canvas ya está correcto — solo actualizamos bbox y sandbox.
        ctx.eventBus.on('REQUEST_TRANSFORM_HANDLE_REFRESH', async ({ targetIds }) => {
            if (this.state !== TransformState.FOCUSED) return;

            // Verificar que los targetIds corresponden a nuestra selección actual
            const currentIds = Array.from(this.ctx.selection.selectedIds).sort().join(',');
            const incomingIds = [...targetIds].sort().join(',');
            if (currentIds !== incomingIds) return;

            // Actualizar bbox con la posición post-rebuild (ya tiene la transform aplicada o revertida)
            const newBbox = this.ctx.history.getBboxForIds(targetIds);
            if (newBbox) this.ctx.selection.setBbox(newBbox);

            await this._generateSandbox();
            this._renderLivePreview(0, 0);
        });
    }

    // ── IUndoInterceptor ──────────────────────────────────────────────────

    public async beforeUndo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        // No interrumpir si hay un drag activo
        if (this.state === TransformState.DRAGGING) return { handled: true };

        // ── DESDE IDLE ────────────────────────────────────────────────────
        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM') {
                // FOCO: abrir el handle en la posición pre-undo sin retroceder historia
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) await this._enterFocused(nextEvent.targetIds!, bbox, false);
                return { handled: true };
            }
            return { handled: false };
        }

        // ── DESDE FOCUSED ─────────────────────────────────────────────────
        if (this.state === TransformState.FOCUSED) {
            if (!nextEvent) {
                // No hay más que deshacer: SALIDA — actúa como Escape
                await this._exitToLasso();
                return { handled: true };
            }

            if (nextEvent.type === 'TRANSFORM') {
                const selectedStr = this._selectedIdsStr();
                const targetStr = [...nextEvent.targetIds!].sort().join(',');

                if (selectedStr === targetStr) {
                    // VIAJE: mismo grupo → dejar pasar para que UndoRedoController
                    // aplique el undo histórico. El rebuild ocurrirá, y después
                    // TransformCommand.onAfterUndo emitirá REFRESH para actualizar el handle.
                    return { handled: false };
                }

                // TRANSFORM de otro grupo: cambiar selección al nuevo grupo
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) {
                    this._clearVisuals();
                    await this._enterFocused(nextEvent.targetIds!, bbox, false);
                }
                return { handled: true };
            }

            // Siguiente evento no es TRANSFORM: SALIDA
            await this._exitToLasso();
            return { handled: true };
        }

        return { handled: false };
    }

    public async beforeRedo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        if (this.state === TransformState.DRAGGING) return { handled: true };

        // ── DESDE IDLE ────────────────────────────────────────────────────
        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM') {
                // FOCO: abrir el handle en posición pre-redo
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) await this._enterFocused(nextEvent.targetIds!, bbox, false);
                return { handled: true };
            }
            return { handled: false };
        }

        // ── DESDE FOCUSED ─────────────────────────────────────────────────
        if (this.state === TransformState.FOCUSED) {
            if (!nextEvent) {
                // No hay más que rehacer: SALIDA
                await this._exitToLasso();
                return { handled: true };
            }

            if (nextEvent.type === 'TRANSFORM') {
                const selectedStr = this._selectedIdsStr();
                const targetStr = [...nextEvent.targetIds!].sort().join(',');

                if (selectedStr === targetStr) {
                    // VIAJE: mismo grupo → dejar pasar
                    return { handled: false };
                }

                // TRANSFORM de otro grupo: cambiar selección
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) {
                    this._clearVisuals();
                    await this._enterFocused(nextEvent.targetIds!, bbox, false);
                }
                return { handled: true };
            }

            // Siguiente evento no es TRANSFORM: SALIDA
            await this._exitToLasso();
            return { handled: true };
        }

        return { handled: false };
    }

    // ── ITool ─────────────────────────────────────────────────────────────

    public isBusy(): boolean { return this.state === TransformState.DRAGGING; }

    public async onActivate(): Promise<void> {
        this.ctx.engine.container.style.cursor = 'move';
        window.addEventListener('keydown', this._handleKeyDown);

        if (this.ctx.selection.hasSelection() && this.state !== TransformState.FOCUSED) {
            const ids = Array.from(this.ctx.selection.selectedIds);
            const bbox = this.ctx.selection.bbox;
            if (bbox) await this._enterFocused(ids, bbox, false);
        }
    }

    public onDeactivate(): void {
        window.removeEventListener('keydown', this._handleKeyDown);
        this._clearVisuals();
        this.state = TransformState.IDLE;
    }

    public onPointerDown(data: PointerData): void {
        if (this.state !== TransformState.FOCUSED) return;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const bbox = this.ctx.selection.bbox;
        if (!bbox) return;

        const inside =
            canvasPos.x >= bbox.minX && canvasPos.x <= bbox.maxX &&
            canvasPos.y >= bbox.minY && canvasPos.y <= bbox.maxY;

        if (inside) {
            this.state = TransformState.DRAGGING;
            this.dragStartX = canvasPos.x;
            this.dragStartY = canvasPos.y;
        } else {
            this._exitToLasso();
        }
    }

    public onPointerMove(data: PointerData): void {
        if (this.state !== TransformState.DRAGGING) return;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        this._renderLivePreview(canvasPos.x - this.dragStartX, canvasPos.y - this.dragStartY);
    }

    public async onPointerUp(data: PointerData): Promise<void> {
        if (this.state !== TransformState.DRAGGING) return;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const dx = canvasPos.x - this.dragStartX;
        const dy = canvasPos.y - this.dragStartY;

        this.state = TransformState.FOCUSED;

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            const targetIds = Array.from(this.ctx.selection.selectedIds);
            const event = await this.ctx.history.commitTransform(targetIds, [1, 0, 0, 1, dx, dy]);
            await this.ctx.storage.saveEvent(event);
            event.isSaved = true;
            this.ctx.history.enforceRamLimit();

            const oldBbox = this.ctx.selection.bbox!;
            this.ctx.selection.setBbox({
                minX: oldBbox.minX + dx, minY: oldBbox.minY + dy,
                maxX: oldBbox.maxX + dx, maxY: oldBbox.maxY + dy,
            });

            await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
            if (this.state !== TransformState.FOCUSED) return;
            await this._generateSandbox();
        }

        if (this.state === TransformState.FOCUSED) {
            this._renderLivePreview(0, 0);
        }
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private async _enterFocused(ids: string[], bbox: BoundingBox, skipRebuild: boolean): Promise<void> {
        this.state = TransformState.FOCUSED;
        this.ctx.selection.setSelection(new Set(ids), bbox);

        if (!skipRebuild) await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        if (this.state !== TransformState.FOCUSED) return;

        await this._generateSandbox();
        if (this.state !== TransformState.FOCUSED) return;

        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';
        this._renderLivePreview(0, 0);
        this.ctx.engine.container.style.cursor = 'move';
    }

    private async _exitToLasso(): Promise<void> {
        this._clearVisuals();
        this.state = TransformState.IDLE;
        this.ctx.selection.clear();
        await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', 'lasso');
    }

    private _clearVisuals(): void {
        this.ctx.engine.clearPaintingCanvas();
        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '1';
    }

    private _renderLivePreview(offsetX: number, offsetY: number): void {
        this.ctx.engine.clearPaintingCanvas();
        const pCtx = this.ctx.engine.paintingContext;
        pCtx.save();
        pCtx.translate(offsetX, offsetY);
        pCtx.drawImage(this.sandboxCanvas, 0, 0);
        pCtx.restore();
        this._drawHandle(offsetX, offsetY);
    }

    private _drawHandle(dx: number, dy: number): void {
        if (!this.ctx.selection.bbox) return;

        const pCtx = this.ctx.engine.paintingContext;
        const zoom = this.ctx.viewport.zoom;
        const { minX, minY, maxX, maxY } = this.ctx.selection.bbox;
        const x0 = minX + dx, y0 = minY + dy;
        const x1 = maxX + dx, y1 = maxY + dy;
        const w = this.ctx.engine.width;
        const h = this.ctx.engine.height;

        pCtx.save();
        pCtx.lineWidth = 1 / zoom;

        pCtx.strokeStyle = 'rgba(0,0,0,0.15)';
        pCtx.beginPath();
        pCtx.moveTo(0, y0); pCtx.lineTo(w, y0);
        pCtx.moveTo(0, y1); pCtx.lineTo(w, y1);
        pCtx.moveTo(x0, 0); pCtx.lineTo(x0, h);
        pCtx.moveTo(x1, 0); pCtx.lineTo(x1, h);
        pCtx.stroke();

        pCtx.strokeStyle = 'rgba(0,0,0,0.6)';
        pCtx.strokeRect(x0, y0, x1 - x0, y1 - y0);

        const r = 4 / zoom;
        for (const [hx, hy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as [number, number][]) {
            pCtx.beginPath();
            pCtx.arc(hx, hy, r, 0, Math.PI * 2);
            pCtx.fillStyle = 'white';
            pCtx.fill();
            pCtx.stroke();
        }
        pCtx.restore();
    }

    private async _generateSandbox(): Promise<void> {
        const sCtx = this.sandboxCanvas.getContext('2d')!;
        sCtx.clearRect(0, 0, this.sandboxCanvas.width, this.sandboxCanvas.height);

        const { active, transforms, hiddenIds } = this.ctx.history.getState();

        sCtx.save();
        sCtx.lineCap = 'round';
        sCtx.lineJoin = 'round';

        for (const eventId of this.ctx.selection.selectedIds) {
            if (hiddenIds.has(eventId)) continue;

            const ev = active.find((e: any) => e.id === eventId);
            if (!ev) continue;

            if (!ev.data) ev.data = await this.ctx.storage.loadEventData(eventId);
            if (!ev.data) continue;

            const t = transforms.get(eventId) ?? new DOMMatrix();
            const pts = BinarySerializer.decode(ev.data);
            if (pts.length < 2) continue;

            sCtx.beginPath();
            sCtx.moveTo(
                pts[0].x * t.a + pts[0].y * t.c + t.e,
                pts[0].x * t.b + pts[0].y * t.d + t.f
            );
            for (let i = 1; i < pts.length; i++) {
                sCtx.lineTo(
                    pts[i].x * t.a + pts[i].y * t.c + t.e,
                    pts[i].x * t.b + pts[i].y * t.d + t.f
                );
            }

            sCtx.strokeStyle = ev.type === 'ERASE' ? '#0096ff' : ev.color;
            sCtx.lineWidth = Math.max(2, ev.size / 2);
            sCtx.stroke();
        }

        sCtx.restore();
    }

    private _selectedIdsStr(): string {
        return Array.from(this.ctx.selection.selectedIds).sort().join(',');
    }

    private _handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
        if (this.state === TransformState.IDLE) return;

        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            DiagnosticsService.logTransformEnd(e.key === 'Enter' ? 'confirm' : 'cancel');
            await this._exitToLasso();
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            if (this.state === TransformState.FOCUSED && this.ctx.selection.hasSelection()) {
                const targetIds = Array.from(this.ctx.selection.selectedIds);
                const event = this.ctx.history.commitHide(targetIds);
                await this.ctx.storage.saveEvent(event);
                event.isSaved = true;
                await this._exitToLasso();
            }
        }
    };
}

ToolRegistry.register({
    id: 'transform-handle',
    factory: (ctx) => new TransformHandleTool(ctx),
});