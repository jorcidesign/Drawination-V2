// src/history/UndoRedoController.ts
//
// FIX: los eventos UNDO y REDO ahora se persisten en IDB.
//
// RAÍZ DEL BUG:
//   applyUndo() y applyRedo() hacen history.push({ type: 'UNDO'/'REDO', isSaved: false })
//   pero NUNCA llamaban a storage.saveEvent() sobre esos eventos.
//   Al recargar, loadTimeline() devuelve solo STROKE/ERASE/FILL desde IDB.
//   computeTimelineState() los ve TODOS como activos — sin UNDO/REDO que los cancele.
//   Resultado: trazos deshechos reaparecen en el canvas al recargar.
//
// FIX:
//   Después de applyUndo() y applyRedo(), persistir el evento de control en IDB.
//   StorageManager.saveEvent() ya tiene el guard correcto para eventos sin data
//   (isDataEvent check), así que los UNDO/REDO se guardan como registros livianos
//   (sin blob, solo metadata). El loadTimeline() los leerá en orden cronológico
//   y computeTimelineState() los procesará igual que en RAM.
//
// TAMAÑO DEL EVENTO UNDO/REDO en IDB: ~200 bytes (solo metadata, sin data binaria).

import type { HistoryManager, TimelineEvent } from './HistoryManager';
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

    public async applyUndo(): Promise<void> {
        const nextEvent = this.history.peekUndo();

        for (const interceptor of this.interceptors) {
            const result = await interceptor.beforeUndo(nextEvent);
            if (result.handled) return;
        }

        const undoneEvent = this.history.applyUndo();
        if (!undoneEvent) return;

        DiagnosticsService.logUndoRedo('UNDO', undoneEvent);

        // FIX: persistir el evento UNDO en IDB para que sobreviva la recarga
        const undoControlEvent = this.history.timeline[this.history.timeline.length - 1];
        if (undoControlEvent?.type === 'UNDO') {
            undoControlEvent.isSaved = false;
            await this.storage.saveEvent(undoControlEvent);
            undoControlEvent.isSaved = true;
        }

        this.history.rebuildSpatialGrid();
        await this.rebuilder.rebuild(this.activeBrush);
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

        // FIX: persistir el evento REDO en IDB para que sobreviva la recarga
        const redoControlEvent = this.history.timeline[this.history.timeline.length - 1];
        if (redoControlEvent?.type === 'REDO') {
            redoControlEvent.isSaved = false;
            await this.storage.saveEvent(redoControlEvent);
            redoControlEvent.isSaved = true;
        }

        this.history.rebuildSpatialGrid();
        await this.rebuilder.rebuild(this.activeBrush);
        this.history.enforceRamLimit();

        const cmd = CommandFactory.create(redoneEvent, this.activeBrush);
        if (cmd.onAfterRedo) {
            await cmd.onAfterRedo(this.commandContext);
        }

        this.eventBus.emit('HISTORY_RESTORED', { event: redoneEvent, action: 'REDO' });
    }
}