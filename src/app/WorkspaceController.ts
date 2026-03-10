// src/controllers/WorkspaceController.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { TimelapsePlayer } from '../history/TimelapsePlayer';
// === CAMBIAMOS EL IMPORT ===
import type { BrushEngine } from '../core/render/BrushEngine';
import { InkProfile } from '../core/render/profiles/InkProfile';
import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { FillProfile } from '../core/render/profiles/FillProfile';
// import { HardEraserProfile } from '../core/render/profiles/HardEraserProfile';
import type { IBrushProfile } from '../core/render/profiles/IBrushProfile';
import type { StorageManager } from '../storage/StorageManager';
import type { ViewportManager } from '../core/camera/ViewportManager';
import type { EventBus } from '../input/EventBus';
import { BBoxUtils, type BoundingBox } from '../core/math/BoundingBox';
import { BinarySerializer } from '../core/io/BinarySerializer';

// Imports de Herramientas
import { ToolManager } from '../tools/core/ToolManager';
import { PanTool } from '../tools/interaction/PanTool';
import { ZoomTool } from '../tools/interaction/ZoomTool';
import { RotateTool } from '../tools/interaction/RotateTool';
import { PencilTool } from '../tools/draw/PencilTool';
import { EraserTool } from '../tools/draw/EraserTool';
import { HardEraserProfile } from '../core/render/profiles/HardEraserProfile';

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

    // === EL NUEVO GESTOR DE ESTADOS ===
    private toolManager: ToolManager;
    // === NUEVO: Memoria del último perfil de dibujo usado ===
    private lastDrawingProfile: IBrushProfile = PencilProfile;
    constructor(
        engine: CanvasEngine,
        input: InputManager,
        shortcuts: ShortcutManager,
        history: HistoryManager,
        timelapse: TimelapsePlayer,
        activeBrush: BrushEngine,
        storage: StorageManager,
        viewport: ViewportManager,
        eventBus: EventBus
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

        this.toolManager = new ToolManager();
        this.setupTools();

        this.bindEvents();
        this.bindBusEvents();
        this.bootUp();
    }

    private setupTools() {
        const ctx = {
            engine: this.engine,
            viewport: this.viewport,
            history: this.history,
            storage: this.storage,
            activeBrush: this.activeBrush
        };

        this.toolManager.registerTool(new PanTool(ctx));
        this.toolManager.registerTool(new ZoomTool(ctx));
        this.toolManager.registerTool(new RotateTool(ctx));
        this.toolManager.registerTool(new PencilTool(ctx));
        this.toolManager.registerTool(new EraserTool(ctx)); // NUEVA

        this.toolManager.setDefaultTool('pencil');
    }

    private async bootUp() {
        await this.storage.init();
        const savedTimeline = await this.storage.loadTimeline();
        if (savedTimeline.length > 0) {
            this.history.timeline = savedTimeline;
            this.history.rebuildSpatialGrid();
            this.rebuildCanvas();
        }
    }

    private syncUI() {
        this.eventBus.emit('SYNC_UI_SLIDERS', {
            size: this.activeBrush.profile.baseSize,
            opacity: this.activeBrush.profile.baseOpacity
        });
    }

    private async rebuildCanvas(dirtyRegion?: BoundingBox) {
        const ctx = this.engine.getActiveLayerContext();
        const activeCommands = this.history.getActiveCommands(this.activeBrush);

        // BORRADO TOTAL: Adiós bugs de rectángulos y recortes.
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        this.engine.clearActiveLayer();
        ctx.restore();

        // REDIBUJADO RELÁMPAGO
        for (const command of activeCommands) {
            await command.loadDataIfNeeded(this.storage);
            command.execute(ctx);
        }
    }
    private debugDrawPoints() {
        const ctx = this.engine.getActiveLayerContext();
        const activeCommands = this.history.getActiveCommands(this.activeBrush);

        for (const command of activeCommands) {
            const rawData = command.getRawData();
            if (rawData) {
                const pts = BinarySerializer.decode(rawData);
                ctx.fillStyle = 'red';
                for (const pt of pts) {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    private bindEvents() {
        this.shortcuts.onUndo = async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            const dirtyRegion = this.history.applyUndo();
            if (dirtyRegion) {
                await this.rebuildCanvas(dirtyRegion);
                this.storage.saveEvent(this.history.timeline[this.history.timeline.length - 1]);
            }
        };

        this.shortcuts.onRedo = async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            const dirtyRegion = this.history.applyRedo();
            if (dirtyRegion) {
                await this.rebuildCanvas(dirtyRegion);
                this.storage.saveEvent(this.history.timeline[this.history.timeline.length - 1]);
            }
        };

        // === CAMBIO DINÁMICO DE HERRAMIENTAS ===
        this.shortcuts.onSpaceDown = () => this.toolManager.switchTool('pan');
        this.shortcuts.onSpaceUp = () => this.toolManager.revertTool();

        this.shortcuts.onZoomDown = () => this.toolManager.switchTool('zoom');
        this.shortcuts.onZoomUp = () => this.toolManager.revertTool();

        this.shortcuts.onRotateDown = () => this.toolManager.switchTool('rotate');
        this.shortcuts.onRotateUp = () => this.toolManager.revertTool();

        // === RUTA DE INPUT DELEGADA AL STATE ===
        this.input.onWheel = (e, data) => {
            if (this.timelapse.isPlaying) return;
            const isZoom = e.ctrlKey || e.metaKey;
            if (isZoom) {
                const scaleFactor = Math.exp(-e.deltaY * 0.002);
                this.viewport.zoomBy(scaleFactor, data.x, data.y);
            } else {
                this.viewport.pan(-e.deltaX, -e.deltaY);
            }
        };

        this.input.onPointerDown = (data) => {
            if (this.timelapse.isPlaying) return;
            this.toolManager.activeTool.onPointerDown(data);
        };

        this.input.onPointerMove = (data) => {
            if (this.timelapse.isPlaying) return;
            this.toolManager.activeTool.onPointerMove(data);
        };

        this.input.onPointerUp = (data) => {
            if (this.timelapse.isPlaying) return;
            this.toolManager.activeTool.onPointerUp(data);
        };

        // 2. En bindEvents(), conecta las teclas:
        this.shortcuts.onPencil = () => {
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
        };
        this.shortcuts.onEraser = () => {
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
        };

        // 3. En bindBusEvents(), conecta los botones de la UI:
        this.eventBus.on('SET_TOOL_PENCIL', () => {
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
        });

        this.eventBus.on('SET_TOOL_ERASER', () => {
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
        });

        // 2. En bindEvents(), conecta las teclas:
        this.shortcuts.onPencil = () => {
            // Regresamos al pincel, PERO cargamos el perfil que usábamos antes (Tinta o Lápiz)
            this.activeBrush.setProfile(this.lastDrawingProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI(); // Actualizamos los sliders
        };
        this.shortcuts.onEraser = () => {
            // Cambiamos a borrador duro
            this.activeBrush.setProfile(HardEraserProfile);
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
            this.syncUI(); // Actualizamos los sliders
        };
    }

    private bindBusEvents() {
        this.eventBus.on('PLAY_TIMELAPSE', () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            const activeStrokes = this.history.getActiveEvents();
            if (activeStrokes.length > 0) this.timelapse.play(activeStrokes, this.activeBrush, 30);
        });

        this.eventBus.on('DEBUG_DRAW_POINTS', () => {
            this.debugDrawPoints();
        });

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
        });

        this.eventBus.on('SET_TOOL_PENCIL', () => {
            this.activeBrush.setProfile(this.lastDrawingProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        // Seleccionó la herramienta Goma
        this.eventBus.on('SET_TOOL_ERASER', () => {
            this.activeBrush.setProfile(HardEraserProfile);
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
            this.syncUI();
        });

        // Cambió de perfil (Tinta)
        this.eventBus.on('SET_PROFILE_INK', () => {
            this.lastDrawingProfile = InkProfile; // Memorizamos
            this.activeBrush.setProfile(InkProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        // Cambió de perfil (Lápiz)
        this.eventBus.on('SET_PROFILE_PENCIL', () => {
            this.lastDrawingProfile = PencilProfile; // Memorizamos
            this.activeBrush.setProfile(PencilProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        // Sliders
        this.eventBus.on('UPDATE_BRUSH_SIZE', (size: number) => {
            this.activeBrush.profile.baseSize = size;
            this.activeBrush.setProfile(this.activeBrush.profile);
        });

        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity: number) => {
            this.activeBrush.profile.baseOpacity = opacity;
        });

        this.eventBus.on('SET_COLOR', (colorHex: string) => {
            // Le pasamos el color al motor, lo cual regenerará el sello teñido
            this.activeBrush.setColor(colorHex);

            // Si el usuario eligió un color, probablemente quiera volver a dibujar
            // (por si estaba usando el borrador)
            this.activeBrush.setProfile(this.lastDrawingProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });
        this.eventBus.on('SET_PROFILE_FILL', () => {
            this.lastDrawingProfile = FillProfile;
            this.activeBrush.setProfile(FillProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });
    }
}