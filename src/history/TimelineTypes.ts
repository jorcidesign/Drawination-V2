// src/history/TimelineTypes.ts
import type { BoundingBox } from '../core/math/BoundingBox';

export type DrawingAction = 'STROKE' | 'ERASE' | 'FILL';
export type TransformAction = 'TRANSFORM' | 'HIDE' | 'DUPLICATE_GROUP';
export type LayerAction = 'LAYER_CREATE' | 'LAYER_DELETE' | 'LAYER_REORDER' | 'LAYER_OPACITY' | 'LAYER_VISIBILITY' | 'LAYER_LOCK' | 'LAYER_MERGE_DOWN' | 'LAYER_SELECT' | 'LAYER_DUPLICATE' | 'BACKGROUND_COLOR';
export type ControlAction = 'UNDO' | 'REDO' | 'FLIP_H';
export type ActionType = DrawingAction | TransformAction | LayerAction | ControlAction;

export interface TimelineEvent {
    readonly id: string;
    readonly type: ActionType;
    readonly toolId: string;
    readonly profileId: string;
    readonly layerIndex: number;
    readonly timestamp: number;
    readonly color: string;
    readonly size: number;
    readonly opacity: number;

    data: ArrayBuffer | null;
    compressedData?: ArrayBuffer;
    isCompressed?: boolean;
    isSaved?: boolean;
    readonly bbox?: BoundingBox;
    readonly targetIds?: string[];
    readonly transformMatrix?: number[];
    readonly sourceIds?: string[];
    readonly newIds?: string[];
    readonly layerName?: string;
    readonly fromIndex?: number;
    readonly toIndex?: number;
    readonly layerOpacity?: number;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly backgroundColor?: string;
    readonly layerOrder?: number[];

    // === FIX: Agrupación de transacciones ===
    readonly groupId?: string;
    readonly undoCount?: number;
}

export interface LayerState {
    visible: boolean;
    opacity: number;
    locked: boolean;
    name: string;
}

export interface TimelineState {
    readonly active: TimelineEvent[];
    readonly transforms: Map<string, DOMMatrix>;
    readonly hiddenIds: Set<string>;
    readonly layersState: Map<number, LayerState>;
    readonly layerRoute: Map<number, number>;
    readonly derivedActiveLayerIndex: number;
    readonly spine: TimelineEvent[];
    readonly undone: TimelineEvent[];
    readonly backgroundColor: string;
    readonly createdLayers: Set<number>;
    readonly layerOrder: number[];
}

export function isDrawingEvent(ev: TimelineEvent): ev is TimelineEvent & { data: ArrayBuffer | null; bbox: BoundingBox } {
    return ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL';
}
export function isTransformEvent(ev: TimelineEvent): ev is TimelineEvent & { targetIds: string[]; transformMatrix: number[] } {
    return ev.type === 'TRANSFORM' && ev.targetIds != null && ev.transformMatrix != null;
}
export function isHideEvent(ev: TimelineEvent): ev is TimelineEvent & { targetIds: string[] } {
    return ev.type === 'HIDE' && ev.targetIds != null;
}
export function isLayerEvent(ev: TimelineEvent): boolean {
    return ev.type === 'LAYER_CREATE' || ev.type === 'LAYER_DELETE' || ev.type === 'LAYER_REORDER' || ev.type === 'LAYER_OPACITY' || ev.type === 'LAYER_VISIBILITY' || ev.type === 'LAYER_LOCK' || ev.type === 'LAYER_MERGE_DOWN';
}
export function isControlEvent(ev: TimelineEvent): boolean {
    return ev.type === 'UNDO' || ev.type === 'REDO' || ev.type === 'FLIP_H';
}