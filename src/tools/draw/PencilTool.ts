// src/tools/draw/PencilTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';
import { ToolRegistry } from '../core/ToolRegistry';

declare module '../../input/EventBus' {
    interface AppEventMap {
        'SET_TOOL_PENCIL': void;
    }
}

export class PencilTool implements ITool {
    public readonly id = 'pencil';
    private ctx: ToolContext;
    private drawing: boolean = false;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;

        this.ctx.eventBus.on('SET_TOOL_PENCIL', () => {
            this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
        });
    }

    public isBusy() { return this.drawing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'crosshair';

        this.ctx.activeBrush.useProfile(this.ctx.activeBrush.lastDrawingProfile);

        this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
            size: this.ctx.activeBrush.profile.baseSize,
            opacity: this.ctx.activeBrush.profile.baseOpacity,
            minSize: this.ctx.activeBrush.profile.minSize || 1,
            maxSize: this.ctx.activeBrush.profile.maxSize || 100,
            profileId: this.ctx.activeBrush.profile.id // <--- FIX: Envía el profileId
        });
    }

    public onDeactivate() { this.drawing = false; }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.beginStroke('STROKE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);
        this.ctx.activeBrush.beginStroke(this.ctx.engine.paintingContext, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);
        this.ctx.activeBrush.drawMove(this.ctx.engine.paintingContext, cleanData, true);
    }

    public async onPointerUp(_data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;
        if (this.ctx.activeBrush.profile.renderer === 'fill') this.ctx.engine.clearPaintingCanvas();
        this.ctx.activeBrush.endStroke(this.ctx.engine.paintingContext);
        this.ctx.engine.commitPaintingCanvas();

        const event = await this.ctx.history.commitStroke();
        if (event) {
            await this.ctx.storage.saveEvent(event);
            event.isSaved = true;
            this.ctx.history.enforceRamLimit();
        }
        ObjectPool.reset();
    }
}

ToolRegistry.register({ id: 'pencil', factory: (ctx) => new PencilTool(ctx), downShortcut: 'b', isSticky: true });