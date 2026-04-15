// src/tools/draw/VectorEraserTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ToolRegistry } from '../core/ToolRegistry';
import { BinarySerializer } from '../../core/io/BinarySerializer';

declare module '../../input/EventBus' {
    interface AppEventMap {
        'SET_TOOL_VECTOR_ERASER': void;
    }
}

export class VectorEraserTool implements ITool {
    public readonly id = 'vector-eraser';
    private ctx: ToolContext;
    private erasing = false;
    private readonly eraserRadius = 15;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
        this.ctx.eventBus.on('SET_TOOL_VECTOR_ERASER', () => {
            this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);
        });
    }

    public isBusy() { return this.erasing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'crosshair';
    }

    public onDeactivate() {
        this.erasing = false;
    }

    public onPointerDown(data: PointerData) {
        this.erasing = true;

        // 🚀 OPTIMIZACIÓN LAZY: Se calcula al disparar la bomba
        this.ctx.history.rebuildSpatialGrid();

        this.performErase(data);
    }

    public onPointerMove(data: PointerData) {
        if (!this.erasing) return;
        this.performErase(data);
    }

    public onPointerUp(_data: PointerData) {
        this.erasing = false;
    }

    private async performErase(data: PointerData) {
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);

        const queryBbox = {
            minX: canvasPos.x - this.eraserRadius,
            minY: canvasPos.y - this.eraserRadius,
            maxX: canvasPos.x + this.eraserRadius,
            maxY: canvasPos.y + this.eraserRadius
        };

        const candidates = this.ctx.history.spatialGrid.query(queryBbox);
        if (candidates.size === 0) return;

        const state = this.ctx.history.getState();

        if (state.layersState.get(state.derivedActiveLayerIndex)?.locked) {
            return;
        }

        const idsToHide: string[] = [];
        const radiusSq = this.eraserRadius * this.eraserRadius;

        for (const id of candidates) {
            if (state.hiddenIds.has(id)) continue;

            const event = state.active.find(e => e.id === id);
            if (!event || !event.data) continue;

            const routedLayer = state.layerRoute.get(event.layerIndex) ?? event.layerIndex;
            if (routedLayer !== state.derivedActiveLayerIndex) continue;

            const t = state.transforms.get(id) ?? new DOMMatrix();
            const pts = BinarySerializer.decode(event.data);

            let hit = false;
            for (let i = 0; i < pts.length - 1; i++) {
                const ax = pts[i].x * t.a + pts[i].y * t.c + t.e;
                const ay = pts[i].x * t.b + pts[i].y * t.d + t.f;
                const bx = pts[i + 1].x * t.a + pts[i + 1].y * t.c + t.e;
                const by = pts[i + 1].x * t.b + pts[i + 1].y * t.d + t.f;

                if (this.distToSegmentSq(canvasPos.x, canvasPos.y, ax, ay, bx, by) <= radiusSq) {
                    hit = true;
                    break;
                }
            }

            if (hit) idsToHide.push(id);
        }

        if (idsToHide.length > 0) {
            const hideEvent = this.ctx.history.commitHide(idsToHide, this.id);
            await this.ctx.storage.saveEvent(hideEvent);
            hideEvent.isSaved = true;
            await this.ctx.rebuilder.rebuild(this.ctx.activeBrush);
        }
    }

    private distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
        if (l2 === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = ax + t * (bx - ax);
        const projY = ay + t * (by - ay);
        return (px - projX) * (px - projX) + (py - projY) * (py - projY);
    }
}

ToolRegistry.register({
    id: 'vector-eraser',
    factory: (ctx) => new VectorEraserTool(ctx),
    downShortcut: 'shift+e',
    isSticky: true
});