// src/tools/interaction/LassoTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { BasePoint, PointerData } from '../../input/InputManager';
import { Geometry } from '../../core/math/Geometry';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import { ToolRegistry } from '../core/ToolRegistry';
import { CommandFactory } from '../../history/commands/CommandFactory';

export class LassoTool implements ITool {
    public readonly id = 'lasso';
    private ctx: ToolContext;

    private mode: 'idle' | 'drawing' | 'selected' | 'dragging' = 'idle';
    private polygon: BasePoint[] = [];

    private selectionCanvas: HTMLCanvasElement;
    private dragStartX = 0;
    private dragStartY = 0;

    // Acumuladores de la "Sesión" (Solo ilusión visual, no tocan el historial aún)
    private accTx = 0;
    private accTy = 0;
    private tempTx = 0;
    private tempTy = 0;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.selectionCanvas = document.createElement('canvas');
        this.selectionCanvas.width = ctx.engine.width;
        this.selectionCanvas.height = ctx.engine.height;
    }

    // Mientras el Lazo no sea 'idle', el WorkspaceController ignora los Ctrl+Z globales
    public isBusy() { return this.mode !== 'idle'; }

    public onActivate() {
        this.cancelSelection();
        this.ctx.engine.container.style.cursor = 'crosshair';
        window.addEventListener('keydown', this.handleKeyDown);
    }

    public onDeactivate() {
        this.commitSelection(); // Si cambias al Lápiz, guardamos el movimiento final
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    private handleKeyDown = async (e: KeyboardEvent) => {
        if (this.mode === 'idle') return;

        // Enter = Confirmar movimiento
        if (e.key === 'Enter') {
            e.preventDefault();
            await this.commitSelection();
        }
        // Escape o Ctrl+Z = Abortar misión (Devuelve los trazos a su origen sin ensuciar historial)
        else if (e.key === 'Escape' || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            e.stopPropagation();
            this.cancelSelection();
        }
    };

    // Aborta todo y destruye la selección sin guardar
    private cancelSelection() {
        this.mode = 'idle';
        this.polygon = [];
        this.accTx = 0; this.accTy = 0;
        this.tempTx = 0; this.tempTy = 0;

        this.ctx.selection.clear();
        this.ctx.engine.clearPaintingCanvas();
        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '1';
        document.dispatchEvent(new CustomEvent('DRAWINATION_FORCE_REBUILD'));
    }

    // El ÚNICO momento donde tocamos el HistoryManager
    private async commitSelection() {
        if (this.mode === 'idle') return;

        // Solo guardamos si realmente hubo un movimiento acumulado
        if (this.ctx.selection.hasSelection() && (this.accTx !== 0 || this.accTy !== 0)) {
            const targetIds = Array.from(this.ctx.selection.selectedIds);
            const matrix = [1, 0, 0, 1, this.accTx, this.accTy];

            const event = await this.ctx.history.commitTransform(targetIds, matrix);
            await this.ctx.storage.saveEvent(event);
            event.isSaved = true;
            this.ctx.history.enforceRamLimit();
        }

        this.cancelSelection(); // Limpia la UI y le devuelve los trazos a la capa principal
    }

    public async onPointerDown(data: PointerData) {
        if (this.mode === 'selected' && this.ctx.selection.bbox) {
            const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
            const bbox = this.ctx.selection.bbox;

            // Verificamos si hizo click DENTRO de la grilla desplazada
            const isInside = canvasPos.x >= bbox.minX + this.accTx && canvasPos.x <= bbox.maxX + this.accTx &&
                canvasPos.y >= bbox.minY + this.accTy && canvasPos.y <= bbox.maxY + this.accTy;

            if (isInside) {
                this.mode = 'dragging';
                this.dragStartX = canvasPos.x;
                this.dragStartY = canvasPos.y;
                this.tempTx = 0;
                this.tempTy = 0;
                this.ctx.engine.container.style.cursor = 'move';
                return;
            } else {
                await this.commitSelection(); // Click afuera = Confirmar selección anterior
            }
        }

        // Empezar a dibujar un nuevo lazo
        this.mode = 'drawing';
        this.polygon = [];
        this.accTx = 0; this.accTy = 0;
        this.ctx.selection.clear();

        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        this.polygon.push({ x: canvasPos.x, y: canvasPos.y, pressure: 1 });
        this.ctx.engine.clearPaintingCanvas();
    }

    public onPointerMove(data: PointerData) {
        if (this.mode === 'drawing') {
            const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
            this.polygon.push({ x: canvasPos.x, y: canvasPos.y, pressure: 1 });
            this.drawLassoOutline();
        }
        else if (this.mode === 'dragging') {
            const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
            this.tempTx = canvasPos.x - this.dragStartX;
            this.tempTy = canvasPos.y - this.dragStartY;

            this.updateLiveVisuals();
        }
    }

    public async onPointerUp(data: PointerData) {
        if (this.mode === 'drawing') {
            await this.findSelectedStrokes();

            if (this.ctx.selection.hasSelection()) {
                this.mode = 'selected';

                // 1. Ocultamos los originales y redibujamos
                document.dispatchEvent(new CustomEvent('DRAWINATION_FORCE_REBUILD'));

                // 2. Generamos el fantasma rojo (Solo 1 vez por selección)
                await this.generateSelectionSandbox();

                this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';
                this.updateLiveVisuals();
                this.ctx.engine.container.style.cursor = 'move';
            } else {
                this.cancelSelection();
            }
        }
        else if (this.mode === 'dragging') {
            // === LA CORRECCIÓN ===
            // NO TOCAMOS EL HISTORIAL AQUÍ. Solo consolidamos la ilusión visual.
            this.accTx += this.tempTx;
            this.accTy += this.tempTy;
            this.tempTx = 0;
            this.tempTy = 0;

            this.mode = 'selected';
            this.updateLiveVisuals();
        }
    }

    private updateLiveVisuals() {
        const totalTx = this.accTx + this.tempTx;
        const totalTy = this.accTy + this.tempTy;

        this.ctx.engine.clearPaintingCanvas();

        const pCtx = this.ctx.engine.paintingContext;
        pCtx.save();
        pCtx.translate(totalTx, totalTy);
        pCtx.drawImage(this.selectionCanvas, 0, 0); // Movemos el fantasma rojo entero
        pCtx.restore();

        this.drawConceptsGrid(totalTx, totalTy);
    }

    private drawLassoOutline() {
        const pCtx = this.ctx.engine.paintingContext;
        this.ctx.engine.clearPaintingCanvas();
        if (this.polygon.length < 2) return;

        pCtx.save();
        pCtx.strokeStyle = '#00a8ff';
        pCtx.lineWidth = 2 / this.ctx.viewport.zoom;
        pCtx.setLineDash([5 / this.ctx.viewport.zoom, 5 / this.ctx.viewport.zoom]);
        pCtx.beginPath();
        pCtx.moveTo(this.polygon[0].x, this.polygon[0].y);
        for (let i = 1; i < this.polygon.length; i++) pCtx.lineTo(this.polygon[i].x, this.polygon[i].y);
        pCtx.stroke();
        pCtx.fillStyle = 'rgba(0, 168, 255, 0.1)';
        pCtx.fill();
        pCtx.restore();
    }

    private drawConceptsGrid(dx: number = 0, dy: number = 0) {
        if (!this.ctx.selection.bbox) return;

        const pCtx = this.ctx.engine.paintingContext;
        const zoom = this.ctx.viewport.zoom;
        const bbox = this.ctx.selection.bbox;

        const minX = bbox.minX + dx;
        const minY = bbox.minY + dy;
        const maxX = bbox.maxX + dx;
        const maxY = bbox.maxY + dy;
        const width = this.ctx.engine.width;
        const height = this.ctx.engine.height;

        pCtx.save();
        pCtx.lineWidth = 1 / zoom;

        pCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        pCtx.beginPath();
        pCtx.moveTo(0, minY); pCtx.lineTo(width, minY);
        pCtx.moveTo(0, maxY); pCtx.lineTo(width, maxY);
        pCtx.moveTo(minX, 0); pCtx.lineTo(minX, height);
        pCtx.moveTo(maxX, 0); pCtx.lineTo(maxX, height);
        pCtx.stroke();

        pCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        pCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        const drawHandle = (x: number, y: number) => {
            pCtx.beginPath();
            pCtx.arc(x, y, 4 / zoom, 0, Math.PI * 2);
            pCtx.fillStyle = 'white';
            pCtx.fill();
            pCtx.stroke();
        };
        drawHandle(minX, minY); drawHandle(maxX, minY);
        drawHandle(minX, maxY); drawHandle(maxX, maxY);

        pCtx.restore();
    }

    private async findSelectedStrokes() {
        if (this.polygon.length < 3) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of this.polygon) {
            if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
        }

        const candidates = this.ctx.history.spatialGrid.query({ minX, minY, maxX, maxY });
        const { active, transforms } = this.ctx.history.computeTimelineState();

        const foundIds = new Set<string>();

        for (const eventId of candidates) {
            const event = active.find(ev => ev.id === eventId);
            if (!event || (event.type !== 'STROKE' && event.type !== 'ERASE')) continue;

            if (!event.data) event.data = await this.ctx.storage.loadEventData(eventId);
            if (!event.data) continue;

            const t = transforms.get(eventId) || new DOMMatrix();
            const pts = BinarySerializer.decode(event.data);

            for (const pt of pts) {
                const tx = pt.x * t.a + pt.y * t.c + t.e;
                const ty = pt.x * t.b + pt.y * t.d + t.f;

                if (Geometry.isPointInPolygon(tx, ty, this.polygon)) {
                    foundIds.add(event.id);
                    break;
                }
            }
        }

        if (foundIds.size > 0) {
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
            for (const id of foundIds) {
                const ev = active.find(e => e.id === id);
                const t = transforms.get(id) || new DOMMatrix();
                if (ev && ev.bbox) {
                    if (ev.bbox.minX + t.e < gMinX) gMinX = ev.bbox.minX + t.e;
                    if (ev.bbox.minY + t.f < gMinY) gMinY = ev.bbox.minY + t.f;
                    if (ev.bbox.maxX + t.e > gMaxX) gMaxX = ev.bbox.maxX + t.e;
                    if (ev.bbox.maxY + t.f > gMaxY) gMaxY = ev.bbox.maxY + t.f;
                }
            }
            this.ctx.selection.setSelection(foundIds, { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY });
        }
    }

    private async generateSelectionSandbox() {
        const sCtx = this.selectionCanvas.getContext('2d')!;
        sCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);

        const { active, transforms } = this.ctx.history.computeTimelineState();

        sCtx.save();
        sCtx.lineCap = 'round';
        sCtx.lineJoin = 'round';

        for (const eventId of this.ctx.selection.selectedIds) {
            const ev = active.find(e => e.id === eventId);
            if (!ev || !ev.data) continue;

            const t = transforms.get(eventId) || new DOMMatrix();
            const pts = BinarySerializer.decode(ev.data);
            if (pts.length < 2) continue;

            const cmd = CommandFactory.create(ev, this.ctx.activeBrush);
            cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

            const originalColor = ev.color;
            ev.color = ev.type === 'ERASE' ? '#0096ff' : '#ff3232'; // Azul borrador, Rojo trazo

            cmd.execute(sCtx);

            ev.color = originalColor;
        }
        sCtx.restore();
    }
}

ToolRegistry.register({ id: 'lasso', factory: (ctx) => new LassoTool(ctx), downShortcut: 'l', isSticky: true });