// src/tools/interaction/ZoomTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ToolRegistry } from '../core/ToolRegistry';

export class ZoomTool implements ITool {
    public readonly id = 'zoom';
    private ctx: ToolContext;
    private zooming: boolean = false;
    private lastX: number = 0;
    private anchorX: number = 0;
    private anchorY: number = 0;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.zooming; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'zoom-in';
    }

    public onDeactivate() {
        this.zooming = false;
    }

    public onPointerDown(data: PointerData) {
        this.zooming = true;
        this.lastX = data.x;
        this.anchorX = data.x;
        this.anchorY = data.y;
        this.ctx.engine.container.style.cursor = 'ew-resize';
    }

    public onPointerMove(data: PointerData) {
        if (!this.zooming) return;
        const dx = data.x - this.lastX;
        const scaleFactor = Math.exp(dx * 0.005);
        this.ctx.viewport.zoomBy(scaleFactor, this.anchorX, this.anchorY);
        this.lastX = data.x;
    }

    public onPointerUp(_data: PointerData) {
        this.zooming = false;
        this.ctx.engine.container.style.cursor = 'zoom-in';
    }
}

ToolRegistry.register({ id: 'zoom', factory: (ctx) => new ZoomTool(ctx), downShortcut: 'z', upShortcut: 'z', isSticky: false });