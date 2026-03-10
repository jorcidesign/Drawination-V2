// src/history/HistoryManager.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
// === CAMBIAMOS EL IMPORT ===
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StrokePoint } from '../core/io/BinarySerializer';
import type { BoundingBox } from '../core/math/BoundingBox';
import { SpatialHashGrid } from '../core/math/SpatialHashGrid';
import { ObjectPool } from '../core/memory/ObjectPool';
import type { ICommand } from './commands/ICommand';
import { StrokeCommand } from './commands/StrokeCommand';
import { EraseCommand } from './commands/EraseCommand';

export type ActionType = 'STROKE' | 'ERASE' | 'FLIP_H' | 'UNDO' | 'REDO' | 'FILL';

export interface TimelineEvent {
    id: string;
    type: ActionType;
    toolId: string;
    profileId: string; // <--- ¡NUEVO!
    layerIndex: number;
    color: string;
    size: number;
    opacity: number; // <--- ¡NUEVO!
    timestamp: number;
    data: ArrayBuffer | null;
    compressedData?: ArrayBuffer;
    isCompressed?: boolean;
    bbox?: BoundingBox;
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

    private readonly MAX_RAM_EVENTS = 50;

    constructor(engine: CanvasEngine) {
        this.engine = engine;
        this.worker = new Worker(new URL('../workers/CompressionWorker.ts', import.meta.url), { type: 'module' });
    }

    public rebuildSpatialGrid() {
        this.spatialGrid.clear();
        for (const event of this.timeline) {
            if (event.type === 'STROKE' && event.bbox) {
                this.spatialGrid.insert(event.id, event.bbox);
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

        // ¡Cápsula del tiempo activada! Guardamos size, color y opacity del momento exacto
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

    public async commitStroke(): Promise<TimelineEvent | null> {
        if (this.currentRawPoints.length === 0) return null;

        const rawPoints = this.currentRawPoints;
        const brushData = this.currentBrushData;
        const toolId = this.currentToolId;
        const layerIndex = this.engine.activeLayerIndex;

        this.currentRawPoints = [];

        return new Promise((resolve) => {
            const msgId = crypto.randomUUID();

            const handleMessage = (e: MessageEvent) => {
                if (e.data.id === msgId) {
                    this.worker.removeEventListener('message', handleMessage);

                    const event: TimelineEvent = {
                        id: msgId,
                        type: brushData.type,
                        toolId: toolId,
                        profileId: brushData.profileId, // <--- ¡NUEVO!
                        layerIndex: layerIndex,
                        color: brushData.color,
                        size: brushData.size,
                        opacity: brushData.opacity, // <--- ¡NUEVO!
                        timestamp: Date.now(),
                        data: e.data.binaryData,
                        compressedData: e.data.compressedData,
                        isCompressed: false,
                        bbox: e.data.bbox
                    };

                    this.timeline.push(event);

                    if (event.bbox) {
                        this.spatialGrid.insert(event.id, event.bbox);
                    }

                    this.enforceRamLimit();
                    resolve(event);
                }
            };

            this.worker.addEventListener('message', handleMessage);
            this.worker.postMessage({ id: msgId, rawPoints: rawPoints, brushSize: brushData.size });
        });
    }

    public applyUndo(): BoundingBox | null {
        const activeEvents = this.getActiveEventsRaw();
        if (activeEvents.length === 0) return null;

        const lastEvent = activeEvents[activeEvents.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'UNDO', toolId: 'system', profileId: 'system', // <--- ¡NUEVO!
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0,
            timestamp: Date.now(), data: null, bbox: lastEvent.bbox,
            opacity: 1
        });

        return lastEvent.bbox || null;
    }

    public applyRedo(): BoundingBox | null {
        const undoneEvents = this.getUndoneEventsRaw();
        if (undoneEvents.length === 0) return null;

        const nextRedo = undoneEvents[undoneEvents.length - 1];

        this.timeline.push({
            id: crypto.randomUUID(), type: 'UNDO', toolId: 'system', profileId: 'system', // <--- ¡NUEVO!
            layerIndex: this.engine.activeLayerIndex, color: '', size: 0,
            timestamp: Date.now(), data: null, bbox: nextRedo.bbox,
            opacity: 1
        });

        return nextRedo.bbox || null;
    }

    // ====================================================================
    // LA MAGIA DEL PATRÓN COMMAND OCURRE AQUÍ
    // Devolvemos ICommand (objetos inteligentes) en lugar de TimelineEvent (objetos tontos)
    // ====================================================================
    public getActiveCommands(brush: BrushEngine): ICommand[] {
        const active = this.getActiveEventsRaw();

        return active.map(ev => {
            if (ev.type === 'ERASE') {
                return new EraseCommand(ev, brush);
            }
            return new StrokeCommand(ev, brush);
        });
    }
    // Mantenemos esta función pública si el Storage o la UI necesitan la data cruda,
    // pero el motor de renderizado debe usar getActiveCommands()
    public getActiveEvents(): TimelineEvent[] {
        return this.getActiveEventsRaw();
    }

    // Funciones helper privadas para calcular el estado actual de la línea de tiempo
    private getActiveEventsRaw(): TimelineEvent[] {
        const active: TimelineEvent[] = [];
        const undone: TimelineEvent[] = [];

        for (const event of this.timeline) {
            if (event.type === 'STROKE' || event.type === 'ERASE') {
                active.push(event);
                undone.length = 0;
            } else if (event.type === 'UNDO') {
                if (active.length > 0) undone.push(active.pop()!);
            } else if (event.type === 'REDO') {
                if (undone.length > 0) active.push(undone.pop()!);
            }
        }
        return active;
    }

    private getUndoneEventsRaw(): TimelineEvent[] {
        const active: TimelineEvent[] = [];
        const undone: TimelineEvent[] = [];

        for (const event of this.timeline) {
            if (event.type === 'STROKE' || event.type === 'ERASE') {
                active.push(event);
                undone.length = 0;
            } else if (event.type === 'UNDO') {
                if (active.length > 0) undone.push(active.pop()!);
            } else if (event.type === 'REDO') {
                if (undone.length > 0) active.push(undone.pop()!);
            }
        }
        return undone;
    }
}