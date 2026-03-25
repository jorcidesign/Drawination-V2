// src/tools/interaction/BackgroundTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import { ToolRegistry } from '../core/ToolRegistry';

export class BackgroundTool implements ITool {
    public readonly id = 'background';
    private ctx: ToolContext;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
    }

    public isBusy() { return false; }

    public onActivate() {
        // Cursor normal mientras editamos el fondo
        this.ctx.engine.container.style.cursor = 'default';
    }

    public onDeactivate() { }
    public onPointerDown() { }
    public onPointerMove() { }
    public onPointerUp() { }
}

// Lo registramos
ToolRegistry.register({ id: 'background', factory: (ctx) => new BackgroundTool(ctx) });