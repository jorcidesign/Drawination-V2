// src/app/WorkspaceController.ts

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager, TimelineEvent } from '../history/HistoryManager';
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
import { StylizedProfile } from '../core/render/profiles/StylizedProfile';
import { ExportManager } from '../export/ExportManager';
import { DEFAULT_BACKGROUND_COLOR } from '../history/computeTimelineState';

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
        engine: CanvasEngine, input: InputManager, shortcuts: ShortcutManager,
        history: HistoryManager, timelapseViewer: TimelapseViewer, activeBrush: BrushEngine,
        storage: StorageManager, viewport: ViewportManager, eventBus: EventBus,
        selection: SelectionManager, rebuilder: CanvasRebuilder, toolManager: ToolManager,
        undoRedoController: UndoRedoController, checkpoint: CheckpointManager | null = null,
        newProjectModal: NewProjectModal, saveCanvasSize: (w: number, h: number) => void,
    ) {
        this.engine = engine; this.input = input; this.shortcuts = shortcuts;
        this.history = history; this.timelapseViewer = timelapseViewer; this.activeBrush = activeBrush;
        this.storage = storage; this.viewport = viewport; this.eventBus = eventBus;
        this.selection = selection; this.rebuilder = rebuilder; this.toolManager = toolManager;
        this.undoRedoController = undoRedoController; this.checkpoint = checkpoint;
        this.newProjectModal = newProjectModal; this.saveCanvasSize = saveCanvasSize;

        this.exportManager = new ExportManager(this.engine, this.history, this.activeBrush, this.storage);

        this.bindInputEvents();
        this.bindShortcuts();
        this.bindBusEvents();
    }

    private bindInputEvents(): void {
        this.input.onPointerDown = (data) => {
            const toolId = this.toolManager.activeTool.id;
            if (toolId !== 'pan' && toolId !== 'zoom' && toolId !== 'rotate' && toolId !== 'lasso' && toolId !== 'transform-handle' && toolId !== 'background') {
                const state = this.history.getState();
                const isLocked = state.layersState.get(state.derivedActiveLayerIndex)?.locked;
                if (isLocked) {
                    console.info("🔒 Capa bloqueada. Acción denegada.");
                    return;
                }
            }
            this.toolManager.activeTool.onPointerDown(data);
        };
        this.input.onPointerMove = (data) => this.toolManager.activeTool.onPointerMove(data);
        this.input.onPointerUp = (data) => this.toolManager.activeTool.onPointerUp(data);
    }

    private bindShortcuts(): void {
        this.shortcuts.bindDown('ctrl+z', () => this.undoRedoController.applyUndo());
        this.shortcuts.bindDown('ctrl+y', () => this.undoRedoController.applyRedo());
        this.shortcuts.bindDown('ctrl+shift+z', () => this.undoRedoController.applyRedo());
    }

    private bindBusEvents(): void {
        this.eventBus.on('REQUEST_UNDO', () => this.undoRedoController.applyUndo());
        this.eventBus.on('REQUEST_REDO', () => this.undoRedoController.applyRedo());

        this.eventBus.on('BACKGROUND_COLOR_PREVIEW', (color: string) => this._applyBackgroundColor(color));
        this.eventBus.on('BACKGROUND_COLOR_CHANGED', async (color: string) => {
            this._applyBackgroundColor(color);
            const event = this.history.commitLayerAction('BACKGROUND_COLOR', 0, { backgroundColor: color });
            await this.storage.saveEvent(event);
            event.isSaved = true;
        });

        this.eventBus.on('HISTORY_RESTORED', () => {
            this._applyBackgroundColor(this.history.getState().backgroundColor);
        });

        this.eventBus.on('SYNC_LAYERS_CSS', () => {
            this._applyBackgroundColor(this.history.getState().backgroundColor);
        });

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

        this.eventBus.on('SHOW_NEW_PROJECT', () => this.newProjectModal.show());

        // Reemplaza el bloque de NEW_PROJECT:
        this.eventBus.on('NEW_PROJECT', async ({ width, height }) => {
            this.eventBus.emit('GLOBAL_INTERRUPTION');
            this.history.timeline = [];

            // 🚀 OPTIMIZACIÓN LAZY: Vaciar la memoria es O(1)
            this.history.spatialGrid.clear();

            this.history['invalidateCache']?.();
            this.selection.clear();
            this.engine.clearAllLayers();
            this.engine.clearPaintingCanvas();
            await this.storage.clearAll?.();
            await this.checkpoint?.invalidate();

            this.engine.resize(width, height);
            const canvasArea = document.getElementById('canvas-area');
            if (canvasArea) {
                canvasArea.style.width = `${width}px`;
                canvasArea.style.height = `${height}px`;
            }
            this.saveCanvasSize(width, height);
            this.viewport.reset(width, height);
            this._applyBackgroundColor(DEFAULT_BACKGROUND_COLOR);
            this.eventBus.emit('SYNC_LAYERS_CSS');
            console.info(`[WorkspaceController] ✅ Nuevo proyecto: ${width}×${height}`);
        });

        this.eventBus.on('VIEWPORT_ZOOM_SET', (zoom) => this.viewport.setZoom(zoom));
        this.eventBus.on('VIEWPORT_ANGLE_SET', (degrees) => this.viewport.setAngleAbsolute(degrees));
        this.eventBus.on('RESET_ZOOM', () => this.viewport.reset(this.engine.width, this.engine.height));
        this.eventBus.on('RESET_ROTATION', () => this.viewport.setAngle(0, window.innerWidth / 2, window.innerHeight / 2));
        this.eventBus.on('FLIP_HORIZONTAL', () => this.viewport.flipHorizontal(window.innerWidth / 2, window.innerHeight / 2));

        this.eventBus.on('DOWNLOAD_PNG', async () => {
            try { await this.exportManager.exportPNG(); } catch { alert('Error al exportar la imagen.'); }
        });
        this.eventBus.on('DOWNLOAD_VIDEO', async () => {
            try { await this.exportManager.exportVideo(); } catch { alert('Error al exportar el video.'); }
        });

        this.eventBus.on('DEBUG_DRAW_POINTS', () => {
            this.rebuilder.debugDrawPoints(this.activeBrush);
        });

        // Reemplaza el bloque de CLEAR_ALL:
        this.eventBus.on('CLEAR_ALL', async () => {
            this.eventBus.emit('GLOBAL_INTERRUPTION');
            this.history.timeline = [];

            // 🚀 OPTIMIZACIÓN LAZY: Vaciar la memoria es O(1)
            this.history.spatialGrid.clear();

            this.history['invalidateCache']?.();
            this.selection.clear();
            this.engine.clearAllLayers();
            this.engine.clearPaintingCanvas();
            await this.storage.clearAll?.();
            await this.checkpoint?.invalidate();
            this._applyBackgroundColor(DEFAULT_BACKGROUND_COLOR);
            this.eventBus.emit('SYNC_LAYERS_CSS');
        });

        this.eventBus.on('UPDATE_BRUSH_SIZE', (size) => this.activeBrush.updateCurrentSize(size));
        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity) => this.activeBrush.updateCurrentOpacity(opacity));
        this.eventBus.on('SET_COLOR', (color) => this.activeBrush.setColor(color));

        const applyAndSync = (profileObj: any) => {
            this.activeBrush.useProfile(profileObj);
            this.eventBus.emit('REQUEST_TOOL_SWITCH', 'pencil');
            this.eventBus.emit('SYNC_UI_SLIDERS', {
                size: this.activeBrush.profile.baseSize,
                opacity: this.activeBrush.profile.baseOpacity,
                minSize: this.activeBrush.profile.minSize || 1,
                maxSize: this.activeBrush.profile.maxSize || 100,
                profileId: this.activeBrush.profile.id // <--- FIX: Enviamos el ID a la UI
            });
        };

        this.eventBus.on('SET_PROFILE_INK', () => applyAndSync(InkProfile));
        this.eventBus.on('SET_PROFILE_STYLIZED', () => applyAndSync(StylizedProfile));
        this.eventBus.on('SET_PROFILE_PENCIL', () => applyAndSync(PencilProfile));
        this.eventBus.on('SET_PROFILE_FILL', () => applyAndSync(FillProfile));
        this.eventBus.on('SET_PROFILE_PAINT', () => applyAndSync(PaintProfile));
        this.eventBus.on('SET_PROFILE_HARD_ROUND', () => applyAndSync(HardRoundProfile));
        this.eventBus.on('SET_PROFILE_AIRBRUSH', () => applyAndSync(AirbrushProfile));
        this.eventBus.on('SET_PROFILE_CHARCOAL', () => applyAndSync(CharcoalProfile));

        // ── Layer actions ─────────────────────────────────────────────────
        this.eventBus.on('LAYER_ACTION_CREATE', () => this._handleLayerCreate());
        this.eventBus.on('LAYER_ACTION_SELECT', (layerIndex) => this._handleLayerSelect(layerIndex));
        this.eventBus.on('LAYER_ACTION_TOGGLE_VISIBILITY', (layerIndex) => this._handleLayerToggleVisibility(layerIndex));
        this.eventBus.on('LAYER_ACTION_DELETE', (layerIndex) => this._handleLayerDelete(layerIndex));
        this.eventBus.on('LAYER_ACTION_REORDER', (newOrder) => this._handleLayerReorder(newOrder));
        this.eventBus.on('LAYER_ACTION_OPACITY', ({ layerIndex, opacity }) => this._handleLayerOpacity(layerIndex, opacity));
        this.eventBus.on('LAYER_ACTION_LOCK', (layerIndex) => this._handleLayerLock(layerIndex));
        this.eventBus.on('LAYER_ACTION_DUPLICATE', (layerIndex) => this._handleLayerDuplicate(layerIndex));
        this.eventBus.on('LAYER_ACTION_MERGE', (layerIndex) => this._handleLayerMergeDown(layerIndex));
    }

    private async _handleLayerCreate(): Promise<void> {
        this.eventBus.emit('GLOBAL_INTERRUPTION');
        const state = this.history.getState();

        let newIndex = -1;
        for (let i = state.derivedActiveLayerIndex + 1; i < 10; i++) {
            if (!state.createdLayers.has(i)) { newIndex = i; break; }
        }
        if (newIndex === -1) {
            for (let i = state.derivedActiveLayerIndex - 1; i >= 0; i--) {
                if (!state.createdLayers.has(i)) { newIndex = i; break; }
            }
        }
        if (newIndex === -1) return;

        const createEvent = this.history.commitLayerAction('LAYER_CREATE', newIndex, {
            layerName: `Capa ${newIndex + 1}`
        });
        await this.storage.saveEvent(createEvent);
        createEvent.isSaved = true;

        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerSelect(layerIndex: number): Promise<void> {
        if (this.history.getState().derivedActiveLayerIndex === layerIndex) return;
        this.eventBus.emit('GLOBAL_INTERRUPTION');
        const event = this.history.commitLayerAction('LAYER_SELECT', layerIndex);
        await this.storage.saveEvent(event);
        event.isSaved = true;
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerToggleVisibility(layerIndex: number): Promise<void> {
        this.eventBus.emit('GLOBAL_INTERRUPTION');
        const state = this.history.getState();
        const currentVisible = state.layersState.get(layerIndex)?.visible ?? true;
        const event = this.history.commitLayerAction('LAYER_VISIBILITY', layerIndex, { visible: !currentVisible });
        await this.storage.saveEvent(event);
        event.isSaved = true;
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerDelete(layerIndex: number): Promise<void> {
        const state = this.history.getState();
        if (state.createdLayers.size <= 1) return;
        if (state.layersState.get(layerIndex)?.locked) return;

        this.eventBus.emit('GLOBAL_INTERRUPTION');

        const sortedLayers = Array.from(state.createdLayers).sort((a, b) => {
            return state.layerOrder.indexOf(a) - state.layerOrder.indexOf(b);
        });
        const deletedPos = sortedLayers.indexOf(layerIndex);
        let newActive = deletedPos > 0 ? sortedLayers[deletedPos - 1] : sortedLayers[deletedPos + 1];
        if (newActive == null) newActive = 0;

        const selectEvent = this.history.commitLayerAction('LAYER_SELECT', newActive);
        await this.storage.saveEvent(selectEvent);
        selectEvent.isSaved = true;

        const deleteEvent = this.history.commitLayerAction('LAYER_DELETE', layerIndex, {
            layerOrder: [...state.layerOrder]
        });
        await this.storage.saveEvent(deleteEvent);
        deleteEvent.isSaved = true;

        await this.rebuilder.rebuild(this.activeBrush);
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerReorder(newOrder: number[]): Promise<void> {
        this.eventBus.emit('GLOBAL_INTERRUPTION');
        const event = this.history.commitLayerAction('LAYER_REORDER', 0, { layerOrder: newOrder });
        await this.storage.saveEvent(event);
        event.isSaved = true;
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerOpacity(layerIndex: number, opacity: number): Promise<void> {
        const event = this.history.commitLayerAction('LAYER_OPACITY', layerIndex, { layerOpacity: opacity });
        await this.storage.saveEvent(event);
        event.isSaved = true;
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerLock(layerIndex: number): Promise<void> {
        this.eventBus.emit('GLOBAL_INTERRUPTION');
        const state = this.history.getState();
        const currentLock = state.layersState.get(layerIndex)?.locked ?? false;
        const event = this.history.commitLayerAction('LAYER_LOCK', layerIndex, { locked: !currentLock });
        await this.storage.saveEvent(event);
        event.isSaved = true;
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerMergeDown(layerIndex: number): Promise<void> {
        const state = this.history.getState();
        if (state.layersState.get(layerIndex)?.locked) return;

        const currentIndexInOrder = state.layerOrder.indexOf(layerIndex);
        let target = -1;
        for (let i = currentIndexInOrder - 1; i >= 0; i--) {
            if (state.createdLayers.has(state.layerOrder[i])) { target = state.layerOrder[i]; break; }
        }

        if (target === -1 || state.layersState.get(target)?.locked) return;

        this.eventBus.emit('GLOBAL_INTERRUPTION');

        const event = this.history.commitLayerAction('LAYER_MERGE_DOWN', layerIndex, {
            layerOrder: [...state.layerOrder]
        });
        await this.storage.saveEvent(event);
        event.isSaved = true;

        await this.rebuilder.rebuild(this.activeBrush);
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private async _handleLayerDuplicate(layerIndex: number): Promise<void> {
        const state = this.history.getState();
        const sourceState = state.layersState.get(layerIndex);
        if (!sourceState) return;

        let newIndex = -1;
        for (let i = layerIndex + 1; i < 10; i++) {
            if (!state.createdLayers.has(i)) { newIndex = i; break; }
        }
        if (newIndex === -1) {
            for (let i = layerIndex - 1; i >= 0; i--) {
                if (!state.createdLayers.has(i)) { newIndex = i; break; }
            }
        }
        if (newIndex === -1) { alert('Límite de 10 capas alcanzado.'); return; }

        this.eventBus.emit('GLOBAL_INTERRUPTION');

        const groupId = crypto.randomUUID();

        const creEv = this.history.commitLayerAction('LAYER_CREATE', newIndex, {
            layerName: `${sourceState.name} (Copia)`,
            layerOpacity: sourceState.opacity,
            locked: sourceState.locked,
            groupId
        });
        await this.storage.saveEvent(creEv);
        creEv.isSaved = true;

        const sourceStrokes = state.active.filter(ev =>
            !state.hiddenIds.has(ev.id) &&
            (state.layerRoute.get(ev.layerIndex) ?? ev.layerIndex) === layerIndex
        );

        for (const ev of sourceStrokes) {
            let dataToCopy = ev.data;
            if (!dataToCopy) dataToCopy = await this.storage.loadEventData(ev.id);
            if (!dataToCopy) continue;

            const newStrokeId = crypto.randomUUID();
            const cloneEv: TimelineEvent = {
                ...ev,
                id: newStrokeId,
                layerIndex: newIndex,
                timestamp: Date.now(),
                isSaved: false,
                data: dataToCopy,
                groupId
            };
            this.history.push(cloneEv);
            await this.storage.saveEvent(cloneEv);
            cloneEv.isSaved = true;

            const existingMatrix = state.transforms.get(ev.id);
            const isIdentity = !existingMatrix || (existingMatrix.a === 1 && existingMatrix.b === 0 &&
                existingMatrix.c === 0 && existingMatrix.d === 1 &&
                existingMatrix.e === 0 && existingMatrix.f === 0);
            if (!isIdentity) {
                const m = [
                    existingMatrix.a, existingMatrix.b,
                    existingMatrix.c, existingMatrix.d,
                    existingMatrix.e, existingMatrix.f,
                ];
                const transformEv: TimelineEvent = {
                    id: crypto.randomUUID(), type: 'TRANSFORM',
                    toolId: 'system', profileId: 'system',
                    layerIndex: newIndex,
                    color: '', size: 0, opacity: 1,
                    timestamp: Date.now(), data: null,
                    targetIds: [newStrokeId], transformMatrix: m,
                    isSaved: false,
                    groupId
                };
                this.history.push(transformEv);
                await this.storage.saveEvent(transformEv);
                transformEv.isSaved = true;
            }
        }

        const newOrder = [...state.layerOrder];
        const oldPos = newOrder.indexOf(newIndex);
        if (oldPos !== -1) newOrder.splice(oldPos, 1);
        const sourcePos = newOrder.indexOf(layerIndex);
        newOrder.splice(sourcePos + 1, 0, newIndex);

        const reorderEv = this.history.commitLayerAction('LAYER_REORDER', 0, { layerOrder: newOrder, groupId });
        await this.storage.saveEvent(reorderEv);
        reorderEv.isSaved = true;

        this.history.invalidateCache();
        // this.history.rebuildSpatialGrid();

        await this.rebuilder.rebuild(this.activeBrush);
        this.eventBus.emit('SYNC_LAYERS_CSS');
    }

    private _applyBackgroundColor(color: string): void {
        this.engine.transformContainer.style.backgroundColor = color;
    }
}