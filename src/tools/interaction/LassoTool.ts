// src/tools/interaction/LassoTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { BasePoint, PointerData } from '../../input/InputManager';
import { Geometry } from '../../core/math/Geometry';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import { ToolRegistry } from '../core/ToolRegistry';
import { DiagnosticsService } from '../../history/DiagnosticsService';

declare module '../../input/EventBus' {
    interface AppEventMap {
        'TOGGLE_LASSO_MODE': 'partial' | 'total';
    }
}

export class LassoTool implements ITool {
    public readonly id = 'lasso';
    private ctx: ToolContext;
    private mode: 'idle' | 'drawing' = 'idle';
    private polygon: BasePoint[] = [];
    private selectionMode: 'partial' | 'total' = 'partial';

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.ctx.eventBus.on('TOGGLE_LASSO_MODE', (mode) => {
            this.selectionMode = mode;
        });
    }

    public isBusy() { return this.mode === 'drawing'; }

    public onActivate() {
        this.mode = 'idle';
        this.polygon = [];
        this.ctx.selection.clear();
        this.ctx.engine.container.style.cursor = 'crosshair';
    }

    public onDeactivate() {
        this.mode = 'idle';
        this.polygon = [];
        this.ctx.engine.clearPaintingCanvas();
    }

    public onPointerDown(data: PointerData) {
        this.mode = 'drawing';
        this.polygon = [];
        this.ctx.selection.clear();
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        this.polygon.push({ x: canvasPos.x, y: canvasPos.y, pressure: 1 });
        this.ctx.engine.clearPaintingCanvas();
    }

    public onPointerMove(data: PointerData) {
        if (this.mode !== 'drawing') return;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        this.polygon.push({ x: canvasPos.x, y: canvasPos.y, pressure: 1 });
        this.drawLassoOutline();
    }

    public async onPointerUp(_data: PointerData) {
        if (this.mode !== 'drawing') return;
        this.mode = 'idle';
        this.ctx.engine.clearPaintingCanvas();

        await this.findSelectedStrokes();
        DiagnosticsService.logSelection(this.ctx.selection.selectedIds.size);

        if (this.ctx.selection.hasSelection()) {
            this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', 'transform-handle');
        }
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

    private async findSelectedStrokes() {
        if (this.polygon.length < 3) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of this.polygon) {
            if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
        }

        const candidates = this.ctx.history.spatialGrid.query({ minX, minY, maxX, maxY });
        const state = this.ctx.history.getState();
        const foundIds = new Set<string>();

        // 🛡️ EL ESCUDO: Si la capa está bloqueada, el Lazo no selecciona nada en ella.
        if (state.layersState.get(state.derivedActiveLayerIndex)?.locked) {
            console.info("🔒 Capa bloqueada. Selección con lazo ignorada.");
            return;
        }

        for (const eventId of candidates) {
            if (state.hiddenIds.has(eventId)) continue;
            const event = state.active.find(ev => ev.id === eventId);
            if (!event || (event.type !== 'STROKE' && event.type !== 'ERASE')) continue;

            // Solo seleccionamos los trazos que pertenecen a la capa activa real o redirigida
            const routedLayer = state.layerRoute.get(event.layerIndex) ?? event.layerIndex;
            if (routedLayer !== state.derivedActiveLayerIndex) continue;

            if (!event.data) event.data = await this.ctx.storage.loadEventData(eventId);
            if (!event.data) continue;

            const t = state.transforms.get(eventId) ?? new DOMMatrix();
            const pts = BinarySerializer.decode(event.data);

            let hit = false;
            if (this.selectionMode === 'partial') {
                for (const pt of pts) {
                    const tx = pt.x * t.a + pt.y * t.c + t.e;
                    const ty = pt.x * t.b + pt.y * t.d + t.f;
                    if (Geometry.isPointInPolygon(tx, ty, this.polygon)) { hit = true; break; }
                }
            } else {
                hit = pts.length > 0;
                for (const pt of pts) {
                    const tx = pt.x * t.a + pt.y * t.c + t.e;
                    const ty = pt.x * t.b + pt.y * t.d + t.f;
                    if (!Geometry.isPointInPolygon(tx, ty, this.polygon)) { hit = false; break; }
                }
            }

            if (hit) foundIds.add(event.id);
        }

        if (foundIds.size > 0) {
            const bbox = this.ctx.history.getBboxForIds(Array.from(foundIds));
            if (bbox) this.ctx.selection.setSelection(foundIds, bbox);
        }
    }
}

ToolRegistry.register({ id: 'lasso', factory: (ctx) => new LassoTool(ctx), downShortcut: 'l', isSticky: true });