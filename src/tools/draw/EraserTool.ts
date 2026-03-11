// src/tools/draw/EraserTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';
import { ToolRegistry } from '../core/ToolRegistry';
import { HardEraserProfile } from '../../core/render/profiles/HardEraserProfile';

// === DECLARATION MERGING: El Borrador inyecta su evento al bus global ===
declare module '../../input/EventBus' {
    interface AppEventMap {
        'SET_TOOL_ERASER': void;
    }
}

export class EraserTool implements ITool {
    public readonly id = 'eraser';
    private ctx: ToolContext;
    private drawing: boolean = false;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;

        this.ctx.eventBus.on('SET_TOOL_ERASER', () => {
            this.ctx.activeBrush.setProfile(HardEraserProfile);
            this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
            this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
                size: HardEraserProfile.baseSize,
                opacity: HardEraserProfile.baseOpacity
            });
        });
    }

    public isBusy() { return this.drawing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'cell';
        this.ctx.activeBrush.setProfile(HardEraserProfile);
        this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
            size: this.ctx.activeBrush.profile.baseSize,
            opacity: this.ctx.activeBrush.profile.baseOpacity
        });
    }

    public onDeactivate() { this.drawing = false; }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.beginStroke('ERASE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);
        const activeCtx = this.ctx.engine.getActiveLayerContext();
        this.ctx.activeBrush.beginStroke(activeCtx, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);
        const activeCtx = this.ctx.engine.getActiveLayerContext();
        this.ctx.activeBrush.drawMove(activeCtx, cleanData);
    }

    public async onPointerUp(data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;
        if (this.ctx.activeBrush.profile.renderMode === 'fill') this.ctx.engine.clearPaintingCanvas();
        this.ctx.activeBrush.endStroke(this.ctx.engine.paintingContext);
        this.ctx.engine.commitPaintingCanvas();

        const processedEvent = await this.ctx.history.commitStroke();
        if (processedEvent) {
            // Esperamos que se guarde en IndexedDB
            await this.ctx.storage.saveEvent(processedEvent);
            // Avisamos que ya es seguro y limpiamos la RAM
            processedEvent.isSaved = true;
            this.ctx.history.enforceRamLimit();
        }
        ObjectPool.reset();
    }
}

ToolRegistry.register({ id: 'eraser', factory: (ctx) => new EraserTool(ctx), downShortcut: 'e', isSticky: true });