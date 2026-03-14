// src/history/commands/TransformCommand.ts
//
// Comando para el evento TRANSFORM.
// Patrón: Command + Self-Registration (idéntico a StrokeCommand, EraseCommand, HideCommand).
//
// POR QUÉ FALTABA:
//   CommandFactory no tenía 'TRANSFORM' registrado → DummyCommand silencioso.
//   UndoRedoController llama cmd.onAfterUndo / cmd.onAfterRedo después del rebuild.
//   Con DummyCommand, esos hooks nunca ejecutaban → el TransformHandleTool
//   no recibía la señal de "abre el handle en la posición correcta".
//
// QUÉ HACE ESTE COMANDO:
//   execute()      → no-op (el rebuild ya aplica las matrices de computeTimelineState)
//   onAfterUndo()  → emite REQUEST_TRANSFORM_HANDLE_REFRESH para que el Handle
//                    se reabra sobre los trazos afectados en su posición pre-transform
//   onAfterRedo()  → ídem, posición post-transform
//
// FLUJO COMPLETO (Ctrl+Z sobre TRANSFORM desde estado IDLE):
//   1. UndoRedoController.applyUndo() → beforeUndo(TRANSFORM) en TransformHandleTool
//   2. TransformHandleTool.beforeUndo() → si IDLE: entra a FOCUSED, devuelve handled=true
//      (el Handle se abre, el rebuild ya ocurrió dentro de _enterFocused)
//   3. Si ya en FOCUSED sobre el mismo grupo: devuelve handled=false
//   4. UndoRedoController aplica el undo histórico + rebuild
//   5. cmd.onAfterUndo() → emite REFRESH para que el Handle actualice su bbox

import type { ICommand, CommandContext } from './ICommand';
import type { TimelineEvent } from '../TimelineTypes';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { BoundingBox } from '../../core/math/BoundingBox';
import { CommandFactory } from './CommandFactory';

export class TransformCommand implements ICommand {
    private event: TimelineEvent;
    public transform?: number[];

    constructor(event: TimelineEvent, _brush: BrushEngine) {
        this.event = event;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox(): BoundingBox | undefined { return undefined; }

    // TRANSFORM no tiene datos binarios propios — la matriz está en el evento
    public async loadDataIfNeeded(_storage: StorageManager): Promise<void> { }

    // No dibuja nada directamente: el rebuild lee las matrices de computeTimelineState
    // y las inyecta en cada comando vía getActiveCommands()
    public execute(_ctx: CanvasRenderingContext2D): void { }

    public getRawData(): ArrayBuffer | null { return null; }

    // Después de deshacer un TRANSFORM: el Handle debe abrirse mostrando
    // los trazos en su posición PRE-transform (la que quedó tras el rebuild)
    public async onAfterUndo(ctx: CommandContext): Promise<void> {
        if (!this.event.targetIds || this.event.targetIds.length === 0) return;

        ctx.eventBus.emit('REQUEST_TRANSFORM_HANDLE_REFRESH', {
            targetIds: this.event.targetIds,
        });
    }

    // Después de rehacer un TRANSFORM: el Handle debe abrirse mostrando
    // los trazos en su posición POST-transform
    public async onAfterRedo(ctx: CommandContext): Promise<void> {
        if (!this.event.targetIds || this.event.targetIds.length === 0) return;

        ctx.eventBus.emit('REQUEST_TRANSFORM_HANDLE_REFRESH', {
            targetIds: this.event.targetIds,
        });
    }
}

CommandFactory.register('TRANSFORM', TransformCommand);