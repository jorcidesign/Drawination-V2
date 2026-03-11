// src/app/WorkspaceController.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { TimelapsePlayer } from '../history/TimelapsePlayer';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { ViewportManager } from '../core/camera/ViewportManager';
import type { EventBus } from '../input/EventBus';
import type { ToolManager } from '../tools/core/ToolManager';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import type { SelectionManager } from '../core/selection/SelectionManager';

export class WorkspaceController {
    // === FIX 1: Declaración explícita para respetar erasableSyntaxOnly ===
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

    constructor(
        engine: CanvasEngine, input: InputManager, shortcuts: ShortcutManager,
        history: HistoryManager, timelapse: TimelapsePlayer, activeBrush: BrushEngine,
        storage: StorageManager, viewport: ViewportManager, eventBus: EventBus,
        selection: SelectionManager, rebuilder: CanvasRebuilder, toolManager: ToolManager
    ) {
        // Asignación clásica
        this.engine = engine; this.input = input; this.shortcuts = shortcuts;
        this.history = history; this.timelapse = timelapse; this.activeBrush = activeBrush;
        this.storage = storage; this.viewport = viewport; this.eventBus = eventBus;
        this.selection = selection; this.rebuilder = rebuilder; this.toolManager = toolManager;

        this.bindEvents();
        this.bindBusEvents();
    }

    private bindEvents() {
        this.shortcuts.bindDown('ctrl+z', async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            this.selection.clear(); // Limpiamos selección activa por seguridad
            if (this.history.applyUndo()) {
                this.history.rebuildSpatialGrid();
                await this.rebuilder.rebuild(this.activeBrush);
                const event = this.history.timeline[this.history.timeline.length - 1];
                await this.storage.saveEvent(event);
                event.isSaved = true;
                this.history.enforceRamLimit();
            }
        });

        const redoHandler = async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            this.selection.clear(); // Limpiamos selección activa por seguridad
            if (this.history.applyRedo()) {
                this.history.rebuildSpatialGrid();
                await this.rebuilder.rebuild(this.activeBrush);
                const event = this.history.timeline[this.history.timeline.length - 1];
                await this.storage.saveEvent(event);
                event.isSaved = true;
                this.history.enforceRamLimit();
            }
        };
        this.shortcuts.bindDown('ctrl+y', redoHandler);
        this.shortcuts.bindDown('ctrl+shift+z', redoHandler);

        let isPickingColor = false;
        this.shortcuts.bindDown('alt', (e) => {
            if (!e.repeat) {
                if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
                isPickingColor = true;
                this.engine.container.style.cursor = 'crosshair';
            }
        });
        this.shortcuts.bindUp('alt', () => {
            isPickingColor = false;
            this.toolManager.activeTool.onActivate();
        });

        this.shortcuts.bindDown('h', () => this.eventBus.emit('FLIP_HORIZONTAL'));
        this.shortcuts.bindDown('escape', () => {
            if (this.toolManager.activeTool.id === 'lasso') this.toolManager.revertTool();
        });

        this.input.onWheel = (e, data) => {
            if (this.timelapse.isPlaying) return;
            if (e.ctrlKey || e.metaKey) {
                this.viewport.zoomBy(Math.exp(-e.deltaY * 0.002), data.x, data.y);
            } else {
                this.viewport.pan(-e.deltaX, -e.deltaY);
            }
        };

        this.input.onPointerDown = (data) => {
            if (this.timelapse.isPlaying) return;
            if (isPickingColor) {
                const canvasPos = this.viewport.screenToCanvas(data.x, data.y);
                const activeCtx = this.engine.getActiveLayerContext();
                const pixel = activeCtx.getImageData(canvasPos.x, canvasPos.y, 1, 1).data;
                if (pixel[3] > 0) {
                    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
                    this.eventBus.emit('SET_COLOR', hex);
                }
                return;
            }
            this.toolManager.activeTool.onPointerDown(data);
        };

        this.input.onPointerMove = (data) => {
            if (!this.timelapse.isPlaying && !isPickingColor) this.toolManager.activeTool.onPointerMove(data);
        };
        this.input.onPointerUp = (data) => {
            if (!this.timelapse.isPlaying && !isPickingColor) this.toolManager.activeTool.onPointerUp(data);
        };
    }

    private bindBusEvents() {
        document.addEventListener('DRAWINATION_FORCE_REBUILD', () => this.rebuilder.rebuild(this.activeBrush));

        this.eventBus.on('PLAY_TIMELAPSE', () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            const spine = this.history.getTimelineSpine();
            if (spine.length > 0) this.timelapse.play(spine, this.activeBrush, 30);
        });

        this.eventBus.on('DEBUG_DRAW_POINTS', () => this.rebuilder.debugDrawPoints(this.activeBrush));

        this.eventBus.on('RESET_ROTATION', () => {
            if (this.toolManager.activeTool.isBusy()) return;
            const rect = this.engine.container.getBoundingClientRect();
            this.viewport.setAngle(0, rect.width / 2, rect.height / 2);
        });

        this.eventBus.on('CLEAR_ALL', async () => {
            if (this.toolManager.activeTool.isBusy()) return;
            await this.storage.clearAll();
            this.history.timeline = [];
            this.history.spatialGrid.clear();
            this.engine.clearActiveLayer();
            this.history.cacheManager.clearAll();
            this.selection.clear();
        });

        this.eventBus.on('UPDATE_BRUSH_SIZE', (size: number) => {
            this.activeBrush.profile.baseSize = size;
            this.activeBrush.setProfile(this.activeBrush.profile);
        });
        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity: number) => {
            this.activeBrush.profile.baseOpacity = opacity;
            this.activeBrush.setProfile(this.activeBrush.profile);
        });

        this.eventBus.on('FLIP_HORIZONTAL', () => {
            if (this.toolManager.activeTool.isBusy()) return;
            const rect = this.engine.container.getBoundingClientRect();
            this.viewport.flipHorizontal(rect.width / 2, rect.height / 2);
        });
    }
}