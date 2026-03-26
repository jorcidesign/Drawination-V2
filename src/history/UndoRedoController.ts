// src/history/UndoRedoController.ts
import type { HistoryManager, TimelineEvent, ActionType } from './HistoryManager';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { EventBus } from '../input/EventBus';
import type { StorageManager } from '../storage/StorageManager';
import type { CommandContext } from './commands/ICommand';
import { CommandFactory } from './commands/CommandFactory';
import { DiagnosticsService } from './DiagnosticsService';

export interface InterceptorResult {
    handled: boolean;
}

export interface IUndoInterceptor {
    beforeUndo(nextEvent: TimelineEvent | null): Promise<InterceptorResult>;
    beforeRedo(nextEvent: TimelineEvent | null): Promise<InterceptorResult>;
}

export class UndoRedoController {
    private interceptors: IUndoInterceptor[] = [];
    private history: HistoryManager;
    private rebuilder: CanvasRebuilder;
    private activeBrush: BrushEngine;
    private eventBus: EventBus;
    private commandContext: CommandContext;
    private storage: StorageManager;

    constructor(
        history: HistoryManager,
        rebuilder: CanvasRebuilder,
        activeBrush: BrushEngine,
        eventBus: EventBus,
        commandContext: CommandContext,
        storage: StorageManager,
    ) {
        this.history = history;
        this.rebuilder = rebuilder;
        this.activeBrush = activeBrush;
        this.eventBus = eventBus;
        this.commandContext = commandContext;
        this.storage = storage;
    }

    public registerInterceptor(interceptor: IUndoInterceptor): void {
        this.interceptors.push(interceptor);
    }

    public removeInterceptor(interceptor: IUndoInterceptor): void {
        const idx = this.interceptors.indexOf(interceptor);
        if (idx !== -1) this.interceptors.splice(idx, 1);
    }

    // ── SMART REBUILDING: Identifica si un evento requiere repintar el canvas ──
    private _requiresCanvasRebuild(eventType: ActionType): boolean {
        const cssOnlyEvents: ActionType[] = [
            'BACKGROUND_COLOR',
            'LAYER_OPACITY',
            'LAYER_VISIBILITY',
            'LAYER_REORDER',
            'LAYER_LOCK',
            'LAYER_SELECT'
        ];
        return !cssOnlyEvents.includes(eventType);
    }

    public async applyUndo(): Promise<void> {
        const nextEvent = this.history.peekUndo();

        for (const interceptor of this.interceptors) {
            const result = await interceptor.beforeUndo(nextEvent);
            if (result.handled) return;
        }

        const undoneEvent = this.history.applyUndo();
        if (!undoneEvent) return;

        DiagnosticsService.logUndoRedo('UNDO', undoneEvent);

        // Persistir el evento de control UNDO en IDB
        const undoControlEvent = this.history.timeline[this.history.timeline.length - 1];
        if (undoControlEvent?.type === 'UNDO') {
            undoControlEvent.isSaved = false;
            await this.storage.saveEvent(undoControlEvent);
            undoControlEvent.isSaved = true;
        }

        this.history.rebuildSpatialGrid();

        // === OPTIMIZACIÓN: Solo reconstruimos si alteró píxeles ===
        if (this._requiresCanvasRebuild(undoneEvent.type)) {
            await this.rebuilder.rebuild(this.activeBrush);
        } else {
            // Si es CSS puro (fondo, opacidad de capa, etc), solo sincronizamos el DOM
            this.eventBus.emit('SYNC_LAYERS_CSS');
        }

        this.history.enforceRamLimit();

        const cmd = CommandFactory.create(undoneEvent, this.activeBrush);
        if (cmd.onAfterUndo) {
            await cmd.onAfterUndo(this.commandContext);
        }

        this.eventBus.emit('HISTORY_RESTORED', { event: undoneEvent, action: 'UNDO' });
    }

    public async applyRedo(): Promise<void> {
        const nextEvent = this.history.peekRedo();

        for (const interceptor of this.interceptors) {
            const result = await interceptor.beforeRedo(nextEvent);
            if (result.handled) return;
        }

        const redoneEvent = this.history.applyRedo();
        if (!redoneEvent) return;

        DiagnosticsService.logUndoRedo('REDO', redoneEvent);

        // Persistir el evento de control REDO en IDB
        const redoControlEvent = this.history.timeline[this.history.timeline.length - 1];
        if (redoControlEvent?.type === 'REDO') {
            redoControlEvent.isSaved = false;
            await this.storage.saveEvent(redoControlEvent);
            redoControlEvent.isSaved = true;
        }

        this.history.rebuildSpatialGrid();

        // === OPTIMIZACIÓN: Solo reconstruimos si alteró píxeles ===
        if (this._requiresCanvasRebuild(redoneEvent.type)) {
            await this.rebuilder.rebuild(this.activeBrush);
        } else {
            this.eventBus.emit('SYNC_LAYERS_CSS');
        }

        this.history.enforceRamLimit();

        const cmd = CommandFactory.create(redoneEvent, this.activeBrush);
        if (cmd.onAfterRedo) {
            await cmd.onAfterRedo(this.commandContext);
        }

        this.eventBus.emit('HISTORY_RESTORED', { event: redoneEvent, action: 'REDO' });
    }
}