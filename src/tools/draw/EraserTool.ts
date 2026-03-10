// src/tools/draw/EraserTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';

export class EraserTool implements ITool {
    public readonly id = 'eraser';
    private ctx: ToolContext;

    private drawing: boolean = false;
    private currentSmoothedPressure: number = 1;
    private readonly PRESSURE_EMA_ALPHA: number = 0.35;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.drawing; }

    public onActivate() {
        // Cursor de goma de borrar (o una crucecita)
        this.ctx.engine.container.style.cursor = 'cell';
    }

    public onDeactivate() {
        this.drawing = false;
    }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        this.currentSmoothedPressure = data.pressure;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, this.currentSmoothedPressure, data.pointerType);

        // Marcamos en el historial que esto es un 'ERASE'
        this.ctx.history.beginStroke('ERASE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);

        // Dibujamos directo en la capa activa para ver el borrado en vivo
        const activeCtx = this.ctx.engine.getActiveLayerContext();
        activeCtx.globalCompositeOperation = 'destination-out';
        this.ctx.activeBrush.beginStroke(activeCtx, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;

        this.currentSmoothedPressure = this.PRESSURE_EMA_ALPHA * data.pressure + (1 - this.PRESSURE_EMA_ALPHA) * this.currentSmoothedPressure;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, this.currentSmoothedPressure, data.pointerType);

        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);

        const activeCtx = this.ctx.engine.getActiveLayerContext();
        activeCtx.globalCompositeOperation = 'destination-out';
        this.ctx.activeBrush.drawMove(activeCtx, cleanData);
    }

    public async onPointerUp(data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;

        const activeCtx = this.ctx.engine.getActiveLayerContext();
        activeCtx.globalCompositeOperation = 'destination-out';
        this.ctx.activeBrush.endStroke(activeCtx);

        // Devolvemos el contexto a la normalidad
        activeCtx.globalCompositeOperation = 'source-over';

        // OJO: No llamamos a commitPaintingCanvas() porque dibujamos directo en la capa
        await this.ctx.history.commitStroke();
        ObjectPool.reset();
    }
}