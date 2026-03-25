// src/app/AppContainer.ts
import { CanvasEngine } from '../core/engine/CanvasEngine';
import { EventBus } from '../input/EventBus';
import { StorageManager } from '../storage/StorageManager';
import { CacheManager } from '../history/CacheManager';
import { HistoryManager } from '../history/HistoryManager';
import { CheckpointManager } from '../history/CheckpointManager';
import { InputManager } from '../input/InputManager';
import { ShortcutManager } from '../input/ShortcutManager';
import { ViewportManager } from '../core/camera/ViewportManager';
import { BrushEngine } from '../core/render/BrushEngine';
import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { TimelapseViewer } from '../history/TimelapseViewer';
import { SelectionManager } from '../core/selection/SelectionManager';
import { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import { ToolManager } from '../tools/core/ToolManager';
import { UndoRedoController } from '../history/UndoRedoController';
import { WorkspaceController } from './WorkspaceController';
import { LayerManager } from '../core/engine/LayerManager';
import { NewProjectModal, CANVAS_PRESETS } from '../ui/panels/NewProjectModal';
import '../ui/tokens/design-tokens.css';
import '../ui/tokens/base.css';

const CANVAS_SIZE_KEY = 'drawination_canvas_size';

export const INITIAL_BRUSH_COLOR = '#2280cf';

function getSavedCanvasSize(): { width: number; height: number } {
    try {
        const saved = localStorage.getItem(CANVAS_SIZE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            const validPreset = CANVAS_PRESETS.find(
                p => p.width === parsed.width && p.height === parsed.height
            );
            if (validPreset) return { width: parsed.width, height: parsed.height };
        }
    } catch (_) { }
    return { width: 1180, height: 1180 };
}

function saveCanvasSize(width: number, height: number): void {
    try {
        localStorage.setItem(CANVAS_SIZE_KEY, JSON.stringify({ width, height }));
    } catch (_) { }
}

export class AppContainer {
    public eventBus: EventBus;
    public storage: StorageManager;
    public cache: CacheManager;
    public checkpoint: CheckpointManager;
    public engine: CanvasEngine;
    public viewport: ViewportManager;
    public input: InputManager;
    public shortcuts: ShortcutManager;
    public activeBrush: BrushEngine;
    public history: HistoryManager;
    public timelapseViewer: TimelapseViewer;
    public selection: SelectionManager;
    public rebuilder: CanvasRebuilder;
    public undoRedoController: UndoRedoController;
    public toolManager: ToolManager;
    public workspaceController: WorkspaceController;
    public layerManager: LayerManager;
    public newProjectModal: NewProjectModal;

    constructor(containerEl: HTMLElement) {
        const { width, height } = getSavedCanvasSize();

        this.engine = new CanvasEngine(width, height);
        containerEl.appendChild(this.engine.container);

        this.eventBus = new EventBus();
        this.storage = new StorageManager();
        this.shortcuts = new ShortcutManager();
        this.selection = new SelectionManager();
        this.cache = new CacheManager(width, height);
        this.checkpoint = new CheckpointManager();

        this.viewport = new ViewportManager(this.engine.transformContainer);
        this.viewport.setEventBus(this.eventBus);

        requestAnimationFrame(() => {
            this.viewport.reset(width, height);
        });

        this.input = new InputManager(this.engine.container);
        this.activeBrush = new BrushEngine(PencilProfile);
        this.activeBrush.color = INITIAL_BRUSH_COLOR;

        const workerUrl = new URL('../workers/CompressionWorker.ts', import.meta.url);
        const worker = new Worker(workerUrl, { type: 'module' });

        this.history = new HistoryManager(this.engine, worker, this.cache);
        (this.history as any).eventBus = this.eventBus;

        this.rebuilder = new CanvasRebuilder(
            this.engine,
            this.history,
            this.storage,
            this.selection,
            this.checkpoint,
        );

        this.timelapseViewer = new TimelapseViewer(
            this.engine,
            this.history,
            this.activeBrush,
            this.storage,
            this.rebuilder,
        );

        this.newProjectModal = new NewProjectModal(
            this.eventBus,
            () => this.history.getTimelineSpine().length > 0
        );

        const commandContext = {
            rebuilder: this.rebuilder,
            selection: this.selection,
            eventBus: this.eventBus,
            activeBrush: this.activeBrush,
            engine: this.engine,
        };

        this.undoRedoController = new UndoRedoController(
            this.history,
            this.rebuilder,
            this.activeBrush,
            this.eventBus,
            commandContext,
            this.storage,
        );

        this.layerManager = new LayerManager(this.engine, this.history, this.eventBus);

        this.toolManager = new ToolManager();
        this.toolManager.bootstrap({
            engine: this.engine,
            viewport: this.viewport,
            history: this.history,
            storage: this.storage,
            activeBrush: this.activeBrush,
            eventBus: this.eventBus,
            selection: this.selection,
            rebuilder: this.rebuilder,
            undoRedoController: this.undoRedoController,
        }, this.shortcuts);

        this.toolManager.setDefaultTool('pencil');

        this.workspaceController = new WorkspaceController(
            this.engine,
            this.input,
            this.shortcuts,
            this.history,
            this.timelapseViewer,
            this.activeBrush,
            this.storage,
            this.viewport,
            this.eventBus,
            this.selection,
            this.rebuilder,
            this.toolManager,
            this.undoRedoController,
            this.checkpoint,
            this.newProjectModal,
            saveCanvasSize,
        );
    }

    public async start() {
        await Promise.all([
            this.storage.init(),
            this.checkpoint.init(),
        ]);

        const savedTimeline = await this.storage.loadTimeline();
        if (savedTimeline.length === 0) return;

        this.history.timeline = savedTimeline;
        this.history.rebuildSpatialGrid();

        const { spine } = this.history.getState();

        if (spine.length > 0) {
            const lastSpineEvent = spine[spine.length - 1];

            const checkpointBitmaps = await this.checkpoint.tryRestore(
                lastSpineEvent.id,
                spine.length
            );

            if (checkpointBitmaps) {
                for (const [index, bmp] of checkpointBitmaps.entries()) {
                    this.engine.getLayerContext(index).drawImage(bmp, 0, 0);
                }

                const activeCommands = this.history.getActiveCommands(this.activeBrush);
                if (activeCommands.length > 0) {
                    const lastCmd = activeCommands[activeCommands.length - 1];
                    await this.history.cacheManager.bake(lastCmd.id, this.engine, false);
                }

                this.eventBus.emit('SYNC_LAYERS_CSS');
                console.info(`[AppContainer] ⚡ Checkpoint restaurado. ${spine.length} eventos activos.`);
                return;
            }
        }

        console.info(`[AppContainer] 🔄 Rebuild completo. Timeline: ${savedTimeline.length} eventos.`);
        await this.rebuilder.rebuild(this.activeBrush);
    }
}