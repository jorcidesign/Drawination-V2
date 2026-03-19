// src/history/HistoryManager.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StrokePoint } from '../core/io/BinarySerializer';
import type { BoundingBox } from '../core/math/BoundingBox';
import { SpatialHashGrid } from '../core/math/SpatialHashGrid';
import { ObjectPool } from '../core/memory/ObjectPool';
import type { ICommand } from './commands/ICommand';
import { CacheManager } from './CacheManager';
import { CommandFactory } from './commands/CommandFactory';
import { DiagnosticsService } from './DiagnosticsService';
import { computeTimelineState } from './computeTimelineState';
import type { TimelineEvent, TimelineState, ActionType, LayerAction } from './TimelineTypes';

export type { ActionType, TimelineEvent };

const REDO_PROTECT_WINDOW = 10;

export class HistoryManager {
    private engine: CanvasEngine;
    public timeline: TimelineEvent[] = [];
    public spatialGrid = new SpatialHashGrid(128);
    public cacheManager: CacheManager;

    private currentRawPoints: StrokePoint[] = [];
    private currentStrokeStart: number = 0;
    private currentToolId: string = '';
    private currentBrushData = {
        color: '', size: 0, opacity: 0,
        type: 'STROKE' as ActionType, profileId: ''
    };

    private worker: Worker;
    private readonly MAX_RAM_EVENTS = 50;
    private _cachedState: TimelineState | null = null;

    public isTimelapseRunning: boolean = false;

    constructor(engine: CanvasEngine, worker: Worker, cacheManager: CacheManager) {
        this.engine = engine;
        this.worker = worker;
        this.cacheManager = cacheManager;
    }

    public getState(): TimelineState {
        if (!this._cachedState) {
            this._cachedState = computeTimelineState(this.timeline);
        }
        return this._cachedState;
    }

    public invalidateCache(): void {
        this._cachedState = null;
    }

    public getActiveEvents(): TimelineEvent[] { return this.getState().active; }
    public getTimelineSpine(): TimelineEvent[] { return this.getState().spine; }

    public peekUndo(): TimelineEvent | null {
        const { spine } = this.getState();
        return spine.length > 0 ? spine[spine.length - 1] : null;
    }

    public peekRedo(): TimelineEvent | null {
        const { undone } = this.getState();
        return undone.length > 0 ? undone[undone.length - 1] : null;
    }

    public push(event: TimelineEvent): void {
        const hadUndoneEvents = this.getState().undone.length > 0;

        this.timeline.push(event);
        this.invalidateCache();

        if (hadUndoneEvents) {
            const allValidIds = this.timeline.map(e => e.id);
            this.cacheManager.garbageCollect(allValidIds);
        }
    }

    public applyUndo(): TimelineEvent | null {
        const { spine } = this.getState();
        if (spine.length === 0) return null;

        const eventToUndo = spine[spine.length - 1];

        this.push({
            id: crypto.randomUUID(), type: 'UNDO',
            toolId: 'system', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            bbox: eventToUndo.bbox, isSaved: false,
        });

        // Invalidamos solo snapshots posteriores al evento desecho.
        // Los anteriores siguen válidos — el rebuild arranca desde el más cercano
        // en lugar de repintar los 1100 trazos desde cero.
        const allIds = this.timeline.map(e => e.id);
        this.cacheManager.invalidateFrom(eventToUndo.id, allIds);

        return eventToUndo;
    }

    public applyRedo(): TimelineEvent | null {
        const { undone } = this.getState();
        if (undone.length === 0) return null;

        const eventToRedo = undone[undone.length - 1];

        this.push({
            id: crypto.randomUUID(), type: 'REDO',
            toolId: 'system', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            bbox: eventToRedo.bbox, isSaved: false,
        });

        // Invalidamos solo snapshots posteriores al evento rehecho.
        const allIds = this.timeline.map(e => e.id);
        this.cacheManager.invalidateFrom(eventToRedo.id, allIds);

        return eventToRedo;
    }

    public beginStroke(type: ActionType, toolId: string, x: number, y: number, pressure: number, brush: BrushEngine): void {
        this.currentStrokeStart = performance.now();
        this.currentToolId = toolId;
        this.currentBrushData = {
            color: brush.color, size: brush.profile.baseSize,
            opacity: brush.profile.baseOpacity, type, profileId: brush.profile.id
        };
        this.currentRawPoints = [ObjectPool.getStrokePoint(x, y, pressure, 0)];
    }

    public addPoint(x: number, y: number, pressure: number): void {
        if (this.currentRawPoints.length === 0) return;
        const t = Math.round(performance.now() - this.currentStrokeStart);
        this.currentRawPoints.push(ObjectPool.getStrokePoint(x, y, pressure, t));
    }

    public async commitStroke(): Promise<TimelineEvent | null> {
        if (this.currentRawPoints.length === 0) return null;
        const startTime = performance.now();
        const rawPoints = this.currentRawPoints;
        const brushData = this.currentBrushData;
        this.currentRawPoints = [];

        const compressed = await this._compressPoints(rawPoints, brushData.size);

        const event: TimelineEvent = {
            id: compressed.id, type: brushData.type,
            toolId: this.currentToolId, profileId: brushData.profileId,
            layerIndex: this.engine.activeLayerIndex,
            color: brushData.color, size: brushData.size, opacity: brushData.opacity,
            timestamp: Date.now(),
            data: compressed.binaryData,
            compressedData: compressed.compressedData,
            isCompressed: false, bbox: compressed.bbox, isSaved: false,
        };

        this.push(event);

        if (event.bbox && (event.type === 'STROKE' || event.type === 'ERASE')) {
            this.spatialGrid.insert(event.id, event.bbox);
        }

        DiagnosticsService.printMetrics(performance.now() - startTime, this, this.cacheManager);
        return event;
    }

    public async commitTransform(targetIds: string[], matrix: number[]): Promise<TimelineEvent> {
        const startTime = performance.now();
        const { active } = this.getState();

        let oldestIndex = active.length;
        for (const id of targetIds) {
            const idx = active.findIndex(e => e.id === id);
            if (idx !== -1 && idx < oldestIndex) oldestIndex = idx;
        }

        if (oldestIndex < active.length) {
            const validIds = active.slice(0, oldestIndex).map(e => e.id);
            this.cacheManager.garbageCollect(validIds);
        } else {
            this.cacheManager.clearAll();
        }

        const event: TimelineEvent = {
            id: crypto.randomUUID(), type: 'TRANSFORM',
            toolId: 'lasso', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            targetIds, transformMatrix: matrix, isSaved: false,
        };

        this.push(event);
        this.rebuildSpatialGrid();

        DiagnosticsService.printMetrics(performance.now() - startTime, this, this.cacheManager);
        return event;
    }

    public commitHide(targetIds: string[], toolId: string = 'system'): TimelineEvent {
        const startTime = performance.now();
        const event: TimelineEvent = {
            id: crypto.randomUUID(), type: 'HIDE',
            toolId: toolId, profileId: 'system',
            layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            targetIds, isSaved: false,
        };
        this.push(event);
        this.cacheManager.clearAll();

        DiagnosticsService.logEvent(event);
        DiagnosticsService.printMetrics(performance.now() - startTime, this, this.cacheManager);
        return event;
    }

    public commitLayerAction(type: LayerAction, layerIndex: number, extraPayload: Partial<TimelineEvent> = {}): TimelineEvent {
        const event: TimelineEvent = {
            id: crypto.randomUUID(), type,
            toolId: 'system', profileId: 'system', layerIndex,
            timestamp: Date.now(), color: '', size: 0, opacity: 1, data: null,
            isSaved: false,
            ...extraPayload
        };
        this.push(event);
        DiagnosticsService.logEvent(event);
        return event;
    }

    public rebuildSpatialGrid(): void {
        this.spatialGrid.clear();
        const { active, transforms } = this.getState();

        for (const event of active) {
            if (!event.bbox || (event.type !== 'STROKE' && event.type !== 'ERASE')) continue;

            const t = transforms.get(event.id);
            if (t && (t.e !== 0 || t.f !== 0 || t.a !== 1 || t.b !== 0)) {
                const { minX, minY, maxX, maxY } = event.bbox;
                const pts = [
                    { x: minX * t.a + minY * t.c + t.e, y: minX * t.b + minY * t.d + t.f },
                    { x: maxX * t.a + minY * t.c + t.e, y: maxX * t.b + minY * t.d + t.f },
                    { x: minX * t.a + maxY * t.c + t.e, y: minX * t.b + maxY * t.d + t.f },
                    { x: maxX * t.a + maxY * t.c + t.e, y: maxX * t.b + maxY * t.d + t.f },
                ];
                this.spatialGrid.insert(event.id, {
                    minX: Math.min(...pts.map(p => p.x)),
                    minY: Math.min(...pts.map(p => p.y)),
                    maxX: Math.max(...pts.map(p => p.x)),
                    maxY: Math.max(...pts.map(p => p.y)),
                });
            } else {
                this.spatialGrid.insert(event.id, event.bbox);
            }
        }
    }

    public getActiveCommands(brush: BrushEngine): ICommand[] {
        const { active, transforms, hiddenIds } = this.getState();
        return active
            .filter(ev => !hiddenIds.has(ev.id))
            .map(ev => {
                const cmd = CommandFactory.create(ev, brush);
                const t = transforms.get(ev.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                return cmd;
            });
    }

    public getBboxForIds(ids: string[]): BoundingBox | null {
        const { active, transforms } = this.getState();
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;

        for (const id of ids) {
            const ev = active.find(e => e.id === id);
            if (!ev?.bbox) continue;

            const t = transforms.get(id) ?? new DOMMatrix();
            const { minX, minY, maxX, maxY } = ev.bbox;
            const pts = [
                { x: minX * t.a + minY * t.c + t.e, y: minX * t.b + minY * t.d + t.f },
                { x: maxX * t.a + minY * t.c + t.e, y: maxX * t.b + minY * t.d + t.f },
                { x: minX * t.a + maxY * t.c + t.e, y: minX * t.b + maxY * t.d + t.f },
                { x: maxX * t.a + maxY * t.c + t.e, y: maxX * t.b + maxY * t.d + t.f },
            ];

            for (const p of pts) {
                if (p.x < gMinX) gMinX = p.x;
                if (p.y < gMinY) gMinY = p.y;
                if (p.x > gMaxX) gMaxX = p.x;
                if (p.y > gMaxY) gMaxY = p.y;
            }
        }

        return gMinX === Infinity ? null : { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY };
    }

    public enforceRamLimit(): void {
        if (this.isTimelapseRunning) return;

        const { undone } = this.getState();
        const protectedIds = new Set<string>();
        const windowStart = Math.max(0, undone.length - REDO_PROTECT_WINDOW);
        for (let i = windowStart; i < undone.length; i++) {
            protectedIds.add(undone[i].id);
        }

        // Recorremos hacia atrás y salimos en cuanto los N más recientes
        // ya caben en RAM — no iteramos el timeline completo innecesariamente.
        let activeCount = 0;
        for (let i = this.timeline.length - 1; i >= 0; i--) {
            const ev = this.timeline[i];
            if (ev.data === null) continue;
            if (protectedIds.has(ev.id)) continue;

            activeCount++;
            if (activeCount > this.MAX_RAM_EVENTS) {
                if (ev.isSaved) {
                    (ev as any).data = null;
                }
            } else if (activeCount === this.MAX_RAM_EVENTS) {
                // Ya tenemos exactamente MAX_RAM_EVENTS con data en RAM.
                // Todo lo que queda hacia atrás ya fue nulleado en iteraciones anteriores.
                break;
            }
        }
    }

    private _compressPoints(rawPoints: StrokePoint[], brushSize: number): Promise<any> {
        return new Promise((resolve) => {
            const msgId = crypto.randomUUID();
            const handler = (e: MessageEvent) => {
                if (e.data.id === msgId) {
                    this.worker.removeEventListener('message', handler);
                    resolve(e.data);
                }
            };
            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ id: msgId, rawPoints, brushSize });
        });
    }
}