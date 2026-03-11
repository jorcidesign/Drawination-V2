// src/tools/interaction/PanTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ToolRegistry } from '../core/ToolRegistry';
export class PanTool implements ITool {
    public readonly id = 'pan';
    private ctx: ToolContext;
    private panning: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.panning; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'grab';
    }

    public onDeactivate() {
        this.panning = false;
    }

    public onPointerDown(data: PointerData) {
        this.panning = true;
        this.lastX = data.x;
        this.lastY = data.y;
        this.ctx.engine.container.style.cursor = 'grabbing';
    }

    public onPointerMove(data: PointerData) {
        if (!this.panning) return;
        const dx = data.x - this.lastX;
        const dy = data.y - this.lastY;
        this.ctx.viewport.pan(dx, dy);
        this.lastX = data.x;
        this.lastY = data.y;
    }

    public onPointerUp(data: PointerData) {
        this.panning = false;
        this.ctx.engine.container.style.cursor = 'grab';
    }
}

ToolRegistry.register({ id: 'pan', factory: (ctx) => new PanTool(ctx), downShortcut: 'space', upShortcut: 'space', isSticky: false });