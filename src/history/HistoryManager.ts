// src/history/HistoryManager.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StrokePoint } from '../core/io/BinarySerializer';
import type { BoundingBox } from '../core/math/BoundingBox';
import { SpatialHashGrid } from '../core/math/SpatialHashGrid';
import { ObjectPool } from '../core/memory/ObjectPool';
import type { ICommand } from './commands/ICommand';
import { StrokeCommand } from './commands/StrokeCommand';
import { EraseCommand } from './commands/EraseCommand';
import { CacheManager } from './CacheManager';

// Tipos oficiales para el Historial No Destructivo
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
    // NUEVOS: Para guardar el movimiento sin tocar los vectores
    targetIds?: string[];
    transformDx?: number;
    transformDy?: number;
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

    constructor(engine: CanvasEngine) {
        this.engine = engine;
        this.worker = new Worker(new URL('../workers/CompressionWorker.ts', import.meta.url), { type: 'module' });
        this.cacheManager = new CacheManager(this.engine.width, this.engine.height);
    }

    // === TRANSFORMACIONES NO DESTRUCTIVAS ===
    public async commitTransform(targetIds: string[], dx: number, dy: number): Promise<TimelineEvent> {
        const event: TimelineEvent = {
            id: crypto.randomUUID(), type: 'TRANSFORM', toolId: 'lasso', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0, opacity: 1,
            timestamp: Date.now(), data: null,
            targetIds: targetIds, transformDx: dx, transformDy: dy
        };
        this.timeline.push(event);
        this.enforceRamLimit();

        // Rompemos el caché porque el pasado cambió visualmente y necesita recalcularse
        this.cacheManager.clearAll();
        return event;
    }

    public rebuildSpatialGrid() {
        this.spatialGrid.clear();
        const { active, transforms } = this.computeTimelineState();

        for (const event of active) {
            if ((event.type === 'STROKE' || event.type === 'ERASE') && event.bbox) {
                const t = transforms.get(event.id);
                if (t) {
                    // Si el trazo fue transformado, movemos su hitbox en la grilla espacial
                    this.spatialGrid.insert(event.id, {
                        minX: event.bbox.minX + t.dx, minY: event.bbox.minY + t.dy,
                        maxX: event.bbox.maxX + t.dx, maxY: event.bbox.maxY + t.dy,
                    });
                } else {
                    this.spatialGrid.insert(event.id, event.bbox);
                }
            }
        }
    }

    private enforceRamLimit() {
        if (this.timeline.length > this.MAX_RAM_EVENTS) {
            for (let i = 0; i < this.timeline.length - this.MAX_RAM_EVENTS; i++) {
                if (this.timeline[i].data !== null) {
                    this.timeline[i].data = null;
                }
            }
        }
    }

    public beginStroke(type: ActionType, toolId: string, x: number, y: number, pressure: number, brush: BrushEngine) {
        this.currentStrokeStart = performance.now();
        this.currentToolId = toolId;

        this.currentBrushData = {
            color: brush.color,
            size: brush.profile.baseSize,
            opacity: brush.profile.baseOpacity,
            type,
            profileId: brush.profile.id
        };

        this.currentRawPoints = [ObjectPool.getStrokePoint(x, y, pressure, 0)];
    }

    public addPoint(x: number, y: number, pressure: number) {
        if (this.currentRawPoints.length === 0) return;
        const t = Math.round(performance.now() - this.currentStrokeStart);
        this.currentRawPoints.push(ObjectPool.getStrokePoint(x, y, pressure, t));
    }

    private async printSystemDiagnostics(actionTimeMs: number) {
        const estimate = navigator.storage && navigator.storage.estimate
            ? await navigator.storage.estimate()
            : { usage: 0, quota: 0 };

        const usageMB = (estimate.usage || 0) / (1024 * 1024);
        const quotaMB = (estimate.quota || 0) / (1024 * 1024);

        let jsHeap = 0;
        if ((performance as any).memory) {
            jsHeap = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
        }

        const memSnaps = this.cacheManager.getStats ? this.cacheManager.getStats().memoryCacheSize : 0;
        const totalEvents = this.getActiveEvents().length;
        const bytesRam = this.timeline.reduce((acc, ev) => acc + (ev.data ? ev.data.byteLength : 0), 0);

        console.groupCollapsed(`%c🖌️ Trazo #${totalEvents} procesado en ${actionTimeMs.toFixed(1)}ms`, 'color: #00d2ff; font-weight: bold;');
        console.log(`%c💾 Disco (IndexedDB): %c${usageMB.toFixed(2)} MB usados %c(de ${quotaMB.toFixed(0)} MB disp.)`, 'font-weight: bold;', 'color: #ffaa00;', 'color: gray;');
        console.log(`%c🧠 Memoria RAM (V8): %c${jsHeap > 0 ? jsHeap.toFixed(2) + ' MB' : 'No soportado'}`, 'font-weight: bold;', 'color: #00ff00;');
        console.log(`%c⚡ Caché Híbrido: %c${memSnaps} / 20 fotos en RAM`, 'font-weight: bold;', 'color: #00ff00;');
        console.log(`%c🗜️ Vectores en VIVO: %c${(bytesRam / 1024).toFixed(2)} KB en RAM activa`, 'font-weight: bold;', 'color: #ff00ff;');
        console.groupEnd();
    }

    public async commitStroke(): Promise<TimelineEvent | null> {
        if (this.currentRawPoints.length === 0) return null;

        const rawPoints = this.currentRawPoints;
        const brushData = this.currentBrushData;
        const toolId = this.currentToolId;
        const layerIndex = this.engine.activeLayerIndex;

        this.currentRawPoints = [];
        const startTime = performance.now();

        return new Promise((resolve) => {
            const msgId = crypto.randomUUID();

            const handleMessage = (e: MessageEvent) => {
                if (e.data.id === msgId) {
                    this.worker.removeEventListener('message', handleMessage);

                    const event: TimelineEvent = {
                        id: msgId,
                        type: brushData.type,
                        toolId: toolId,
                        profileId: brushData.profileId,
                        layerIndex: layerIndex,
                        color: brushData.color,
                        size: brushData.size,
                        opacity: brushData.opacity,
                        timestamp: Date.now(),
                        data: e.data.binaryData,
                        compressedData: e.data.compressedData,
                        isCompressed: false,
                        bbox: e.data.bbox
                    };

                    this.timeline.push(event);

                    if (event.bbox && (event.type === 'STROKE' || event.type === 'ERASE')) {
                        this.spatialGrid.insert(event.id, event.bbox);
                    }

                    this.enforceRamLimit();

                    const active = this.getActiveEvents();
                    if (active.length > 0 && active.length % 20 === 0) {
                        const activeCanvas = this.engine.getActiveLayerContext().canvas;
                        this.cacheManager.bake(event.id, activeCanvas);
                    }

                    const timeTaken = performance.now() - startTime;
                    this.printSystemDiagnostics(timeTaken);
                    resolve(event);
                }
            };

            this.worker.addEventListener('message', handleMessage);
            this.worker.postMessage({ id: msgId, rawPoints: rawPoints, brushSize: brushData.size });
        });
    }

    public applyUndo(): BoundingBox | null {
        const { active } = this.computeTimelineState();
        if (active.length === 0) return null;

        const lastEvent = active[active.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'UNDO', toolId: 'system', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0,
            timestamp: Date.now(), data: null, bbox: lastEvent.bbox,
            opacity: 1
        });

        return lastEvent.bbox || null;
    }

    public applyRedo(): BoundingBox | null {
        const { undone } = this.computeTimelineState();
        if (undone.length === 0) return null;

        const nextRedo = undone[undone.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'REDO', toolId: 'system', profileId: 'system',
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0,
            timestamp: Date.now(), data: null, bbox: nextRedo.bbox,
            opacity: 1
        });

        return nextRedo.bbox || null;
    }

    public getActiveCommands(brush: BrushEngine): ICommand[] {
        const { active, transforms } = this.computeTimelineState();

        return active.map(ev => {
            let cmd: ICommand;
            if (ev.type === 'ERASE') cmd = new EraseCommand(ev, brush);
            else cmd = new StrokeCommand(ev, brush);

            const t = transforms.get(ev.id);
            if (t) {
                cmd.dx = t.dx;
                cmd.dy = t.dy;
            }
            return cmd;
        });
    }

    public getActiveEvents(): TimelineEvent[] { return this.computeTimelineState().active; }

    public getTimelineSpine(): TimelineEvent[] { return this.computeTimelineState().spine; }

    public computeTimelineState() {
        const spine: TimelineEvent[] = [];
        const undone: TimelineEvent[] = [];

        // Fase 1: Resolver Ctrl+Z / Ctrl+Y
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

        // Fase 2: Acumular transformaciones
        const active: TimelineEvent[] = [];
        const transforms = new Map<string, { dx: number, dy: number }>();

        for (const ev of spine) {
            if (ev.type === 'TRANSFORM' && ev.targetIds) {
                for (const id of ev.targetIds) {
                    const current = transforms.get(id) || { dx: 0, dy: 0 };
                    current.dx += ev.transformDx || 0;
                    current.dy += ev.transformDy || 0;
                    transforms.set(id, current);
                }
            } else {
                active.push(ev);
            }
        }

        return { spine, active, transforms, undone };
    }
}