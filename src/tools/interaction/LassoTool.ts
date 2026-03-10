// src/tools/interaction/LassoTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { BasePoint, PointerData } from '../../input/InputManager';
import { Geometry } from '../../core/math/Geometry';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import { BBoxUtils, type BoundingBox } from '../../core/math/BoundingBox';
import { StrokeCommand } from '../../history/commands/StrokeCommand';
import { EraseCommand } from '../../history/commands/EraseCommand';
import type { ICommand } from '../../history/commands/ICommand';

export class LassoTool implements ITool {
    public readonly id = 'lasso';
    private ctx: ToolContext;

    // Máquina de Estados
    private mode: 'idle' | 'drawing' | 'selected' | 'dragging' = 'idle';
    private polygon: BasePoint[] = [];
    public selectedEventIds: Set<string> = new Set();

    private selectionBbox: BoundingBox | null = null;

    // Canvas temporal para el Preview de 60fps sin lag
    private selectionCanvas: HTMLCanvasElement;

    private dragStartX = 0;
    private dragStartY = 0;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.selectionCanvas = document.createElement('canvas');
        this.selectionCanvas.width = ctx.engine.width;
        this.selectionCanvas.height = ctx.engine.height;
    }

    public isBusy() { return this.mode === 'drawing' || this.mode === 'dragging'; }

    public onActivate() {
        this.resetSelection();
        this.ctx.engine.container.style.cursor = 'crosshair';
    }

    public onDeactivate() {
        this.resetSelection();
    }

    private resetSelection() {
        this.mode = 'idle';
        this.selectedEventIds.clear();
        this.selectionBbox = null;
        this.ctx.engine.clearPaintingCanvas();
        this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '1';
    }

    public onPointerDown(data: PointerData) {
        // Si hay una selección activa, cualquier click inicia el DRAG (Mover)
        if (this.mode === 'selected') {
            this.mode = 'dragging';
            this.dragStartX = data.x;
            this.dragStartY = data.y;

            // Efecto Fantasma: Bajamos opacidad al lienzo original
            this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '0.3';
            this.ctx.engine.container.style.cursor = 'move';
            return;
        }

        // Si no hay nada seleccionado, empezamos a DIBUJAR un lazo nuevo
        this.mode = 'drawing';
        this.polygon = [];
        this.selectedEventIds.clear();

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
            const startCanvas = this.ctx.viewport.screenToCanvas(this.dragStartX, this.dragStartY);
            const currentCanvas = this.ctx.viewport.screenToCanvas(data.x, data.y);
            const dx = currentCanvas.x - startCanvas.x;
            const dy = currentCanvas.y - startCanvas.y;

            // Preview del movimiento (instantáneo)
            this.ctx.engine.clearPaintingCanvas();
            this.ctx.engine.paintingContext.drawImage(this.selectionCanvas, dx, dy);
            this.drawConceptsGrid(dx, dy);
        }
    }

    public async onPointerUp(data: PointerData) {
        if (this.mode === 'drawing') {
            // Cerramos el lazo y ejecutamos el Hit Test Matemático
            await this.findSelectedStrokes();

            if (this.selectedEventIds.size > 0) {
                this.mode = 'selected';
                await this.generateSelectionPreview();
                this.ctx.engine.clearPaintingCanvas();
                this.ctx.engine.paintingContext.drawImage(this.selectionCanvas, 0, 0);
                this.drawConceptsGrid();
                this.ctx.engine.container.style.cursor = 'move';
            } else {
                this.resetSelection();
            }
        }
        else if (this.mode === 'dragging') {
            const startCanvas = this.ctx.viewport.screenToCanvas(this.dragStartX, this.dragStartY);
            const currentCanvas = this.ctx.viewport.screenToCanvas(data.x, data.y);
            const dx = currentCanvas.x - startCanvas.x;
            const dy = currentCanvas.y - startCanvas.y;

            // Restauramos la opacidad del mundo real
            this.ctx.engine.getActiveLayerContext().canvas.style.opacity = '1';

            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                await this.applyVectorMovement(dx, dy);

                // Actualizamos la grilla a su nueva posición
                if (this.selectionBbox) {
                    this.selectionBbox.minX += dx; this.selectionBbox.minY += dy;
                    this.selectionBbox.maxX += dx; this.selectionBbox.maxY += dy;
                }
                await this.generateSelectionPreview();
            }

            this.mode = 'selected';
            this.ctx.engine.clearPaintingCanvas();
            this.ctx.engine.paintingContext.drawImage(this.selectionCanvas, 0, 0);
            this.drawConceptsGrid();
            this.ctx.engine.container.style.cursor = 'move';
        }
    }

    // ==========================================
    // MAGIA VECTORIAL (Opción A de Claude)
    // ==========================================
    private async applyVectorMovement(dx: number, dy: number) {
        const targetIds = Array.from(this.selectedEventIds);

        // Simplemente guardamos en la historia que estos IDs se movieron
        const event = await this.ctx.history.commitTransform(targetIds, dx, dy);
        await this.ctx.storage.saveEvent(event);

        // Actualizamos la grilla y exigimos redibujado
        this.ctx.history.rebuildSpatialGrid();
        document.dispatchEvent(new CustomEvent('DRAWINATION_FORCE_REBUILD'));
    }
    // ==========================================
    // UI Y RENDERIZADO VISUAL
    // ==========================================
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
        if (!this.selectionBbox) return;

        const pCtx = this.ctx.engine.paintingContext;
        const zoom = this.ctx.viewport.zoom;

        const minX = this.selectionBbox.minX + dx;
        const minY = this.selectionBbox.minY + dy;
        const maxX = this.selectionBbox.maxX + dx;
        const maxY = this.selectionBbox.maxY + dy;

        const width = this.ctx.engine.width;
        const height = this.ctx.engine.height;

        pCtx.save();
        pCtx.lineWidth = 1 / zoom;

        // 1. Líneas extensoras grises
        pCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        pCtx.beginPath();
        pCtx.moveTo(0, minY); pCtx.lineTo(width, minY);
        pCtx.moveTo(0, maxY); pCtx.lineTo(width, maxY);
        pCtx.moveTo(minX, 0); pCtx.lineTo(minX, height);
        pCtx.moveTo(maxX, 0); pCtx.lineTo(maxX, height);
        pCtx.stroke();

        // 2. Rectángulo Principal
        pCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        pCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // 3. Círculos en las esquinas (Handles)
        const drawHandle = (x: number, y: number) => {
            pCtx.beginPath();
            pCtx.arc(x, y, 4 / zoom, 0, Math.PI * 2);
            pCtx.fillStyle = 'white';
            pCtx.fill();
            pCtx.stroke();
        };
        drawHandle(minX, minY); drawHandle(maxX, minY);
        drawHandle(minX, maxY); drawHandle(maxX, maxY);

        // 4. Cruz en el centro
        const centerX = minX + (maxX - minX) / 2;
        const centerY = minY + (maxY - minY) / 2;
        const crossSize = 6 / zoom;
        pCtx.beginPath();
        pCtx.moveTo(centerX - crossSize, centerY); pCtx.lineTo(centerX + crossSize, centerY);
        pCtx.moveTo(centerX, centerY - crossSize); pCtx.lineTo(centerX, centerY + crossSize);
        pCtx.stroke();

        pCtx.restore();
    }

    // ==========================================
    // FUNCIONES AUXILIARES DE PROCESAMIENTO
    // ==========================================
    private async findSelectedStrokes() {
        if (this.polygon.length < 3) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of this.polygon) {
            if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
        }

        const candidates = this.ctx.history.spatialGrid.query({ minX, minY, maxX, maxY });
        const activeEvents = this.ctx.history.getActiveEvents();
        const activeIds = new Set(activeEvents.map(ev => ev.id));

        for (const eventId of candidates) {
            if (!activeIds.has(eventId)) continue;

            const event = activeEvents.find(ev => ev.id === eventId);

            // === CAMBIO: ACEPTAMOS STROKES Y ERASES ===
            if (!event || (event.type !== 'STROKE' && event.type !== 'ERASE')) continue;

            if (!event.data) event.data = await this.ctx.storage.loadEventData(eventId);
            if (!event.data) continue;

            const pts = BinarySerializer.decode(event.data);
            for (const pt of pts) {
                if (Geometry.isPointInPolygon(pt.x, pt.y, this.polygon)) {
                    this.selectedEventIds.add(event.id);
                    break;
                }
            }
        }

        // Calcular el Bounding Box global de toda la selección unida
        if (this.selectedEventIds.size > 0) {
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
            for (const id of this.selectedEventIds) {
                const ev = activeEvents.find(e => e.id === id);
                if (ev && ev.bbox) {
                    if (ev.bbox.minX < gMinX) gMinX = ev.bbox.minX;
                    if (ev.bbox.minY < gMinY) gMinY = ev.bbox.minY;
                    if (ev.bbox.maxX > gMaxX) gMaxX = ev.bbox.maxX;
                    if (ev.bbox.maxY > gMaxY) gMaxY = ev.bbox.maxY;
                }
            }
            this.selectionBbox = { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY };
        }
    }

    private async generateSelectionPreview() {
        const pCtx = this.selectionCanvas.getContext('2d')!;
        pCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);

        const activeEvents = this.ctx.history.getActiveEvents();

        pCtx.save();
        pCtx.lineCap = 'round';
        pCtx.lineJoin = 'round';

        for (const eventId of this.selectedEventIds) {
            const event = activeEvents.find(ev => ev.id === eventId);
            if (!event || !event.data) continue;

            const pts = BinarySerializer.decode(event.data);
            if (pts.length < 2) continue;

            // Dibujamos el esqueleto para visualizar la selección
            pCtx.beginPath();
            pCtx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                pCtx.lineTo(pts[i].x, pts[i].y);
            }

            // Grosor adaptativo según el zoom para que siempre se vea bien la selección
            pCtx.lineWidth = 4 / this.ctx.viewport.zoom;

            // === MAGIA DE COLORES ===
            if (event.type === 'ERASE') {
                pCtx.strokeStyle = 'rgba(0, 150, 255, 0.9)'; // Azul brillante para Borradores
            } else {
                pCtx.strokeStyle = 'rgba(255, 50, 50, 0.9)'; // Rojo brillante para Trazos
            }

            pCtx.stroke();
        }
        pCtx.restore();
    }
}