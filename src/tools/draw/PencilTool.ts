// src/tools/draw/PencilTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';

export class PencilTool implements ITool {
    public readonly id = 'pencil';
    private ctx: ToolContext;
    private drawing: boolean = false;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.drawing; }

    public onActivate() { this.ctx.engine.container.style.cursor = 'crosshair'; }
    public onDeactivate() { this.drawing = false; }

    public onPointerDown(data: PointerData) {
        this.drawing = true;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);

        // Coordenada cruda y presión cruda. ¡100% fidelidad!
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

    public async onPointerUp(data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;

        if (this.ctx.activeBrush.profile.renderMode === 'fill') {
            this.ctx.engine.clearPaintingCanvas();
        }

        this.ctx.activeBrush.endStroke(this.ctx.engine.paintingContext);
        this.ctx.engine.commitPaintingCanvas();

        const processedEvent = await this.ctx.history.commitStroke();
        if (processedEvent) {
            await this.ctx.storage.saveEvent(processedEvent);
        }

        ObjectPool.reset();
    }
}