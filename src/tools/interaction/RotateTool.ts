// src/tools/interaction/RotateTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ToolRegistry } from '../core/ToolRegistry';

export class RotateTool implements ITool {
    public readonly id = 'rotate';
    private ctx: ToolContext;
    private rotating: boolean = false;
    private pivotX: number = 0;
    private pivotY: number = 0;
    private initialMouseAngle: number = 0;
    private initialViewportAngle: number = 0;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.rotating; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'alias';
    }

    public onDeactivate() {
        this.rotating = false;
    }

    public onPointerDown(data: PointerData) {
        this.rotating = true;
        const rect = this.ctx.engine.container.getBoundingClientRect();
        this.pivotX = rect.width / 2;
        this.pivotY = rect.height / 2;

        this.initialMouseAngle = Math.atan2(data.y - this.pivotY, data.x - this.pivotX);
        this.initialViewportAngle = this.ctx.viewport.angle;
        this.ctx.engine.container.style.cursor = 'grabbing';
    }

    public onPointerMove(data: PointerData) {
        if (!this.rotating) return;
        const currentMouseAngle = Math.atan2(data.y - this.pivotY, data.x - this.pivotX);
        const deltaRad = currentMouseAngle - this.initialMouseAngle;
        const deltaDeg = deltaRad * (180 / Math.PI);

        this.ctx.viewport.setAngle(this.initialViewportAngle + deltaDeg, this.pivotX, this.pivotY);
    }

    public onPointerUp(data: PointerData) {
        this.rotating = false;
        this.ctx.engine.container.style.cursor = 'alias';
    }
}

ToolRegistry.register({ id: 'rotate', factory: (ctx) => new RotateTool(ctx), downShortcut: 'r', upShortcut: 'r', isSticky: false });