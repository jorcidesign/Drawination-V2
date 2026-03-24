// src/history/computeTimelineState.ts
import type { TimelineEvent, TimelineState, LayerState } from './TimelineTypes';
import { isTransformEvent, isHideEvent } from './TimelineTypes';

const MAX_LAYERS = 10;
export const DEFAULT_BACKGROUND_COLOR = '#FAFAFA'; // blanco mate por defecto

function buildDefaultLayerState(index: number): LayerState {
    return {
        visible: true,
        opacity: 1.0,
        locked: false,
        name: `Capa ${index + 1}`,
    };
}

export function computeTimelineState(timeline: TimelineEvent[]): TimelineState {
    const spine: TimelineEvent[] = [];
    const undone: TimelineEvent[] = [];

    for (const event of timeline) {
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
    const hiddenIds = new Set<string>();
    const layersState = new Map<number, LayerState>();
    const layerRoute = new Map<number, number>();

    let derivedActiveLayerIndex = 0;
    let backgroundColor = DEFAULT_BACKGROUND_COLOR;

    for (let i = 0; i < MAX_LAYERS; i++) {
        layersState.set(i, buildDefaultLayerState(i));
        layerRoute.set(i, i);
    }

    for (const ev of spine) {
        switch (ev.type) {
            case 'STROKE':
            case 'ERASE':
            case 'FILL':
                active.push(ev);
                break;

            case 'TRANSFORM':
                if (isTransformEvent(ev)) {
                    const newMatrix = new DOMMatrix(ev.transformMatrix);
                    for (const id of ev.targetIds) {
                        const current = transforms.get(id) ?? new DOMMatrix();
                        transforms.set(id, newMatrix.multiply(current));
                    }
                }
                break;

            case 'HIDE':
                if (isHideEvent(ev)) {
                    for (const id of ev.targetIds) hiddenIds.add(id);
                }
                break;

            // ── Color de fondo ────────────────────────────────────────────
            case 'BACKGROUND_COLOR':
                if (ev.backgroundColor) {
                    backgroundColor = ev.backgroundColor;
                }
                break;

            case 'LAYER_SELECT':
                derivedActiveLayerIndex = ev.layerIndex;
                break;

            case 'DUPLICATE_GROUP':
                break;

            case 'LAYER_CREATE': {
                const existing = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing,
                    name: ev.layerName ?? existing.name,
                    visible: true,
                    locked: false,
                });
                derivedActiveLayerIndex = ev.layerIndex;
                break;
            }

            case 'LAYER_DELETE': {
                for (const activeEv of active) {
                    if (activeEv.layerIndex === ev.layerIndex) {
                        hiddenIds.add(activeEv.id);
                    }
                }
                break;
            }

            case 'LAYER_REORDER': {
                if (ev.fromIndex != null && ev.toIndex != null) {
                    const from = layersState.get(ev.fromIndex) ?? buildDefaultLayerState(ev.fromIndex);
                    const to = layersState.get(ev.toIndex) ?? buildDefaultLayerState(ev.toIndex);
                    layersState.set(ev.fromIndex, to);
                    layersState.set(ev.toIndex, from);
                }
                break;
            }

            case 'LAYER_OPACITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, opacity: ev.layerOpacity ?? layer.opacity });
                break;
            }

            case 'LAYER_VISIBILITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, visible: ev.visible ?? layer.visible });
                break;
            }

            case 'LAYER_LOCK': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, locked: ev.locked ?? layer.locked });
                break;
            }

            case 'LAYER_MERGE_DOWN': {
                const source = ev.layerIndex;
                const target = source - 1;
                if (target >= 0) {
                    const finalDest = layerRoute.get(target) ?? target;
                    for (const [key, value] of layerRoute.entries()) {
                        if (value === source) layerRoute.set(key, finalDest);
                    }
                    layerRoute.set(source, finalDest);
                    const layer = layersState.get(source) ?? buildDefaultLayerState(source);
                    layersState.set(source, { ...layer, visible: false });
                }
                break;
            }

            case 'UNDO':
            case 'REDO':
            case 'FLIP_H':
                break;

            default: {
                const _exhaustive: never = ev.type;
                if (import.meta.env.DEV) {
                    console.warn(`[computeTimelineState] Tipo no manejado: "${_exhaustive}"`);
                }
            }
        }
    }

    return {
        spine, active, transforms, hiddenIds,
        layersState, layerRoute, derivedActiveLayerIndex,
        undone, backgroundColor,
    };
}