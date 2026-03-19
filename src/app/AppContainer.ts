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
import { UIRoot } from '../ui/UIRoot';
import '../ui/tokens/design-tokens.css';
import '../ui/tokens/base.css';

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

    constructor(containerEl: HTMLElement) {
        this.engine = new CanvasEngine(1180, 1180);
        this.engine.container.style.backgroundColor = '#ecf0f1';
        this.engine.transformContainer.style.backgroundColor = '#ffffff';
        containerEl.appendChild(this.engine.container);

        this.eventBus = new EventBus();
        this.storage = new StorageManager();
        this.shortcuts = new ShortcutManager();
        this.selection = new SelectionManager();
        this.cache = new CacheManager(this.engine.width, this.engine.height);
        this.checkpoint = new CheckpointManager();
        this.viewport = new ViewportManager(this.engine.transformContainer);
        this.input = new InputManager(this.engine.container);
        this.activeBrush = new BrushEngine(PencilProfile);
        this.activeBrush.color = '#2980b9';

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

        // TimelapseViewer — reemplaza al TimelapsePlayer en el WorkspaceController
        this.timelapseViewer = new TimelapseViewer(
            this.engine,
            this.history,
            this.activeBrush,
            this.storage,
            this.rebuilder,
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