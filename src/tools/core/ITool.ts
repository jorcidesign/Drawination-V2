// src/tools/core/ITool.ts
import type { PointerData } from '../../input/InputManager';
import type { CanvasEngine } from '../../core/engine/CanvasEngine';
import type { ViewportManager } from '../../core/camera/ViewportManager';
import type { HistoryManager } from '../../history/HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';

// Contexto compartido para no tener que inyectar 10 cosas sueltas
export interface ToolContext {
    engine: CanvasEngine;
    viewport: ViewportManager;
    history: HistoryManager;
    storage: StorageManager;
    activeBrush: BrushEngine; // <-- AQUÍ
}

export interface ITool {
    readonly id: string;

    // Indica si la herramienta está a la mitad de una acción (ej. dibujando un trazo)
    isBusy(): boolean;

    onActivate(): void;
    onDeactivate(): void;

    onPointerDown(data: PointerData): void;
    onPointerMove(data: PointerData): void;
    onPointerUp(data: PointerData): void;
}