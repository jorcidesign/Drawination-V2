// src/app/WorkspaceController.ts
//
// CAMBIOS vs versión anterior:
//   1. Acepta CheckpointManager como dependencia opcional.
//   2. En CLEAR_ALL, llama a checkpoint.invalidate() para que la próxima
//      recarga no intente restaurar un canvas vacío desde el checkpoint antiguo.
//   3. Todo lo demás es idéntico.

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { TimelapsePlayer } from '../history/TimelapsePlayer';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { ViewportManager } from '../core/camera/ViewportManager';
import type { EventBus } from '../input/EventBus';
import type { SelectionManager } from '../core/selection/SelectionManager';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import type { ToolManager } from '../tools/core/ToolManager';
import type { UndoRedoController } from '../history/UndoRedoController';
import type { CheckpointManager } from '../history/CheckpointManager';

import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { InkProfile } from '../core/render/profiles/InkProfile';
import { FillProfile } from '../core/render/profiles/FillProfile';
import { PaintProfile } from '../core/render/profiles/PaintProfile';
import { HardRoundProfile } from '../core/render/profiles/HardRoundProfile';
import { AirbrushProfile } from '../core/render/profiles/AirbrushProfile';
import { CharcoalProfile } from '../core/render/profiles/CharcoalProfile';

export class WorkspaceController {
    private engine: CanvasEngine;
    private input: InputManager;
    private shortcuts: ShortcutManager;
    private history: HistoryManager;
    private timelapse: TimelapsePlayer;
    private activeBrush: BrushEngine;
    private storage: StorageManager;
    private viewport: ViewportManager;
    private eventBus: EventBus;
    private selection: SelectionManager;
    private rebuilder: CanvasRebuilder;
    private toolManager: ToolManager;
    private undoRedoController: UndoRedoController;
    private checkpoint: CheckpointManager | null;

    constructor(
        engine: CanvasEngine,
        input: InputManager,
        shortcuts: ShortcutManager,
        history: HistoryManager,
        timelapse: TimelapsePlayer,
        activeBrush: BrushEngine,
        storage: StorageManager,
        viewport: ViewportManager,
        eventBus: EventBus,
        selection: SelectionManager,
        rebuilder: CanvasRebuilder,
        toolManager: ToolManager,
        undoRedoController: UndoRedoController,
        checkpoint: CheckpointManager | null = null, // ← opcional, zero-breaking
    ) {
        this.engine = engine;
        this.input = input;
        this.shortcuts = shortcuts;
        this.history = history;
        this.timelapse = timelapse;
        this.activeBrush = activeBrush;
        this.storage = storage;
        this.viewport = viewport;
        this.eventBus = eventBus;
        this.selection = selection;
        this.rebuilder = rebuilder;
        this.toolManager = toolManager;
        this.undoRedoController = undoRedoController;
        this.checkpoint = checkpoint;

        this.bindInputEvents();
        this.bindShortcuts();
        this.bindBusEvents();
    }

    private bindInputEvents(): void {
        this.input.onPointerDown = (data) => this.toolManager.activeTool.onPointerDown(data);
        this.input.onPointerMove = (data) => this.toolManager.activeTool.onPointerMove(data);
        this.input.onPointerUp = (data) => this.toolManager.activeTool.onPointerUp(data);
    }

    private bindShortcuts(): void {
        this.shortcuts.bindDown('ctrl+z', () => this.undoRedoController.applyUndo());
        this.shortcuts.bindDown('ctrl+y', () => this.undoRedoController.applyRedo());
        this.shortcuts.bindDown('ctrl+shift+z', () => this.undoRedoController.applyRedo());
    }

    private bindBusEvents(): void {
        this.eventBus.on('PLAY_TIMELAPSE', async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;

            const spine = this.history.getTimelineSpine();
            if (spine.length === 0) return;

            this.history.isTimelapseRunning = true;
            try {
                await this.timelapse.play(spine, this.activeBrush, 30);
            } finally {
                this.history.isTimelapseRunning = false;
                this.history.enforceRamLimit();
            }

            await this.rebuilder.rebuild(this.activeBrush);
        });

        this.eventBus.on('DEBUG_DRAW_POINTS', () => {
            this.rebuilder.debugDrawPoints(this.activeBrush);
        });

        this.eventBus.on('CLEAR_ALL', async () => {
            this.history.timeline = [];
            this.history.rebuildSpatialGrid();
            this.history['invalidateCache']?.();
            this.selection.clear();
            this.engine.clearActiveLayer();
            this.engine.clearPaintingCanvas();
            await this.storage.clearAll?.();

            // Invalidar checkpoint: el canvas está vacío, no queremos que
            // la próxima recarga restaure el bitmap antiguo.
            await this.checkpoint?.invalidate();
        });

        // === GESTIÓN DE ESTADO DEL PINCEL ===
        this.eventBus.on('UPDATE_BRUSH_SIZE', (size) => {
            this.activeBrush.updateCurrentSize(size);
        });

        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity) => {
            this.activeBrush.updateCurrentOpacity(opacity);
        });

        this.eventBus.on('SET_COLOR', (color) => {
            this.activeBrush.setColor(color);
        });

        // === CAMBIO INTELIGENTE DE HERRAMIENTAS ===
        const applyAndSync = (profileObj: any) => {
            this.activeBrush.useProfile(profileObj);
            this.eventBus.emit('REQUEST_TOOL_SWITCH', 'pencil');
            this.eventBus.emit('SYNC_UI_SLIDERS', {
                size: this.activeBrush.profile.baseSize,
                opacity: this.activeBrush.profile.baseOpacity,
                minSize: this.activeBrush.profile.minSize || 1,
                maxSize: this.activeBrush.profile.maxSize || 100
            });
        };

        this.eventBus.on('SET_PROFILE_INK', () => applyAndSync(InkProfile));
        this.eventBus.on('SET_PROFILE_PENCIL', () => applyAndSync(PencilProfile));
        this.eventBus.on('SET_PROFILE_FILL', () => applyAndSync(FillProfile));
        this.eventBus.on('SET_PROFILE_PAINT', () => applyAndSync(PaintProfile));
        this.eventBus.on('SET_PROFILE_HARD_ROUND', () => applyAndSync(HardRoundProfile));
        this.eventBus.on('SET_PROFILE_AIRBRUSH', () => applyAndSync(AirbrushProfile));
        this.eventBus.on('SET_PROFILE_CHARCOAL', () => applyAndSync(CharcoalProfile));

        // === VIEWPORT ===
        this.eventBus.on('RESET_ROTATION', () => {
            const w = this.engine.container.clientWidth;
            const h = this.engine.container.clientHeight;
            this.viewport.setAngle(0, w / 2, h / 2);
        });

        this.eventBus.on('FLIP_HORIZONTAL', () => {
            const w = this.engine.container.clientWidth;
            const h = this.engine.container.clientHeight;
            this.viewport.flipHorizontal(w / 2, h / 2);
        });
    }
}