// src/app/WorkspaceController.ts

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { TimelapseViewer } from '../history/TimelapseViewer';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { ViewportManager } from '../core/camera/ViewportManager';
import type { EventBus } from '../input/EventBus';
import type { SelectionManager } from '../core/selection/SelectionManager';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import type { ToolManager } from '../tools/core/ToolManager';
import type { UndoRedoController } from '../history/UndoRedoController';
import type { CheckpointManager } from '../history/CheckpointManager';
import type { NewProjectModal } from '../ui/panels/NewProjectModal';

import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { InkProfile } from '../core/render/profiles/InkProfile';
import { FillProfile } from '../core/render/profiles/FillProfile';
import { PaintProfile } from '../core/render/profiles/PaintProfile';
import { HardRoundProfile } from '../core/render/profiles/HardRoundProfile';
import { AirbrushProfile } from '../core/render/profiles/AirbrushProfile';
import { CharcoalProfile } from '../core/render/profiles/CharcoalProfile';
import { ExportManager } from '../export/ExportManager';

export class WorkspaceController {
    private engine: CanvasEngine;
    private input: InputManager;
    private shortcuts: ShortcutManager;
    private history: HistoryManager;
    private timelapseViewer: TimelapseViewer;
    private activeBrush: BrushEngine;
    private storage: StorageManager;
    private viewport: ViewportManager;
    private eventBus: EventBus;
    private selection: SelectionManager;
    private rebuilder: CanvasRebuilder;
    private toolManager: ToolManager;
    private undoRedoController: UndoRedoController;
    private checkpoint: CheckpointManager | null;
    private newProjectModal: NewProjectModal;
    private saveCanvasSize: (w: number, h: number) => void;
    private exportManager: ExportManager;

    constructor(
        engine: CanvasEngine,
        input: InputManager,
        shortcuts: ShortcutManager,
        history: HistoryManager,
        timelapseViewer: TimelapseViewer,
        activeBrush: BrushEngine,
        storage: StorageManager,
        viewport: ViewportManager,
        eventBus: EventBus,
        selection: SelectionManager,
        rebuilder: CanvasRebuilder,
        toolManager: ToolManager,
        undoRedoController: UndoRedoController,
        checkpoint: CheckpointManager | null = null,
        newProjectModal: NewProjectModal,
        saveCanvasSize: (w: number, h: number) => void,
    ) {
        this.engine = engine;
        this.input = input;
        this.shortcuts = shortcuts;
        this.history = history;
        this.timelapseViewer = timelapseViewer;
        this.activeBrush = activeBrush;
        this.storage = storage;
        this.viewport = viewport;
        this.eventBus = eventBus;
        this.selection = selection;
        this.rebuilder = rebuilder;
        this.toolManager = toolManager;
        this.undoRedoController = undoRedoController;
        this.checkpoint = checkpoint;
        this.newProjectModal = newProjectModal;
        this.saveCanvasSize = saveCanvasSize;

        this.exportManager = new ExportManager(
            this.engine,
            this.history,
            this.activeBrush,
            this.storage,
        );

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

        // ── Timelapse viewer ──────────────────────────────────────────────
        this.eventBus.on('PLAY_TIMELAPSE', async () => {
            if (this.timelapseViewer.isPlaying()) return;
            this.eventBus.emit('GLOBAL_INTERRUPTION');
            this.history.isTimelapseRunning = true;
            try {
                await this.timelapseViewer.play();
            } finally {
                this.history.isTimelapseRunning = false;
                this.history.enforceRamLimit();
            }
        });

        // ── Nuevo proyecto ────────────────────────────────────────────────
        this.eventBus.on('SHOW_NEW_PROJECT', () => {
            this.newProjectModal.show();
        });

        this.eventBus.on('NEW_PROJECT', async ({ width, height }) => {
            // 1. Interrumpir herramientas activas
            this.eventBus.emit('GLOBAL_INTERRUPTION');

            // 2. Limpiar historia, selección y canvas
            this.history.timeline = [];
            this.history.rebuildSpatialGrid();
            this.history['invalidateCache']?.();
            this.selection.clear();
            this.engine.clearAllLayers();
            this.engine.clearPaintingCanvas();

            // 3. Limpiar IDB y checkpoint
            await this.storage.clearAll?.();
            await this.checkpoint?.invalidate();

            // 4. Aplicar nuevas dimensiones al engine (resize DOM + canvas elements)
            this.engine.resize(width, height);

            // 5. Actualizar el contenedor visual del workspace (#canvas-area).
            //    Este div envuelve al engine y define el tamaño del "papel"
            //    visible (fondo blanco, sombra, etc.). Sin esto el wrapper
            //    sigue siendo 1180×1180 aunque el canvas interno ya cambió.
            const canvasArea = document.getElementById('canvas-area');
            if (canvasArea) {
                canvasArea.style.width = `${width}px`;
                canvasArea.style.height = `${height}px`;
            }

            // 6. Guardar en localStorage para próxima sesión
            this.saveCanvasSize(width, height);

            // 7. Resetear viewport — centra el nuevo canvas en pantalla
            //    viewport.reset() calcula x/y correctos y llama applyTransform()
            //    internamente. Sin esto la transformación CSS no se actualiza
            //    y el InputManager recibe coordenadas desfasadas.
            this.viewport.reset(width, height);

            console.info(`[WorkspaceController] ✅ Nuevo proyecto: ${width}×${height}`);
        });

        // ── Exportación ───────────────────────────────────────────────────
        this.eventBus.on('DOWNLOAD_PNG', async () => {
            try {
                await this.exportManager.exportPNG();
            } catch (e) {
                console.error('[ExportManager] Error exportando PNG:', e);
                alert('Error al exportar la imagen. Intenta de nuevo.');
            }
        });

        this.eventBus.on('DOWNLOAD_VIDEO', async () => {
            try {
                await this.exportManager.exportVideo();
            } catch (e) {
                console.error('[ExportManager] Error exportando video:', e);
                alert('Error al exportar el video. Intenta de nuevo.');
            }
        });

        this.eventBus.on('DEBUG_DRAW_POINTS', () => {
            this.rebuilder.debugDrawPoints(this.activeBrush);
        });

        // ── CLEAR_ALL (borrar todo sin cambiar formato) ───────────────────
        this.eventBus.on('CLEAR_ALL', async () => {
            this.eventBus.emit('GLOBAL_INTERRUPTION');
            this.history.timeline = [];
            this.history.rebuildSpatialGrid();
            this.history['invalidateCache']?.();
            this.selection.clear();
            this.engine.clearAllLayers();
            this.engine.clearPaintingCanvas();
            await this.storage.clearAll?.();
            await this.checkpoint?.invalidate();
        });

        this.eventBus.on('UPDATE_BRUSH_SIZE', (size) => {
            this.activeBrush.updateCurrentSize(size);
        });

        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity) => {
            this.activeBrush.updateCurrentOpacity(opacity);
        });

        this.eventBus.on('SET_COLOR', (color) => {
            this.activeBrush.setColor(color);
        });

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