// src/app/AppContainer.ts
import { CanvasEngine } from '../core/engine/CanvasEngine';
import { EventBus } from '../input/EventBus';
import { StorageManager } from '../storage/StorageManager';
import { CacheManager } from '../history/CacheManager';
import { HistoryManager } from '../history/HistoryManager';
import { InputManager } from '../input/InputManager';
import { ShortcutManager } from '../input/ShortcutManager';
import { ViewportManager } from '../core/camera/ViewportManager';
import { BrushEngine } from '../core/render/BrushEngine';
import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { TimelapsePlayer } from '../history/TimelapsePlayer';
import { SelectionManager } from '../core/selection/SelectionManager';
import { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import { ToolManager } from '../tools/core/ToolManager';
import { WorkspaceController } from './WorkspaceController';

export class AppContainer {
    public eventBus: EventBus;
    public storage: StorageManager;
    public cache: CacheManager;
    public engine: CanvasEngine;
    public viewport: ViewportManager;
    public input: InputManager;
    public shortcuts: ShortcutManager;
    public activeBrush: BrushEngine;
    public history: HistoryManager;
    public timelapse: TimelapsePlayer;
    public selection: SelectionManager;
    public rebuilder: CanvasRebuilder;
    public toolManager: ToolManager;
    public workspaceController: WorkspaceController;

    constructor(containerEl: HTMLElement) {
        this.eventBus = new EventBus();
        this.storage = new StorageManager();
        this.cache = new CacheManager();
        this.shortcuts = new ShortcutManager();
        this.selection = new SelectionManager();

        this.engine = new CanvasEngine(containerEl);

        // === FIX 2: Pasamos this.engine.container en vez de this.engine ===
        this.viewport = new ViewportManager(this.engine.container);
        this.input = new InputManager(this.engine.container);

        this.activeBrush = new BrushEngine(PencilProfile);

        const workerUrl = new URL('../history/CompressionWorker.ts', import.meta.url);
        const worker = new Worker(workerUrl, { type: 'module' });

        this.history = new HistoryManager(this.engine, worker, this.cache);
        this.timelapse = new TimelapsePlayer(this.engine, this.storage);
        this.rebuilder = new CanvasRebuilder(this.engine, this.history, this.storage, this.selection);

        this.toolManager = new ToolManager();

        this.workspaceController = new WorkspaceController(
            this.engine, this.input, this.shortcuts, this.history,
            this.timelapse, this.activeBrush, this.storage,
            this.viewport, this.eventBus, this.selection,
            this.rebuilder, this.toolManager
        );
    }

    public async start() {
        this.toolManager.bootstrap({
            engine: this.engine,
            viewport: this.viewport,
            history: this.history,
            storage: this.storage,
            activeBrush: this.activeBrush,
            eventBus: this.eventBus,
            selection: this.selection
        }, this.shortcuts);

        this.toolManager.setDefaultTool('pencil');

        await this.storage.init();
        const savedTimeline = await this.storage.loadTimeline();
        if (savedTimeline.length > 0) {
            this.history.timeline = savedTimeline;
            this.history.rebuildSpatialGrid();
            await this.rebuilder.rebuild(this.activeBrush);
        }
    }
}