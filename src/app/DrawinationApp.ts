// src/app/DrawinationApp.ts
import { EventBus } from '../input/EventBus';
import { CanvasEngine } from '../core/engine/CanvasEngine';
import { InputManager } from '../input/InputManager';
import { ShortcutManager } from '../input/ShortcutManager';
import { HistoryManager } from '../history/HistoryManager';
import { StorageManager } from '../storage/StorageManager';
import { TimelapsePlayer } from '../history/TimelapsePlayer';
import { ViewportManager } from '../core/camera/ViewportManager';

// === CAMBIAMOS EL IMPORT ===
import { BrushEngine } from '../core/render/BrushEngine';
import { PencilProfile } from '../core/render/profiles/PencilProfiles';

import { WorkspaceController } from './WorkspaceController';
import { DebugToolbar } from '../ui/debug/DebugToolbar';

export class DrawinationApp {
    public eventBus: EventBus;
    public engine: CanvasEngine;
    public input: InputManager;
    public shortcuts: ShortcutManager;
    public history: HistoryManager;
    public storage: StorageManager;
    public timelapse: TimelapsePlayer;
    public viewport: ViewportManager;

    // === CAMBIAMOS EL TIPO ===
    public activeBrush: BrushEngine;

    public workspace: WorkspaceController;
    public debugUI: DebugToolbar;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`Container #${containerId} not found`);

        this.eventBus = new EventBus();
        this.engine = new CanvasEngine(700, 700);

        this.engine.container.style.backgroundColor = '#ecf0f1';
        this.engine.transformContainer.style.backgroundColor = '#ffffff';
        container.appendChild(this.engine.container);

        this.input = new InputManager(this.engine.container);
        this.shortcuts = new ShortcutManager();
        this.storage = new StorageManager();
        this.history = new HistoryManager(this.engine);
        this.timelapse = new TimelapsePlayer(this.engine, this.storage);
        this.viewport = new ViewportManager(this.engine.transformContainer);

        // === INSTANCIAMOS EL NUEVO MOTOR DE PINCELES CON EL PERFIL DE LÁPIZ ===
        this.activeBrush = new BrushEngine(PencilProfile);
        this.activeBrush.color = '#2980b9'; // Puedes mantener tu color azul por defecto

        this.debugUI = new DebugToolbar(this.eventBus);

        this.workspace = new WorkspaceController(
            this.engine,
            this.input,
            this.shortcuts,
            this.history,
            this.timelapse,
            this.activeBrush,
            this.storage,
            this.viewport,
            this.eventBus
        );
    }
}