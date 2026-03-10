// src/app/WorkspaceController.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { InputManager } from '../input/InputManager';
import type { ShortcutManager } from '../input/ShortcutManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { TimelapsePlayer } from '../history/TimelapsePlayer';
import type { BrushEngine } from '../core/render/BrushEngine';
import { InkProfile } from '../core/render/profiles/InkProfile';
import { PencilProfile } from '../core/render/profiles/PencilProfiles';
import { FillProfile } from '../core/render/profiles/FillProfile';
import type { IBrushProfile } from '../core/render/profiles/IBrushProfile';
import type { StorageManager } from '../storage/StorageManager';
import type { ViewportManager } from '../core/camera/ViewportManager';
import type { EventBus } from '../input/EventBus';
import { BinarySerializer } from '../core/io/BinarySerializer';

import { ToolManager } from '../tools/core/ToolManager';
import { PanTool } from '../tools/interaction/PanTool';
import { ZoomTool } from '../tools/interaction/ZoomTool';
import { RotateTool } from '../tools/interaction/RotateTool';
import { PencilTool } from '../tools/draw/PencilTool';
import { EraserTool } from '../tools/draw/EraserTool';
import { HardEraserProfile } from '../core/render/profiles/HardEraserProfile';
import { MoveTool } from '../tools/interaction/MoveTool'; // <--- IMPORTACIÓN DE MOVER
import { LassoTool } from '../tools/interaction/LassoTool';

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

    private isRebuilding = false;
    private toolManager: ToolManager;
    private lastDrawingProfile: IBrushProfile = PencilProfile;

    constructor(
        engine: CanvasEngine, input: InputManager, shortcuts: ShortcutManager,
        history: HistoryManager, timelapse: TimelapsePlayer, activeBrush: BrushEngine,
        storage: StorageManager, viewport: ViewportManager, eventBus: EventBus
    ) {
        this.engine = engine; this.input = input; this.shortcuts = shortcuts;
        this.history = history; this.timelapse = timelapse; this.activeBrush = activeBrush;
        this.storage = storage; this.viewport = viewport; this.eventBus = eventBus;

        this.toolManager = new ToolManager();
        this.setupTools();
        this.bindEvents();
        this.bindBusEvents();
        this.bootUp();
    }

    private setupTools() {
        const ctx = {
            engine: this.engine, viewport: this.viewport, history: this.history,
            storage: this.storage, activeBrush: this.activeBrush
        };

        this.toolManager.registerTool(new PanTool(ctx));
        this.toolManager.registerTool(new ZoomTool(ctx));
        this.toolManager.registerTool(new RotateTool(ctx));
        this.toolManager.registerTool(new PencilTool(ctx));
        this.toolManager.registerTool(new EraserTool(ctx));
        this.toolManager.registerTool(new MoveTool(ctx)); // <--- REGISTRAR MOVER
        this.toolManager.registerTool(new LassoTool(ctx));
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
            size: this.activeBrush.profile.baseSize, opacity: this.activeBrush.profile.baseOpacity
        });
    }

    private async rebuildCanvas() {
        if (this.isRebuilding) return;
        this.isRebuilding = true;

        try {
            const ctx = this.engine.getActiveLayerContext();
            const activeCommands = this.history.getActiveCommands(this.activeBrush);

            let snapshot: ImageBitmap | null = null;
            let startIndex = 0;

            for (let i = activeCommands.length - 1; i >= 0; i--) {
                snapshot = await this.history.cacheManager.getSnapshot(activeCommands[i].id);
                if (snapshot) {
                    startIndex = i + 1;
                    break;
                }
            }

            for (let i = startIndex; i < activeCommands.length; i++) {
                await activeCommands[i].loadDataIfNeeded(this.storage);
            }

            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            this.engine.clearActiveLayer();
            ctx.restore();

            if (snapshot) ctx.drawImage(snapshot, 0, 0);

            // En WorkspaceController.ts, dentro de rebuildCanvas():
            for (let i = startIndex; i < activeCommands.length; i++) {
                const command = activeCommands[i];

                // ACTUALIZADO: ERASE y MOVE actúan sobre la capa final
                if (command.type === 'ERASE' || command.type === 'MOVE') {
                    command.execute(ctx);
                } else {
                    this.engine.clearPaintingCanvas();
                    command.execute(this.engine.paintingContext);
                    this.engine.commitPaintingCanvas();
                }
            }
        } finally {
            this.isRebuilding = false;
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
            const undoneBbox = this.history.applyUndo();
            if (undoneBbox) {
                await this.rebuildCanvas();
                this.storage.saveEvent(this.history.timeline[this.history.timeline.length - 1]);
            }
        };

        this.shortcuts.onRedo = async () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            const redoneBbox = this.history.applyRedo();
            if (redoneBbox) {
                await this.rebuildCanvas();
                this.storage.saveEvent(this.history.timeline[this.history.timeline.length - 1]);
            }
        };

        this.shortcuts.onSpaceDown = () => this.toolManager.switchTool('pan');
        this.shortcuts.onSpaceUp = () => this.toolManager.revertTool();

        this.shortcuts.onZoomDown = () => this.toolManager.switchTool('zoom');
        this.shortcuts.onZoomUp = () => this.toolManager.revertTool();

        this.shortcuts.onRotateDown = () => this.toolManager.switchTool('rotate');
        this.shortcuts.onRotateUp = () => this.toolManager.revertTool();

        let isPickingColor = false;

        this.shortcuts.onAltDown = () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            isPickingColor = true;
            this.engine.container.style.cursor = 'crosshair';
        };

        this.shortcuts.onAltUp = () => {
            isPickingColor = false;
            this.toolManager.activeTool.onActivate();
        };

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

        const originalPointerDown = this.input.onPointerDown;

        this.input.onPointerDown = (data) => {
            if (this.timelapse.isPlaying) return;

            if (isPickingColor) {
                const canvasPos = this.viewport.screenToCanvas(data.x, data.y);
                const activeCtx = this.engine.getActiveLayerContext();
                const pixel = activeCtx.getImageData(canvasPos.x, canvasPos.y, 1, 1).data;

                if (pixel[3] > 0) {
                    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => {
                        const h = x.toString(16);
                        return h.length === 1 ? '0' + h : h;
                    }).join('');

                    this.eventBus.emit('SET_COLOR', hex);
                    console.log(`🎨 Color robado: ${hex}`);
                }
                return;
            }

            this.toolManager.activeTool.onPointerDown(data);
        };

        this.input.onPointerMove = (data) => {
            if (this.timelapse.isPlaying || isPickingColor) return;
            this.toolManager.activeTool.onPointerMove(data);
        };

        this.input.onPointerUp = (data) => {
            if (this.timelapse.isPlaying || isPickingColor) return;
            this.toolManager.activeTool.onPointerUp(data);
        };

        this.shortcuts.onPencil = () => {
            this.activeBrush.setProfile(this.lastDrawingProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        };

        this.shortcuts.onEraser = () => {
            this.activeBrush.setProfile(HardEraserProfile);
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
            this.syncUI();
        };

        this.shortcuts.onFlipHorizontal = () => {
            this.eventBus.emit('FLIP_HORIZONTAL');
        };

        // === TECLA V PARA MOVER ===
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
                this.toolManager.switchTool('move');
                this.toolManager.setDefaultTool('move');
            }
        });

        // window.addEventListener('keydown', (e) => {
        //     if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        //         this.toolManager.switchTool('lasso');
        //         this.toolManager.setDefaultTool('lasso');
        //     }
        // });

        this.shortcuts.onEscape = () => {
            if (this.toolManager.activeTool.id === 'lasso') {
                this.toolManager.revertTool(); // Sale del lazo y limpia la pantalla
            }
        };

        // === TECLA L (LAZO MAGICO) ===
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
                this.toolManager.switchTool('lasso');
                this.toolManager.setDefaultTool('lasso');
            }
        });
    }

    private bindBusEvents() {
        // === ESCUCHAR EVENTO DESDE LA HERRAMIENTA MOVE ===
        // document.addEventListener('DRAWINATION_FORCE_REBUILD', () => {
        //     this.rebuildCanvas();
        // });

        document.addEventListener('DRAWINATION_FORCE_REBUILD', () => {
            this.rebuildCanvas();
        });

        this.eventBus.on('PLAY_TIMELAPSE', () => {
            if (this.timelapse.isPlaying || this.toolManager.activeTool.isBusy()) return;
            // AHORA MANDAMOS LA ESPINA COMPLETA (Trazos + Transformaciones)
            const spine = this.history.getTimelineSpine();
            if (spine.length > 0) this.timelapse.play(spine, this.activeBrush, 30);
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
            this.history.cacheManager.clearAll();
        });

        this.eventBus.on('SET_TOOL_PENCIL', () => {
            this.activeBrush.setProfile(this.lastDrawingProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        this.eventBus.on('SET_TOOL_ERASER', () => {
            this.activeBrush.setProfile(HardEraserProfile);
            this.toolManager.switchTool('eraser');
            this.toolManager.setDefaultTool('eraser');
            this.syncUI();
        });

        this.eventBus.on('SET_PROFILE_INK', () => {
            this.lastDrawingProfile = InkProfile;
            this.activeBrush.setProfile(InkProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        this.eventBus.on('SET_PROFILE_PENCIL', () => {
            this.lastDrawingProfile = PencilProfile;
            this.activeBrush.setProfile(PencilProfile);
            this.toolManager.switchTool('pencil');
            this.toolManager.setDefaultTool('pencil');
            this.syncUI();
        });

        this.eventBus.on('UPDATE_BRUSH_SIZE', (size: number) => {
            this.activeBrush.profile.baseSize = size;
            this.activeBrush.setProfile(this.activeBrush.profile);
        });

        this.eventBus.on('UPDATE_BRUSH_OPACITY', (opacity: number) => {
            this.activeBrush.profile.baseOpacity = opacity;
        });

        this.eventBus.on('SET_COLOR', (colorHex: string) => {
            this.activeBrush.setColor(colorHex);
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

        this.eventBus.on('FLIP_HORIZONTAL', () => {
            if (this.toolManager.activeTool.isBusy()) return;
            const rect = this.engine.container.getBoundingClientRect();
            this.viewport.flipHorizontal(rect.width / 2, rect.height / 2);
        });
    }
}