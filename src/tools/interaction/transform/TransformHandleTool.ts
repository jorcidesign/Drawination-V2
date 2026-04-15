// src/tools/interaction/transform/TransformHandleTool.ts
//
// MÁQUINA DE ESTADOS PARA UNDO/REDO (Foco -> Viaje -> Salida)

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

const TransformState = {
    IDLE: 'IDLE',
    FOCUSED: 'FOCUSED',
    DRAGGING: 'DRAGGING',
    SCALING: 'SCALING',
    ROTATING: 'ROTATING',
} as const;
type TransformState = typeof TransformState[keyof typeof TransformState];

export class TransformHandleTool implements ITool, IUndoInterceptor {
    public readonly id = 'transform-handle';

    private ctx: ToolContext;
    private state: TransformState = TransformState.IDLE;

    private renderer: TransformHandleRenderer;
    private gesture: TransformGestureHandler;
    private sandbox: TransformSandbox;
    private actions: TransformContextActions;

    private currentMatrix: number[] = [1, 0, 0, 1, 0, 0];
    private lastAction: 'move' | 'scale' | 'rotate' | 'none' = 'none';
    private isShiftDown = false;
    private _ignoreHistoryRestored = false;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;

        this.renderer = new TransformHandleRenderer();
        this.gesture = new TransformGestureHandler();
        this.sandbox = new TransformSandbox(ctx.engine.width, ctx.engine.height);

        this.actions = new TransformContextActions(ctx);
        this.actions.onSandboxNeedsRegen = async () => {
            await this.sandbox.generate(this.ctx);
            this._renderLivePreview();
        };

        ctx.undoRedoController.registerInterceptor(this);

        // Actualización post-viaje de Undo/Redo
        ctx.eventBus.on('HISTORY_RESTORED', async ({ event }) => {
            console.log(`[TransformHandle] HISTORY_RESTORED disparado. state: ${this.state}, ignore: ${this._ignoreHistoryRestored}, event.type: ${event?.type}`);
            if (this._ignoreHistoryRestored) return;
            if (this.state !== TransformState.FOCUSED) return;
            if (event.type !== 'TRANSFORM') return;
            if (!event.targetIds) return;

            const ourIds = this._selectedIdsStr();
            const eventIds = [...event.targetIds].sort().join(',');
            console.log(`[TransformHandle] Comparando IDs: ourIds=${ourIds} vs eventIds=${eventIds}`);
            if (ourIds !== eventIds) return;

            const freshBbox = this.ctx.history.getBboxForIds(event.targetIds);
            if (freshBbox) this.ctx.selection.setBbox(freshBbox);

            await this.sandbox.generate(this.ctx);
            this.currentMatrix = [1, 0, 0, 1, 0, 0];

            // Garantizar que la opacidad baje al 30% de nuevo tras el rebuild global del historial
            this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';

            this._renderLivePreview();
        });

        ctx.eventBus.on('SELECTION_DELETE', () => this._handleDelete());
        ctx.eventBus.on('SELECTION_FLIP_H', () => this._handleFlipH());
        ctx.eventBus.on('SELECTION_FLIP_V', () => this._handleFlipV());
        ctx.eventBus.on('SELECTION_DUPLICATE', () => this._handleDuplicate());
    }

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

    // ── MÁQUINA DE ESTADOS UNDO/REDO ──────────────────────────────────────

    public async beforeUndo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        console.log(`[TransformHandle] beforeUndo. state: ${this.state}, busy: ${this.isBusy()}, nextEvent.type: ${nextEvent?.type}`);
        if (this.isBusy()) return { handled: true };

        // [FOCO]
        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM' && nextEvent.targetIds) {
                const bboxPostTransform = this.ctx.history.getBboxForIds(nextEvent.targetIds);
                console.log(`[TransformHandle] beforeUndo IDLE -> INTERCEPT. bbox:`, bboxPostTransform);
                if (bboxPostTransform) {
                    this.ctx.selection.setSelection(new Set(nextEvent.targetIds), bboxPostTransform);
                    this.lastAction = 'none';
                    this.currentMatrix = [1, 0, 0, 1, 0, 0];
                    this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
                    DiagnosticsService.logTransformState('resurrect_undo', 'none');
                }
                return { handled: true }; // Intercepta (No aplica historial aún)
            }
            return { handled: false };
        }

        // FOCUSED
        if (this.state === TransformState.FOCUSED) {
            // [VIAJE]
            if (
                nextEvent?.type === 'TRANSFORM' &&
                nextEvent.targetIds &&
                this._selectedIdsStr() === [...nextEvent.targetIds].sort().join(',')
            ) {
                console.log(`[TransformHandle] beforeUndo FOCUSED -> TRAVEL. Dejando que historial actue.`);
                DiagnosticsService.logTransformState('travel_undo', this.lastAction);
                return { handled: false }; // Deja que el historial actúe
            }

            // [SALIDA]
            console.log(`[TransformHandle] beforeUndo FOCUSED -> EXIT. nextEvent.type no es TRANSFORM o IDs cambian. Saliendo...`);
            DiagnosticsService.logTransformState('undo_exit', this.lastAction);
            await this._exitToLasso();
            return { handled: true }; // Intercepta actuando como Escape
        }

        return { handled: false };
    }

    public async beforeRedo(nextEvent: TimelineEvent | null): Promise<InterceptorResult> {
        console.log(`[TransformHandle] beforeRedo. state: ${this.state}, busy: ${this.isBusy()}, nextEvent.type: ${nextEvent?.type}`);
        if (this.isBusy()) return { handled: true };

        // [FOCO]
        if (this.state === TransformState.IDLE) {
            if (nextEvent?.type === 'TRANSFORM' && nextEvent.targetIds) {
                // Al rehacer, el evento aún no se aplica. Obtenemos bbox en Posición A.
                const bboxPreTransform = this.ctx.history.getBboxForIds(nextEvent.targetIds);
                console.log(`[TransformHandle] beforeRedo IDLE -> INTERCEPT. bbox pre-transform:`, bboxPreTransform);
                if (bboxPreTransform) {
                    this.ctx.selection.setSelection(new Set(nextEvent.targetIds), bboxPreTransform);
                    this.lastAction = 'none';
                    this.currentMatrix = [1, 0, 0, 1, 0, 0];
                    this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
                    DiagnosticsService.logTransformState('resurrect_redo', 'none');
                }
                return { handled: true }; // Intercepta
            }
            return { handled: false };
        }

        // FOCUSED
        if (this.state === TransformState.FOCUSED) {
            // [VIAJE]
            if (
                nextEvent?.type === 'TRANSFORM' &&
                nextEvent.targetIds &&
                this._selectedIdsStr() === [...nextEvent.targetIds].sort().join(',')
            ) {
                console.log(`[TransformHandle] beforeRedo FOCUSED -> TRAVEL.`);
                DiagnosticsService.logTransformState('travel_redo', this.lastAction);
                return { handled: false }; // Deja que el historial actúe
            }

            // [SALIDA]
            console.log(`[TransformHandle] beforeRedo FOCUSED -> EXIT. nextEvent.type no es TRANSFORM o IDs cambian.`);
            DiagnosticsService.logTransformState('redo_exit', this.lastAction);
            await this._exitToLasso();
            return { handled: true }; // Intercepta cerrando la herramienta
        }

        return { handled: false };
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
            this.lastAction = gestureType === 'scale' ? 'scale' : gestureType === 'rotate' ? 'rotate' : 'move';

            const targetIds = Array.from(this.ctx.selection.selectedIds);

            console.log(`[TransformHandle] onPointerUp. Committing transform de ${targetIds.length} trazos. M=`, this.currentMatrix);

            this._ignoreHistoryRestored = true;
            const event = await this.ctx.history.commitTransform(targetIds, this.currentMatrix);
            await this.ctx.storage.saveEvent(event);
            (event as any).isSaved = true;
            this.ctx.history.enforceRamLimit();

            console.log(`[TransformHandle] Evento transform guardado, ID=${event.id}. Generando sandbox...`);

            // Sincronizar el sandbox y variables locales *antes* del rebuild para evitar el race condition
            const freshBbox = this.ctx.history.getBboxForIds(targetIds);
            if (freshBbox && this.state === TransformState.FOCUSED) {
                this.ctx.selection.setBbox(freshBbox);
            }

            await this.sandbox.generate(this.ctx);
            this.currentMatrix = [1, 0, 0, 1, 0, 0];

            await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
            this._ignoreHistoryRestored = false;

            if (this.state !== TransformState.FOCUSED) return;
        }

        if (this.state === TransformState.FOCUSED) {
            this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';
            this._renderLivePreview();
        }
    }

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

    private async _enterFocused(ids: string[], bbox: BoundingBox, skipRebuild: boolean): Promise<void> {
        this.state = TransformState.FOCUSED;
        this.ctx.selection.setSelection(new Set(ids), bbox);
        this.currentMatrix = [1, 0, 0, 1, 0, 0];
        this.lastAction = 'none';

        this._ignoreHistoryRestored = true;
        if (!skipRebuild) await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        this._ignoreHistoryRestored = false;

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

        this._ignoreHistoryRestored = true;
        // === FIX APLICADO AQUÍ (this.ctx.rebuilder y this.ctx.activeBrush) ===
        await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        this._ignoreHistoryRestored = false;
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

    private _selectedIdsStr(): string {
        return Array.from(this.ctx.selection.selectedIds).sort().join(',');
    }

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