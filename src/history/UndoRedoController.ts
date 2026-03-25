// src/history/UndoRedoController.ts
//
// FLUJO CORRECTO DEL TRANSFORM HANDLE (según spec del usuario):
//
// UNDO desde estado IDLE + próximo evento es TRANSFORM:
//   → Abre handle en posición post-transform (handled=true, no se aplica el undo)
//
// UNDO desde estado FOCUSED sobre el mismo TRANSFORM:
//   → Aplica el undo histórico, handle sigue abierto en posición pre-transform (handled=false)
//
// UNDO desde estado FOCUSED sobre TRANSFORM diferente o no-TRANSFORM:
//   → Sale del handle (handled=true), no aplica undo todavía
//
// REDO es el espejo exacto de UNDO.
//
// FIX DEL BUG: El problema era que applyUndo/applyRedo llamaba a los interceptores,
// y si el interceptor devolvía handled=true el método terminaba — correcto.
// Pero si devolvía handled=false, el UndoRedoController aplicaba el undo/redo
// histórico Y luego llamaba cmd.onAfterUndo() → que emitía
// REQUEST_TRANSFORM_HANDLE_REFRESH → que disparaba onDeactivate del handle actual
// via GLOBAL_INTERRUPTION o REQUEST_TOOL_SWITCH, cerrando el handle accidentalmente.
//
// SOLUCIÓN:
//   cmd.onAfterUndo/Redo solo se llama para comandos que NO son TRANSFORM,
//   porque para TRANSFORM el manejo del handle lo hace TransformHandleTool
//   directamente via beforeUndo/beforeRedo. No necesita el hook post-undo.

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

    // Guard para evitar reentrancia: si ya estamos procesando un undo/redo,
    // ignorar peticiones adicionales que puedan llegar via eventos en cadena.
    private _isProcessing = false;

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
        // Guard de reentrancia: evita que eventos en cadena llamen applyUndo de nuevo
        if (this._isProcessing) return;
        this._isProcessing = true;

        try {
            const nextEvent = this.history.peekUndo();

            // Fase 1: dar a los interceptores la oportunidad de manejar el undo
            // antes de que el historial se modifique.
            for (const interceptor of this.interceptors) {
                const result = await interceptor.beforeUndo(nextEvent);
                if (result.handled) return;
                // Si handled=false, el interceptor decidió no manejarlo
                // pero puede haber cambiado el estado visual (ej: abrió el handle).
                // Continuamos con el undo histórico normalmente.
            }

            // Fase 2: aplicar el undo en el historial
            const undoneEvent = this.history.applyUndo();
            if (!undoneEvent) return;

            DiagnosticsService.logUndoRedo('UNDO', undoneEvent);

            // FIX: persistir el evento UNDO en IDB
            const undoControlEvent = this.history.timeline[this.history.timeline.length - 1];
            if (undoControlEvent?.type === 'UNDO') {
                undoControlEvent.isSaved = false;
                await this.storage.saveEvent(undoControlEvent);
                undoControlEvent.isSaved = true;
            }

            this.history.rebuildSpatialGrid();
            await this.rebuilder.rebuild(this.activeBrush);
            this.history.enforceRamLimit();

            // Fase 3: notificar side-effects post-undo.
            // EXCEPCIÓN: TRANSFORM no necesita onAfterUndo porque TransformHandleTool
            // ya manejó todo en beforeUndo (abrió el handle, actualizó posición, etc.)
            // Si llamáramos onAfterUndo en TRANSFORM, emitiría REQUEST_TRANSFORM_HANDLE_REFRESH
            // que causaría un segundo ciclo de apertura/cierre del handle.
            const cmd = CommandFactory.create(undoneEvent, this.activeBrush);
            if (cmd.onAfterUndo && undoneEvent.type !== 'TRANSFORM') {
                await cmd.onAfterUndo(this.commandContext);
            }

            this.eventBus.emit('HISTORY_RESTORED', { event: undoneEvent, action: 'UNDO' });

        } finally {
            this._isProcessing = false;
        }
    }

    public async applyRedo(): Promise<void> {
        // Guard de reentrancia
        if (this._isProcessing) return;
        this._isProcessing = true;

        try {
            const nextEvent = this.history.peekRedo();

            // Fase 1: dar a los interceptores la oportunidad de manejar el redo
            for (const interceptor of this.interceptors) {
                const result = await interceptor.beforeRedo(nextEvent);
                if (result.handled) return;
            }

            // Fase 2: aplicar el redo en el historial
            const redoneEvent = this.history.applyRedo();
            if (!redoneEvent) return;

            DiagnosticsService.logUndoRedo('REDO', redoneEvent);

            // FIX: persistir el evento REDO en IDB
            const redoControlEvent = this.history.timeline[this.history.timeline.length - 1];
            if (redoControlEvent?.type === 'REDO') {
                redoControlEvent.isSaved = false;
                await this.storage.saveEvent(redoControlEvent);
                redoControlEvent.isSaved = true;
            }

            this.history.rebuildSpatialGrid();
            await this.rebuilder.rebuild(this.activeBrush);
            this.history.enforceRamLimit();

            // Fase 3: notificar side-effects post-redo.
            // Misma excepción que en applyUndo: TRANSFORM lo maneja TransformHandleTool.
            const cmd = CommandFactory.create(redoneEvent, this.activeBrush);
            if (cmd.onAfterRedo && redoneEvent.type !== 'TRANSFORM') {
                await cmd.onAfterRedo(this.commandContext);
            }

            this.eventBus.emit('HISTORY_RESTORED', { event: redoneEvent, action: 'REDO' });

        } finally {
            this._isProcessing = false;
        }
    }
}