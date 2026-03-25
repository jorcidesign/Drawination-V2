// src/history/computeTimelineState.ts
import type { TimelineEvent, TimelineState, LayerState } from './TimelineTypes';
import { isTransformEvent, isHideEvent } from './TimelineTypes';

const MAX_LAYERS = 10;
export const DEFAULT_BACKGROUND_COLOR = '#FAFAFA';

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
            const count = event.undoCount ?? 1;
            for (let c = 0; c < count; c++) {
                if (spine.length > 0) undone.push(spine.pop()!);
            }
        } else if (event.type === 'REDO') {
            const count = event.undoCount ?? 1;
            for (let c = 0; c < count; c++) {
                if (undone.length > 0) spine.push(undone.pop()!);
            }
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

    const createdLayers = new Set<number>([0]);
    let layerOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let derivedActiveLayerIndex = 0;
    let backgroundColor = DEFAULT_BACKGROUND_COLOR;

    for (let i = 0; i < MAX_LAYERS; i++) {
        layersState.set(i, buildDefaultLayerState(i));
        layerRoute.set(i, i);
    }

    for (const ev of spine) {
        switch (ev.type) {
            case 'STROKE': case 'ERASE': case 'FILL':
                active.push(ev); break;

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
                if (isHideEvent(ev)) { for (const id of ev.targetIds) hiddenIds.add(id); }
                break;

            case 'BACKGROUND_COLOR':
                if (ev.backgroundColor) backgroundColor = ev.backgroundColor;
                break;

            case 'LAYER_SELECT':
                derivedActiveLayerIndex = ev.layerIndex;
                break;

            case 'LAYER_CREATE': {
                const existing = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing,
                    name: ev.layerName ?? `Capa ${ev.layerIndex + 1}`,
                    visible: true,
                    locked: ev.locked ?? false,
                    opacity: ev.layerOpacity ?? 1.0
                });
                createdLayers.add(ev.layerIndex);
                derivedActiveLayerIndex = ev.layerIndex;
                break;
            }

            case 'LAYER_DELETE': {
                createdLayers.delete(ev.layerIndex);

                if (derivedActiveLayerIndex === ev.layerIndex) {
                    const currentOrder = ev.layerOrder ?? layerOrder;
                    const currentPos = currentOrder.indexOf(ev.layerIndex);
                    let newActive = -1;
                    for (let i = currentPos - 1; i >= 0; i--) {
                        if (createdLayers.has(currentOrder[i])) { newActive = currentOrder[i]; break; }
                    }
                    if (newActive === -1) {
                        for (let i = currentPos + 1; i < currentOrder.length; i++) {
                            if (createdLayers.has(currentOrder[i])) { newActive = currentOrder[i]; break; }
                        }
                    }
                    derivedActiveLayerIndex = newActive !== -1 ? newActive : 0;
                }
                break;
            }

            case 'LAYER_VISIBILITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, visible: ev.visible ?? layer.visible });
                break;
            }

            case 'LAYER_OPACITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, opacity: ev.layerOpacity ?? layer.opacity });
                break;
            }

            case 'LAYER_LOCK': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, { ...layer, locked: ev.locked ?? layer.locked });
                break;
            }

            case 'LAYER_REORDER': {
                if (ev.layerOrder) {
                    // === FIX: Confiamos ciegamente en el payload del evento que ahora siempre trae los 10 elementos
                    layerOrder = [...ev.layerOrder];
                }
                break;
            }

            case 'LAYER_MERGE_DOWN': {
                const source = ev.layerIndex;
                const orderToUse = ev.layerOrder ?? layerOrder;
                const currentIndexInOrder = orderToUse.indexOf(source);
                let target = -1;

                for (let i = currentIndexInOrder - 1; i >= 0; i--) {
                    if (createdLayers.has(orderToUse[i])) {
                        target = orderToUse[i];
                        break;
                    }
                }

                if (target >= 0) {
                    const finalDest = layerRoute.get(target) ?? target;
                    for (const [key, value] of layerRoute.entries()) {
                        if (value === source) layerRoute.set(key, finalDest);
                    }
                    layerRoute.set(source, finalDest);
                    createdLayers.delete(source);

                    if (derivedActiveLayerIndex === source) {
                        derivedActiveLayerIndex = finalDest;
                    }
                }
                break;
            }

            case 'DUPLICATE_GROUP':
            case 'UNDO':
            case 'REDO':
            case 'FLIP_H':
                break;
        }
    }

    return {
        spine, active, transforms, hiddenIds,
        layersState, layerRoute, derivedActiveLayerIndex,
        undone, backgroundColor, createdLayers, layerOrder
    };
}