// src/tools/draw/PencilTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';

export class PencilTool implements ITool {
    public readonly id = 'pencil';
    private ctx: ToolContext;

    private drawing: boolean = false;
    private currentSmoothedPressure: number = 1;
    private readonly PRESSURE_EMA_ALPHA: number = 0.35;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.drawing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'crosshair';
    }

    public onDeactivate() {
        this.drawing = false;
    }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        this.currentSmoothedPressure = data.pressure;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, this.currentSmoothedPressure, data.pointerType);

        this.ctx.history.beginStroke('STROKE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);
        this.ctx.activeBrush.beginStroke(this.ctx.engine.paintingContext, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;

        this.currentSmoothedPressure = this.PRESSURE_EMA_ALPHA * data.pressure + (1 - this.PRESSURE_EMA_ALPHA) * this.currentSmoothedPressure;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, this.currentSmoothedPressure, data.pointerType);

        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);
        this.ctx.activeBrush.drawMove(this.ctx.engine.paintingContext, cleanData, true);
    }

    public async onPointerUp(data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;

        this.ctx.activeBrush.endStroke(this.ctx.engine.paintingContext);
        this.ctx.engine.commitPaintingCanvas();

        const processedEvent = await this.ctx.history.commitStroke();

        if (processedEvent) {
            const compressedBytes = await this.ctx.storage.saveEvent(processedEvent);
            const rawBytes = processedEvent.data?.byteLength || 0;
            const ratio = (100 - (compressedBytes / rawBytes) * 100).toFixed(1);
            console.log(`👷 Worker + Hashing: ${rawBytes}B -> ${compressedBytes}B (-${ratio}%)`);
        }

        ObjectPool.reset();
    }
}