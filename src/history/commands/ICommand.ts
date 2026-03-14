// src/history/commands/ICommand.ts
//
// Contrato base para todos los comandos del timeline.
// Patrón: Command + Open/Closed
//
// OPEN para extensión:  crear nuevos comandos (HideCommand, LayerCommand, etc.)
//                       implementando esta interfaz y registrándose en CommandFactory.
// CLOSED para modificación: nadie necesita tocar UndoRedoController ni
//                           WorkspaceController para añadir comportamiento nuevo.
//
// El método onAfterUndoRedo() es el punto clave:
// Cada comando sabe qué side-effects necesita después de un undo/redo.
// WorkspaceController nunca necesita un if/else por tipo de evento.

import type { StorageManager } from '../../storage/StorageManager';
import type { BoundingBox } from '../../core/math/BoundingBox';
import type { ActionType } from '../../history/TimelineTypes';

// ToolContext reducido — solo lo que los comandos necesitan para sus side-effects
// No importamos ToolContext completo para evitar dependencia circular
// Motor mínimo que CommandContext necesita — CanvasEngine lo satisface automáticamente.
// Añadir métodos aquí cuando se implemente Fase 4 (getLayerCanvas, etc.)
export interface IEngineForCommands {
    readonly width: number;
    readonly height: number;
    readonly container: HTMLElement;
    clearActiveLayer(): void;
    clearPaintingCanvas(): void;
    getActiveLayerContext(): CanvasRenderingContext2D;
}

export interface CommandContext {
    rebuilder: { rebuild(brush: any): Promise<void> };
    selection: { setSelection(ids: Set<string>, bbox: BoundingBox): void; clear(): void };
    eventBus: { emit(event: string, payload?: any): void };
    activeBrush: any;
    engine: IEngineForCommands;
}

export interface ICommand {
    readonly id: string;
    readonly type: ActionType;
    readonly bbox?: BoundingBox;


    // Matriz afín acumulada [a, b, c, d, tx, ty]
    // Se inyecta desde computeTimelineState() antes de execute()
    transform?: number[];

    // Carga data desde IDB si event.data es null (fue liberado por enforceRamLimit)
    loadDataIfNeeded(storage: StorageManager): Promise<void>;

    // Dibuja en el contexto dado — usado por CanvasRebuilder y TimelapsePlayer
    execute(ctx: CanvasRenderingContext2D): void;

    // Acceso directo al buffer binario — para debug y timelapse
    getRawData(): ArrayBuffer | null;

    // ── Hook opcional: side-effects post undo/redo ────────────────────────
    // Si un comando necesita hacer algo después de ser deshecho/rehecho
    // (activar TransformHandle, restaurar visibilidad de capa, etc.),
    // lo implementa aquí. UndoRedoController llama esto automáticamente.
    // Por defecto no hace nada — los comandos simples (STROKE, ERASE) no necesitan esto.
    onAfterUndo?(ctx: CommandContext): Promise<void>;
    onAfterRedo?(ctx: CommandContext): Promise<void>;
}