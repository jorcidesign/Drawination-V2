// src/tools/draw/EraserTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';

export class EraserTool implements ITool {
    public readonly id = 'eraser';
    private ctx: ToolContext;
    private drawing: boolean = false;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.drawing; }

    public onActivate() { this.ctx.engine.container.style.cursor = 'cell'; }
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

        const activeCtx = this.ctx.engine.getActiveLayerContext();
        this.ctx.activeBrush.endStroke(activeCtx);

        const processedEvent = await this.ctx.history.commitStroke();
        if (processedEvent) {
            await this.ctx.storage.saveEvent(processedEvent);
        }

        ObjectPool.reset();
    }
}