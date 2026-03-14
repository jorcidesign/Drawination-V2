// src/history/commands/HideCommand.ts
//
// Comando para el evento HIDE — ocultar trazos de forma no destructiva.
// Patrón: Command + Self-Registration
//
// onAfterUndo: cuando se deshace un HIDE, los trazos vuelven a ser visibles.
//              El rebuild se encarga del canvas. Aquí solo notificamos a la UI.
// onAfterRedo: cuando se rehace un HIDE, los trazos vuelven a ocultarse.
//
// NOTA: La visibilidad real la gestiona computeTimelineState() via hiddenIds.
//       Este comando solo dispara side-effects de UI post undo/redo.

import type { ICommand, CommandContext } from './ICommand';
import type { TimelineEvent } from '../TimelineTypes';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { BoundingBox } from '../../core/math/BoundingBox';
import { CommandFactory } from './CommandFactory';

export class HideCommand implements ICommand {
    private event: TimelineEvent;
    public transform?: number[];

    constructor(event: TimelineEvent, _brush: BrushEngine) {
        this.event = event;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox(): BoundingBox | undefined { return undefined; }

    // HIDE no tiene datos binarios — no hay nada que cargar
    public async loadDataIfNeeded(_storage: StorageManager): Promise<void> { }

    // HIDE no dibuja nada en el canvas — computeTimelineState() lo excluye
    // de active[] via hiddenIds, y el rebuild simplemente no lo dibuja
    public execute(_ctx: CanvasRenderingContext2D): void { }

    public getRawData(): ArrayBuffer | null { return null; }

    // Después de deshacer un HIDE → los trazos vuelven a aparecer
    // El rebuild ya los dibujó. Solo notificamos a la UI si es necesario.
    public async onAfterUndo(_ctx: CommandContext): Promise<void> {
        // El rebuild en UndoRedoController ya restauró el canvas.
        // Si en el futuro hay un panel de capas o indicador visual, emitir aquí.
        _ctx.eventBus.emit('HIDE_UNDONE', { targetIds: this.event.targetIds ?? [] });
    }

    // Después de rehacer un HIDE → los trazos vuelven a ocultarse
    public async onAfterRedo(_ctx: CommandContext): Promise<void> {
        _ctx.eventBus.emit('HIDE_REDONE', { targetIds: this.event.targetIds ?? [] });
    }
}

CommandFactory.register('HIDE', HideCommand);