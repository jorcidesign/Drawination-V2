// src/tools/draw/EraserTool.ts
//
// CAMBIO vs versión anterior:
// Integra StrokeStabilizer — mismo tratamiento que PencilTool.
// El borrador también se beneficia del suavizado de coordenadas.

import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';
import { ToolRegistry } from '../core/ToolRegistry';
import { HardEraserProfile } from '../../core/render/profiles/HardEraserProfile';
import { StrokeStabilizer } from '../../core/input/StrokeStabilizer';

declare module '../../input/EventBus' {
    interface AppEventMap {
        'SET_TOOL_ERASER': void;
    }
}

export class EraserTool implements ITool {
    public readonly id = 'eraser';
    private ctx: ToolContext;
    private drawing: boolean = false;

    private stabilizer: StrokeStabilizer = new StrokeStabilizer();

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.ctx.eventBus.on('SET_TOOL_ERASER', () => {
            this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
        });
    }

    public isBusy() { return this.drawing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'cell';
        this.ctx.activeBrush.useProfile(HardEraserProfile);
        this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
            size: this.ctx.activeBrush.profile.baseSize,
            opacity: this.ctx.activeBrush.profile.baseOpacity,
            minSize: this.ctx.activeBrush.profile.minSize || 1,
            maxSize: this.ctx.activeBrush.profile.maxSize || 100
        });
    }

    public onDeactivate() { this.drawing = false; }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        this.stabilizer.reset();

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const filtered = this.stabilizer.filter2D(
            canvasPos.x, canvasPos.y,
            this.ctx.viewport.zoom,
            performance.now()
        );

        const cleanData = ObjectPool.getPointerData(filtered.x, filtered.y, data.pressure, data.pointerType);
        this.ctx.history.beginStroke('ERASE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);
        const activeCtx = this.ctx.engine.getActiveLayerContext();
        this.ctx.activeBrush.beginStroke(activeCtx, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const filtered = this.stabilizer.filter2D(
            canvasPos.x, canvasPos.y,
            this.ctx.viewport.zoom,
            performance.now()
        );

        const cleanData = ObjectPool.getPointerData(filtered.x, filtered.y, data.pressure, data.pointerType);
        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);
        const activeCtx = this.ctx.engine.getActiveLayerContext();
        this.ctx.activeBrush.drawMove(activeCtx, cleanData);
    }

    public async onPointerUp(data: PointerData) {
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

ToolRegistry.register({ id: 'eraser', factory: (ctx) => new EraserTool(ctx), downShortcut: 'e', isSticky: true });