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

export type ActionType = 'STROKE' | 'ERASE' | 'FLIP_H' | 'UNDO' | 'REDO' | 'FILL' | 'TRANSFORM';

export interface TimelineEvent {
    id: string;
    type: ActionType;
    toolId: string;
    profileId: string;
    layerIndex: number;
    color: string;
    size: number;
    opacity: number;
    timestamp: number;
    data: ArrayBuffer | null;
    compressedData?: ArrayBuffer;
    isCompressed?: boolean;
    bbox?: BoundingBox;
    targetIds?: string[];
    transformMatrix?: number[];
    isSaved?: boolean;
}

export class HistoryManager {
    private engine: CanvasEngine;
    public timeline: TimelineEvent[] = [];
    public spatialGrid = new SpatialHashGrid(128);

    private currentRawPoints: StrokePoint[] = [];
    private currentStrokeStart: number = 0;
    private currentToolId: string = '';
    private currentBrushData = { color: '', size: 0, opacity: 0, type: 'STROKE' as ActionType, profileId: '' };

    private worker: Worker;
    public cacheManager: CacheManager;

    private readonly MAX_RAM_EVENTS = 50;
    private unsnapshottedPoints: number = 0;
    private readonly POINTS_SNAPSHOT_THRESHOLD = 5000;

    public hiddenEventIds: Set<string> = new Set();
    private cachedState: { spine: TimelineEvent[], active: TimelineEvent[], transforms: Map<string, DOMMatrix>, undone: TimelineEvent[] } | null = null;

    constructor(engine: CanvasEngine, worker: Worker, cacheManager: CacheManager) {
        this.engine = engine;
        this.worker = worker;
        this.cacheManager = cacheManager;
    }

    private invalidateCache() {
        this.cachedState = null;
    }

    public async commitTransform(targetIds: string[], matrix: number[]): Promise<TimelineEvent> {
        const startTime = performance.now();
        const event: TimelineEvent = {
            id: crypto.randomUUID(), type: 'TRANSFORM', toolId: 'lasso', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            targetIds: targetIds, transformMatrix: matrix,
            isSaved: false
        };
        this.timeline.push(event);
        this.invalidateCache();

        // === FIX 1: ACTUALIZAR LA GRILLA PARA QUE EL LAZO NO SE QUEDE CIEGO ===
        this.rebuildSpatialGrid();

        this.cacheManager.clearAll();

        // === FIX 2: MOSTRAR LOGS AL MOVER ===
        DiagnosticsService.printMetrics(performance.now() - startTime, this, this.cacheManager);

        return event;
    }

    public rebuildSpatialGrid() {
        this.spatialGrid.clear();
        const { active, transforms } = this.computeTimelineState();

        for (const event of active) {
            if ((event.type === 'STROKE' || event.type === 'ERASE') && event.bbox) {
                const t = transforms.get(event.id);
                if (t && (t.e !== 0 || t.f !== 0 || t.a !== 1 || t.d !== 1)) {
                    this.spatialGrid.insert(event.id, {
                        minX: event.bbox.minX + t.e, minY: event.bbox.minY + t.f,
                        maxX: event.bbox.maxX + t.e, maxY: event.bbox.maxY + t.f,
                    });
                } else {
                    this.spatialGrid.insert(event.id, event.bbox);
                }
            }
        }
    }

    public enforceRamLimit() {
        let activeCount = 0;
        for (let i = this.timeline.length - 1; i >= 0; i--) {
            const ev = this.timeline[i];
            if (ev.data !== null) {
                activeCount++;
                if (activeCount > this.MAX_RAM_EVENTS && ev.isSaved) ev.data = null;
            }
        }
    }

    public beginStroke(type: ActionType, toolId: string, x: number, y: number, pressure: number, brush: BrushEngine) {
        this.currentStrokeStart = performance.now();
        this.currentToolId = toolId;
        this.currentBrushData = { color: brush.color, size: brush.profile.baseSize, opacity: brush.profile.baseOpacity, type, profileId: brush.profile.id };
        this.currentRawPoints = [ObjectPool.getStrokePoint(x, y, pressure, 0)];
    }

    public addPoint(x: number, y: number, pressure: number) {
        if (this.currentRawPoints.length === 0) return;
        const t = Math.round(performance.now() - this.currentStrokeStart);
        this.currentRawPoints.push(ObjectPool.getStrokePoint(x, y, pressure, t));
    }

    private async compressStrokeData(rawPoints: StrokePoint[], brushSize: number): Promise<any> {
        return new Promise((resolve) => {
            const msgId = crypto.randomUUID();
            const handleMessage = (e: MessageEvent) => {
                if (e.data.id === msgId) {
                    this.worker.removeEventListener('message', handleMessage);
                    resolve(e.data);
                }
            };
            this.worker.addEventListener('message', handleMessage);
            this.worker.postMessage({ id: msgId, rawPoints, brushSize });
        });
    }

    public async commitStroke(): Promise<TimelineEvent | null> {
        if (this.currentRawPoints.length === 0) return null;
        const startTime = performance.now();
        const rawPoints = this.currentRawPoints;
        const ptsCount = rawPoints.length;
        const brushData = this.currentBrushData;
        this.currentRawPoints = [];

        const compressedData = await this.compressStrokeData(rawPoints, brushData.size);

        const event: TimelineEvent = {
            id: compressedData.id, type: brushData.type, toolId: this.currentToolId, profileId: brushData.profileId,
            layerIndex: this.engine.activeLayerIndex, color: brushData.color, size: brushData.size,
            opacity: brushData.opacity, timestamp: Date.now(), data: compressedData.binaryData,
            compressedData: compressedData.compressedData, isCompressed: false, bbox: compressedData.bbox,
            isSaved: false
        };

        this.timeline.push(event);
        this.invalidateCache();

        if (event.bbox && (event.type === 'STROKE' || event.type === 'ERASE')) {
            this.spatialGrid.insert(event.id, event.bbox);
        }

        this.unsnapshottedPoints += ptsCount;
        if (this.unsnapshottedPoints > this.POINTS_SNAPSHOT_THRESHOLD) {
            this.cacheManager.bake(event.id, this.engine.getActiveLayerContext().canvas);
            this.unsnapshottedPoints = 0;
        }
        DiagnosticsService.printMetrics(performance.now() - startTime, this, this.cacheManager);
        return event;
    }

    public applyUndo(): boolean {
        const { active } = this.computeTimelineState();
        if (active.length === 0) return false;
        const lastEvent = active[active.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'UNDO', toolId: 'system', profileId: 'system', layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, timestamp: Date.now(), data: null, bbox: lastEvent.bbox, opacity: 1, isSaved: false
        });
        this.invalidateCache();
        return true;
    }

    public applyRedo(): boolean {
        const { undone } = this.computeTimelineState();
        if (undone.length === 0) return false;
        const nextRedo = undone[undone.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'REDO', toolId: 'system', profileId: 'system', layerIndex: this.engine.activeLayerIndex,
            color: '', size: 0, timestamp: Date.now(), data: null, bbox: nextRedo.bbox, opacity: 1, isSaved: false
        });
        this.invalidateCache();
        return true;
    }

    public getActiveCommands(brush: BrushEngine): ICommand[] {
        const { active, transforms } = this.computeTimelineState();
        return active
            .filter(ev => !this.hiddenEventIds.has(ev.id))
            .map(ev => {
                const cmd = CommandFactory.create(ev, brush);
                const t = transforms.get(ev.id);
                if (t) {
                    cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                }
                return cmd;
            });
    }

    public getActiveEvents(): TimelineEvent[] { return this.computeTimelineState().active; }
    public getTimelineSpine(): TimelineEvent[] { return this.computeTimelineState().spine; }

    public computeTimelineState() {
        if (this.cachedState) return this.cachedState;

        const spine: TimelineEvent[] = [];
        const undone: TimelineEvent[] = [];

        for (const event of this.timeline) {
            if (event.type === 'UNDO') {
                if (spine.length > 0) undone.push(spine.pop()!);
            } else if (event.type === 'REDO') {
                if (undone.length > 0) spine.push(undone.pop()!);
            } else {
                spine.push(event);
                undone.length = 0;
            }
        }

        const active: TimelineEvent[] = [];
        const transforms = new Map<string, DOMMatrix>();

        for (const ev of spine) {
            if (ev.type === 'TRANSFORM' && ev.targetIds && ev.transformMatrix) {
                const newMatrix = new DOMMatrix(ev.transformMatrix);
                for (const id of ev.targetIds) {
                    const current = transforms.get(id) || new DOMMatrix();
                    current.multiplySelf(newMatrix);
                    transforms.set(id, current);
                }
            } else {
                active.push(ev);
            }
        }

        this.cachedState = { spine, active, transforms, undone };
        return this.cachedState;
    }
}