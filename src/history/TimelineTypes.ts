// src/history/TimelineTypes.ts
//
// FUENTE DE VERDAD ÚNICA para todos los tipos del timeline.
// Ningún otro archivo debe redefinir ActionType o TimelineEvent.
// Patrón: Single Source of Truth + Open/Closed (añadir tipos aquí no rompe nada existente)

import type { BoundingBox } from '../core/math/BoundingBox';

// ─────────────────────────────────────────────────────────────────────────────
// ACTION TYPES
// Eventos que GENERAN contenido en el timeline (aparecen en timelapse)
// ─────────────────────────────────────────────────────────────────────────────
export type DrawingAction =
    | 'STROKE'           // Trazo de pincel
    | 'ERASE'            // Trazo de borrador
    | 'FILL';            // Relleno cerrado

export type TransformAction =
    | 'TRANSFORM'        // Mover/escalar/rotar/flip de selección (matriz afín)
    | 'HIDE'             // Ocultar trazos (no destructivo, persiste en timelapse)
    | 'DUPLICATE_GROUP'; // Duplicar grupo de trazos con nuevos IDs

export type LayerAction =
    | 'LAYER_CREATE'
    | 'LAYER_DELETE'
    | 'LAYER_REORDER'
    | 'LAYER_OPACITY'
    | 'LAYER_VISIBILITY'
    | 'LAYER_LOCK'
    | 'LAYER_MERGE_DOWN'
    | 'LAYER_SELECT'; // <--- 1. NUEVO EVENTO

// Eventos de control del timeline (NO aparecen en timelapse, son marcadores)
export type ControlAction =
    | 'UNDO'
    | 'REDO'
    | 'FLIP_H'; // viewport flip — podría moverse a ViewportAction en el futuro

export type ActionType = DrawingAction | TransformAction | LayerAction | ControlAction;

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE EVENT
// Estructura inmutable. Append-only. Nunca se modifica después de creado.
// Los campos opcionales solo aplican a ciertos ActionType — ver comentarios.
// ─────────────────────────────────────────────────────────────────────────────
export interface TimelineEvent {
    // ── Campos universales ────────────────────────────────────────────────
    readonly id: string;
    readonly type: ActionType;
    readonly toolId: string;
    readonly profileId: string;
    readonly layerIndex: number;
    readonly timestamp: number;

    // ── Campos de pincel (STROKE, ERASE, FILL) ────────────────────────────
    readonly color: string;
    readonly size: number;
    readonly opacity: number;

    // Datos binarios del trazo — se nullean en RAM por enforceRamLimit,
    // pero siempre están en IndexedDB. MUTABLE intencionalmente.
    data: ArrayBuffer | null;
    compressedData?: ArrayBuffer;
    isCompressed?: boolean;
    isSaved?: boolean;
    readonly bbox?: BoundingBox;

    // ── Campos de transform (TRANSFORM, HIDE, DUPLICATE_GROUP) ───────────
    readonly targetIds?: string[];           // IDs de strokes afectados
    readonly transformMatrix?: number[];     // [a, b, c, d, tx, ty] — matriz afín

    // ── Campos de duplicado (DUPLICATE_GROUP) ─────────────────────────────
    readonly sourceIds?: string[];           // IDs originales
    readonly newIds?: string[];              // IDs de las copias creadas

    // ── Campos de capas (LAYER_*) ─────────────────────────────────────────
    readonly layerName?: string;             // LAYER_CREATE
    readonly fromIndex?: number;             // LAYER_REORDER
    readonly toIndex?: number;               // LAYER_REORDER
    readonly layerOpacity?: number;          // LAYER_OPACITY (distinto de opacity del brush)
    readonly visible?: boolean;              // LAYER_VISIBILITY
    readonly locked?: boolean;               // LAYER_LOCK
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE STATE
// El resultado de computeTimelineState() — estado derivado del timeline.
// Pure function, memoizable, nunca muta el timeline original.
// ─────────────────────────────────────────────────────────────────────────────
export interface LayerState {
    visible: boolean;
    opacity: number;      // 0..1
    locked: boolean;
    name: string;
}

export interface TimelineState {
    // Eventos activos (sin deshechos), excluyendo TRANSFORM/LAYER/HIDE/UNDO/REDO
    // Son los strokes/erases/fills que deben dibujarse
    readonly active: TimelineEvent[];

    // Transforms acumulados por stroke ID
    // Si un stroke fue movido 3 veces, aquí tiene su DOMMatrix final
    readonly transforms: Map<string, DOMMatrix>;

    // IDs de strokes ocultos por eventos HIDE
    readonly hiddenIds: Set<string>;

    // Estado de cada capa derivado de todos los LAYER_* eventos
    readonly layersState: Map<number, LayerState>;

    // NUEVO: Mapa de enrutamiento virtual para Merge Down
    // Si un trazo dice "soy de la capa 2", pero la 2 se fusionó en la 1, layerRoute.get(2) devolverá 1.
    readonly layerRoute: Map<number, number>;
    // <--- 2. NUEVA PROPIEDAD: El motor mirará aquí para saber dónde dibujar
    readonly derivedActiveLayerIndex: number;
    // Spine: todos los eventos activos en orden (incluye TRANSFORM, LAYER_*, HIDE)
    // Usado por el Timelapse para reproducción cronológica
    readonly spine: TimelineEvent[];

    // Stack de eventos deshechos (para Redo)
    readonly undone: TimelineEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE TIPO — Type guards para narrowing limpio en los comandos
// ─────────────────────────────────────────────────────────────────────────────
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
    return ev.type === 'LAYER_CREATE' || ev.type === 'LAYER_DELETE' ||
        ev.type === 'LAYER_REORDER' || ev.type === 'LAYER_OPACITY' ||
        ev.type === 'LAYER_VISIBILITY' || ev.type === 'LAYER_LOCK' ||
        ev.type === 'LAYER_MERGE_DOWN';
}

export function isControlEvent(ev: TimelineEvent): boolean {
    return ev.type === 'UNDO' || ev.type === 'REDO' || ev.type === 'FLIP_H';
}