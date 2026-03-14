// src/tools/interaction/MoveTool.ts
//
// Mueve visualmente todos los píxeles de la capa activa.
//
// REVERTIDO: eliminado commitTransform() con todos los IDs.
//
// POR QUÉ commitTransform() rompía el borrador:
//   Los trazos ERASE usan destination-out (máscara de borrado).
//   Cuando commitTransform() aplica una traslación [1,0,0,1,dx,dy] a su ID,
//   computeTimelineState() acumula esa matriz en transforms.get(eraseId).
//   En el rebuild, EraseCommand.execute() aplica ctx.transform(matrix) antes de dibujar.
//   Resultado: la máscara de borrado se desplaza, pero el stroke original que borraba
//   sigue en su posición original → el borrado "se descose" visualmente.
//   Este problema no tiene solución limpia con el approach de matriz por trazo.
//
// SOLUCIÓN CORRECTA (Fase 4):
//   Implementar LAYER_MOVE como evento bitmap (mueve el canvas completo,
//   no trazo por trazo). De esa forma los ERASEs mantienen su relación
//   espacial con los STROKEs que borran.
//
// POR AHORA: movimiento visual sin historial. Funcional para uso normal.

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
            const activeCtx = this.ctx.engine.getActiveLayerContext();
            const temp = document.createElement('canvas');
            temp.width = this.activeCanvas.width;
            temp.height = this.activeCanvas.height;
            temp.getContext('2d')!.drawImage(this.activeCanvas, 0, 0);
            activeCtx.save();
            activeCtx.globalCompositeOperation = 'copy';
            activeCtx.drawImage(temp, trueDx, trueDy);
            activeCtx.restore();
        }

        this.ctx.engine.clearPaintingCanvas();
        this.activeCanvas.style.opacity = '1';
        this.snapshot = null;
    }
}

ToolRegistry.register({ id: 'move', factory: (ctx) => new MoveTool(ctx), downShortcut: 'v', isSticky: true });