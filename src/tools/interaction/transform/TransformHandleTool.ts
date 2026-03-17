// src/tools/interaction/transform/TransformHandleTool.ts
//
// Orquestador principal del TransformHandle.
// Responsabilidades que QUEDAN aquí (y solo aquí):
//   - State machine: IDLE / FOCUSED / DRAGGING / SCALING / ROTATING
//   - Ciclo de vida ITool: onActivate / onDeactivate / onPointerDown/Move/Up
//   - IUndoInterceptor: beforeUndo / beforeRedo
//   - Conexión con EventBus (REQUEST_TRANSFORM_HANDLE_REFRESH, acciones UI)
//   - Teclado: Enter / Escape / Delete / Shift
//   - Coordinar TransformSandbox, TransformHandleRenderer, TransformGestureHandler,
//     TransformContextActions
//
// LO QUE YA NO ESTÁ AQUÍ (delegado):
//   - Cálculo de matrices           → TransformGestureHandler
//   - Hit testing de esquinas       → TransformGestureHandler
//   - Renderizado del handle        → TransformHandleRenderer
//   - Canvas offscreen de selección → TransformSandbox
//   - Acciones DELETE/FLIP/DUP      → TransformContextActions

import type { ITool, ToolContext } from '../../core/ITool';
import type { PointerData } from '../../../input/InputManager';
import type { BoundingBox } from '../../../core/math/BoundingBox';
import type { TimelineEvent } from '../../../history/TimelineTypes';
import type { IUndoInterceptor, InterceptorResult } from '../../../history/UndoRedoController';
import { ToolRegistry } from '../../core/ToolRegistry';
import { DiagnosticsService } from '../../../history/DiagnosticsService';

import { TransformHandleRenderer } from './TransformHandleRenderer';
import { TransformGestureHandler } from './TransformGestureHandler';
import { TransformSandbox } from './TransformSandbox';
import { TransformContextActions } from './TransformContextActions';

// ─── Estado de la máquina ────────────────────────────────────────────────────
const TransformState = {
    IDLE: 'IDLE',
    FOCUSED: 'FOCUSED',
    DRAGGING: 'DRAGGING',
    SCALING: 'SCALING',
    ROTATING: 'ROTATING',
} as const;
type TransformState = typeof TransformState[keyof typeof TransformState];

// ─────────────────────────────────────────────────────────────────────────────

export class TransformHandleTool implements ITool, IUndoInterceptor {
    public readonly id = 'transform-handle';

    private ctx: ToolContext;
    private state: TransformState = TransformState.IDLE;

    // Módulos delegados
    private renderer: TransformHandleRenderer;
    private gesture: TransformGestureHandler;
    private sandbox: TransformSandbox;
    private actions: TransformContextActions;

    // Estado de frame actual (la matriz viva durante un gesto)
    private currentMatrix: number[] = [1, 0, 0, 1, 0, 0];

    // Tracking para Diagnostics
    private lastAction: 'move' | 'scale' | 'none' = 'none';
    private isShiftDown = false;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;

        this.renderer = new TransformHandleRenderer();
        this.gesture = new TransformGestureHandler();
        this.sandbox = new TransformSandbox(ctx.engine.width, ctx.engine.height);

        this.actions = new TransformContextActions(ctx);
        // El Tool conecta el callback de regeneración del sandbox
        this.actions.onSandboxNeedsRegen = async () => {
            await this.sandbox.generate(this.ctx);
            this._renderLivePreview();
        };

        ctx.undoRedoController.registerInterceptor(this);

        // ── EventBus: refresh externo (undo/redo de TRANSFORM) ────────────
        ctx.eventBus.on('REQUEST_TRANSFORM_HANDLE_REFRESH', async ({ targetIds }) => {
            if (this.state !== TransformState.FOCUSED) return;

            // Solo actuamos si los IDs coinciden con la selección actual
            const currentIds = Array.from(this.ctx.selection.selectedIds).sort().join(',');
            const incomingIds = [...targetIds].sort().join(',');
            if (currentIds !== incomingIds) return;

            const newBbox = this.ctx.history.getBboxForIds(targetIds);
            if (newBbox) this.ctx.selection.setBbox(newBbox);

            await this.sandbox.generate(this.ctx);
            this.currentMatrix = [1, 0, 0, 1, 0, 0];
            this._renderLivePreview();
        });

        // ── EventBus: acciones de la barra contextual ─────────────────────
        ctx.eventBus.on('SELECTION_DELETE', () => this._handleDelete());
        ctx.eventBus.on('SELECTION_FLIP_H', () => this._handleFlipH());
        ctx.eventBus.on('SELECTION_FLIP_V', () => this._handleFlipV());
        ctx.eventBus.on('SELECTION_DUPLICATE', () => this._handleDuplicate());
    }

    // ── ITool lifecycle ───────────────────────────────────────────────────

    public isBusy(): boolean {
        return (
            this.state === TransformState.DRAGGING ||
            this.state === TransformState.SCALING ||
            this.state === TransformState.ROTATING
        );
    }

    public async onActivate(): Promise<void> {
        this.ctx.engine.container.style.cursor = 'move';
        window.addEventListener('keydown', this._handleKeyDown);
        window.addEventListener('keyup', this._handleKeyUp);

        if (this.ctx.selection.hasSelection() && this.state !== TransformState.FOCUSED) {
            const ids = Array.from(this.ctx.selection.selectedIds);
            const bbox = this.ctx.selection.bbox;
            this.lastAction = 'none';
            this.currentMatrix = [1, 0, 0, 1, 0, 0];
            if (bbox) await this._enterFocused(ids, bbox, false);
        }
    }

    public onDeactivate(reason?: string): void {
        window.removeEventListener('keydown', this._handleKeyDown);
        window.removeEventListener('keyup', this._handleKeyUp);

        if (this.state !== TransformState.IDLE || this.ctx.selection.hasSelection()) {
            DiagnosticsService.logTransformState(reason || 'interruption', this.lastAction);
            this._abortAndExit().catch(console.error);
        }
    }

    // ── Pointer events ────────────────────────────────────────────────────

    public onPointerDown(data: PointerData): void {
        if (this.state !== TransformState.FOCUSED) return;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const bbox = this.ctx.selection.bbox;
        if (!bbox) return;

        const hit = this.gesture.hitTest(canvasPos.x, canvasPos.y, bbox, this.ctx.viewport.zoom);

        if (hit.kind === 'scale') {
            this.state = TransformState.SCALING;
            this.gesture.beginScale(hit);
            this.ctx.engine.container.style.cursor = 'nwse-resize';
        }
        else if (hit.kind === 'rotate') {
            this.state = TransformState.ROTATING;
            this.gesture.beginRotate(hit, canvasPos.x, canvasPos.y);
            this.ctx.engine.container.style.cursor = 'alias';
        }
        else if (hit.kind === 'drag') {
            this.state = TransformState.DRAGGING;
            this.gesture.beginDrag(canvasPos.x, canvasPos.y);
            this.ctx.engine.container.style.cursor = 'move';
        }
        else {
            // Click fuera → salir
            DiagnosticsService.logTransformState('click_outside', this.lastAction);
            this._exitToLasso();
        }
    }

    public onPointerMove(data: PointerData): void {
        if (this.state === TransformState.IDLE || this.state === TransformState.FOCUSED) return;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const matrix = this.gesture.computeMatrix(canvasPos.x, canvasPos.y, this.isShiftDown);
        if (matrix) {
            this.currentMatrix = matrix;
            this._renderLivePreview();
        }
    }

    public async onPointerUp(_data: PointerData): Promise<void> {
        if (this.state === TransformState.IDLE || this.state === TransformState.FOCUSED) return;

        const gestureType = this.gesture.getGestureType();
        this.state = TransformState.FOCUSED;
        this.ctx.engine.container.style.cursor = 'move';

        const IDENTITY = '1,0,0,1,0,0';
        if (this.currentMatrix.join(',') !== IDENTITY) {
            this.lastAction = gestureType === 'scale' ? 'scale' : 'move';

            const targetIds = Array.from(this.ctx.selection.selectedIds);
            const event = await this.ctx.history.commitTransform(targetIds, this.currentMatrix);
            await this.ctx.storage.saveEvent(event);
            event.isSaved = true;
            this.ctx.history.enforceRamLimit();

            // ── Actualizar bbox ───────────────────────────────────────────
            // Para drag y scale: projectBbox es suficiente (transformación afín simple).
            // Para rotate: projectBbox daría un AABB inflado (el envolvente axis-aligned
            // de un rectángulo rotado siempre es mayor). En su lugar recalculamos el
            // bbox real desde los puntos transformados via getBboxForIds(), que lee las
            // matrices acumuladas en computeTimelineState y devuelve el bbox exacto.
            // Usamos getBboxForIds para todos los casos: es más robusto y preciso.
            await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
            if (this.state !== TransformState.FOCUSED) return;

            const freshBbox = this.ctx.history.getBboxForIds(targetIds);
            if (freshBbox) this.ctx.selection.setBbox(freshBbox);

            await this.sandbox.generate(this.ctx);
            this.currentMatrix = [1, 0, 0, 1, 0, 0];
        }

        if (this.state === TransformState.FOCUSED) {
            this._renderLivePreview();
        }
    }

    // ── IUndoInterceptor ──────────────────────────────────────────────────

    public async beforeUndo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        if (this.isBusy()) return { handled: true };

        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM') {
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) {
                    this.ctx.selection.setSelection(new Set(nextEvent.targetIds), bbox);
                    this.lastAction = 'none';
                    this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
                    DiagnosticsService.logTransformState('resurrect_undo', 'none');
                }
                return { handled: true };
            }
            return { handled: false };
        }

        if (this.state === TransformState.FOCUSED) {
            if (
                !nextEvent ||
                nextEvent.type !== 'TRANSFORM' ||
                this._selectedIdsStr() !== [...nextEvent.targetIds!].sort().join(',')
            ) {
                DiagnosticsService.logTransformState('undo_exit', this.lastAction);
                await this._exitToLasso();
                return { handled: true };
            }
            return { handled: false };
        }

        return { handled: false };
    }

    public async beforeRedo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        if (this.isBusy()) return { handled: true };

        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM') {
                const bbox = this.ctx.history.getBboxForIds(nextEvent.targetIds!);
                if (bbox) {
                    this.ctx.selection.setSelection(new Set(nextEvent.targetIds), bbox);
                    this.lastAction = 'none';
                    this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
                    DiagnosticsService.logTransformState('resurrect_redo', 'none');
                }
                return { handled: true };
            }
            return { handled: false };
        }

        if (this.state === TransformState.FOCUSED) {
            if (
                !nextEvent ||
                nextEvent.type !== 'TRANSFORM' ||
                this._selectedIdsStr() !== [...nextEvent.targetIds!].sort().join(',')
            ) {
                DiagnosticsService.logTransformState('redo_exit', this.lastAction);
                await this._exitToLasso();
                return { handled: true };
            }
            return { handled: false };
        }

        return { handled: false };
    }

    // ── Acciones contextuales (delegadas a TransformContextActions) ───────

    private async _handleDelete(): Promise<void> {
        if (this.state !== TransformState.FOCUSED || !this.ctx.selection.hasSelection()) return;
        const deleted = await this.actions.delete();
        if (deleted) await this._exitToLasso();
    }

    private async _handleFlipH(): Promise<void> {
        if (this.state !== TransformState.FOCUSED || !this.ctx.selection.hasSelection()) return;
        await this.actions.flipH();
    }

    private async _handleFlipV(): Promise<void> {
        if (this.state !== TransformState.FOCUSED || !this.ctx.selection.hasSelection()) return;
        await this.actions.flipV();
    }

    private async _handleDuplicate(): Promise<void> {
        if (this.state !== TransformState.FOCUSED || !this.ctx.selection.hasSelection()) return;

        const newIds = await this.actions.duplicate();
        if (newIds.length === 0) return;

        const newBbox = this.ctx.history.getBboxForIds(newIds);
        if (newBbox) {
            this._clearVisuals();
            await this._enterFocused(newIds, newBbox, false);
        }
    }

    // ── Ciclo de vida interno ─────────────────────────────────────────────

    private async _enterFocused(
        ids: string[],
        bbox: BoundingBox,
        skipRebuild: boolean
    ): Promise<void> {
        this.state = TransformState.FOCUSED;
        this.ctx.selection.setSelection(new Set(ids), bbox);
        this.currentMatrix = [1, 0, 0, 1, 0, 0];
        this.lastAction = 'none';

        if (!skipRebuild) await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        if (this.state !== TransformState.FOCUSED) return;

        await this.sandbox.generate(this.ctx);
        if (this.state !== TransformState.FOCUSED) return;

        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';
        this._renderLivePreview();
        this.ctx.engine.container.style.cursor = 'move';
    }

    private async _abortAndExit(): Promise<void> {
        if (this.state === TransformState.IDLE && !this.ctx.selection.hasSelection()) return;

        this._clearVisuals();
        this.state = TransformState.IDLE;
        this.gesture.clear();
        this.ctx.selection.clear();
        await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
    }

    private async _exitToLasso(): Promise<void> {
        await this._abortAndExit();
        this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', 'lasso');
    }

    private _clearVisuals(): void {
        this.ctx.engine.clearPaintingCanvas();
        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '1';
    }

    private _renderLivePreview(): void {
        this.renderer.renderLivePreview(
            this.ctx.engine.paintingContext,
            this.sandbox.canvas,
            this.currentMatrix,
            this.ctx.selection.bbox,
            this.ctx.viewport.zoom
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private _selectedIdsStr(): string {
        return Array.from(this.ctx.selection.selectedIds).sort().join(',');
    }

    // ── Keyboard ──────────────────────────────────────────────────────────

    private _handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
        if (e.key === 'Shift') {
            this.isShiftDown = true;
            if (this.state === TransformState.SCALING || this.state === TransformState.ROTATING) {
                this._renderLivePreview();
            }
        }

        if (this.state === TransformState.IDLE) return;

        if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            DiagnosticsService.logTransformState('enter', this.lastAction);
            await this._exitToLasso();
        }
        else if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            DiagnosticsService.logTransformState('escape', this.lastAction);
            await this._exitToLasso();
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            await this._handleDelete();
        }
    };

    private _handleKeyUp = (e: KeyboardEvent): void => {
        if (e.key === 'Shift') {
            this.isShiftDown = false;
            if (this.state === TransformState.SCALING || this.state === TransformState.ROTATING) {
                this._renderLivePreview();
            }
        }
    };
}

ToolRegistry.register({
    id: 'transform-handle',
    factory: (ctx) => new TransformHandleTool(ctx),
});