// src/tools/core/ITool.ts
import type { PointerData } from '../../input/InputManager';
import type { CanvasEngine } from '../../core/engine/CanvasEngine';
import type { ViewportManager } from '../../core/camera/ViewportManager';
import type { HistoryManager } from '../../history/HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { EventBus } from '../../input/EventBus';
import type { SelectionManager } from '../../core/selection/SelectionManager'; // <--- NUEVO

export interface ToolContext {
    engine: CanvasEngine;
    viewport: ViewportManager;
    history: HistoryManager;
    storage: StorageManager;
    activeBrush: BrushEngine;
    eventBus: EventBus;
    selection: SelectionManager; // <--- NUEVO
}

export interface ITool {
    readonly id: string;
    isBusy(): boolean;
    onActivate(): void;
    onDeactivate(): void;
    onPointerDown(data: PointerData): void;
    onPointerMove(data: PointerData): void;
    onPointerUp(data: PointerData): void;
}