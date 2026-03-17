// src/tools/core/ITool.ts
import type { PointerData } from '../../input/InputManager';
import type { CanvasEngine } from '../../core/engine/CanvasEngine';
import type { ViewportManager } from '../../core/camera/ViewportManager';
import type { HistoryManager } from '../../history/HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { EventBus } from '../../input/EventBus';
import type { SelectionManager } from '../../core/selection/SelectionManager';
import type { CanvasRebuilder } from '../../core/render/CanvasRebuilder';
import type { UndoRedoController } from '../../history/UndoRedoController';

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
    selection: { setSelection(ids: Set<string>, bbox: any): void; clear(): void };
    eventBus: { emit(event: string, payload?: any): void };
    activeBrush: any;
    engine: IEngineForCommands;
}

export interface ToolContext {
    engine: CanvasEngine;
    viewport: ViewportManager;
    history: HistoryManager;
    storage: StorageManager;
    activeBrush: BrushEngine;
    eventBus: EventBus;
    selection: SelectionManager;
    rebuilder: CanvasRebuilder;
    undoRedoController: UndoRedoController;
}

export interface ITool {
    readonly id: string;
    isBusy(): boolean;
    onActivate(): void;
    // === FIX: Ahora la herramienta sabe por qué la están desactivando ===
    onDeactivate(reason?: string): void;
    onPointerDown(data: PointerData): void;
    onPointerMove(data: PointerData): void;
    onPointerUp(data: PointerData): void;
}