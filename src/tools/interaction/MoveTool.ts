// src/tools/interaction/MoveTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ToolRegistry } from '../core/ToolRegistry';
export class MoveTool implements ITool {
    public readonly id = 'move';
    private ctx: ToolContext;
    private moving = false;
    private startX = 0;
    private startY = 0;
    private snapshot: ImageBitmap | null = null;
    private activeCanvas: HTMLCanvasElement | null = null;

    constructor(ctx: ToolContext) { this.ctx = ctx; }

    public isBusy() { return this.moving; }

    public onActivate() { this.ctx.engine.container.style.cursor = 'move'; }
    public onDeactivate() { this.moving = false; }

    public async onPointerDown(data: PointerData) {
        this.moving = true;
        this.startX = data.x;
        this.startY = data.y;

        this.activeCanvas = this.ctx.engine.getActiveLayerContext().canvas;
        this.snapshot = await createImageBitmap(this.activeCanvas);

        this.activeCanvas.style.opacity = '0';
        this.ctx.engine.paintingContext.drawImage(this.snapshot, 0, 0);
    }

    public onPointerMove(data: PointerData) {
        if (!this.moving || !this.snapshot) return;

        const dx = data.x - this.startX;
        const dy = data.y - this.startY;

        this.ctx.engine.clearPaintingCanvas();
        this.ctx.engine.paintingContext.drawImage(this.snapshot, dx, dy);
    }

    public async onPointerUp(data: PointerData) {
        if (!this.moving || !this.activeCanvas) return;
        this.moving = false;

        const startCanvas = this.ctx.viewport.screenToCanvas(this.startX, this.startY);
        const endCanvas = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const trueDx = endCanvas.x - startCanvas.x;
        const trueDy = endCanvas.y - startCanvas.y;

        if (Math.abs(trueDx) > 0.5 || Math.abs(trueDy) > 0.5) {
            // === SIN PARPADEO: Aplicamos el desplazamiento físicamente en tiempo real ===
            const activeCtx = this.ctx.engine.getActiveLayerContext();

            const temp = document.createElement('canvas');
            temp.width = this.activeCanvas.width;
            temp.height = this.activeCanvas.height;
            temp.getContext('2d')!.drawImage(this.activeCanvas, 0, 0);

            activeCtx.save();
            activeCtx.globalCompositeOperation = 'copy';
            activeCtx.drawImage(temp, trueDx, trueDy);
            activeCtx.restore();

            // Guardamos el evento para que Ctrl+Z y el Timelapse sepan qué pasó
            const event = await this.ctx.history.commitMove(trueDx, trueDy);
            await this.ctx.storage.saveEvent(event);
        }

        // Limpieza de interfaz
        this.ctx.engine.clearPaintingCanvas();
        this.activeCanvas.style.opacity = '1';
        this.snapshot = null;
    }
}

ToolRegistry.register({ id: 'move', factory: (ctx) => new MoveTool(ctx), downShortcut: 'v', isSticky: true });