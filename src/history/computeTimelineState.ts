// src/history/computeTimelineState.ts
//
// Patrón: Pure Function + Memoización externa
//
// Esta función es el CORAZÓN del sistema no destructivo.
// Recorre el timeline y deriva el estado actual sin mutar nada.
//
// REGLAS:
//   - No tiene side effects
//   - No conoce el DOM
//   - No conoce IndexedDB
//   - Solo transforma datos en datos
//   - Es testeable sin navegador
//
// EXTENSIBILIDAD:
//   Añadir soporte para un nuevo ActionType = añadir un case en el switch.
//   Nada más cambia.

import type { TimelineEvent, TimelineState, LayerState } from './TimelineTypes';
import { isTransformEvent, isHideEvent } from './TimelineTypes';

// Número máximo de capas — igual que en CanvasEngine
const MAX_LAYERS = 10;

function buildDefaultLayerState(index: number): LayerState {
    return {
        visible: true,
        opacity: 1.0,
        locked: false,
        name: `Capa ${index + 1}`,
    };
}

export function computeTimelineState(timeline: TimelineEvent[]): TimelineState {
    // ── Paso 1: Resolver UNDO/REDO → obtener la spine activa ─────────────
    // La spine es la secuencia de eventos "vivos" (no deshechos)
    const spine: TimelineEvent[] = [];
    const undone: TimelineEvent[] = [];

    for (const event of timeline) {
        if (event.type === 'UNDO') {
            if (spine.length > 0) undone.push(spine.pop()!);
        } else if (event.type === 'REDO') {
            if (undone.length > 0) spine.push(undone.pop()!);
        } else {
            spine.push(event);
            // Cualquier acción nueva limpia el stack de redo
            undone.length = 0;
        }
    }

    // ── Paso 2: Derivar estado desde la spine ────────────────────────────
    const active: TimelineEvent[] = [];
    const transforms = new Map<string, DOMMatrix>();
    const hiddenIds = new Set<string>();
    const layersState = new Map<number, LayerState>();
    const layerRoute = new Map<number, number>();

    let derivedActiveLayerIndex = 0; // <--- INICIALIZAMOS EL FOCO EN LA CAPA 0

    // Inicializar capas con estado por defecto y enrutamiento 1:1
    // (las capas que no han sido creadas explícitamente también existen implícitamente)
    for (let i = 0; i < MAX_LAYERS; i++) {
        layersState.set(i, buildDefaultLayerState(i));
        layerRoute.set(i, i);
    }

    for (const ev of spine) {
        switch (ev.type) {

            // ── Eventos de dibujo → van al array active ──────────────────
            case 'STROKE':
            case 'ERASE':
            case 'FILL':
                active.push(ev);
                break;

            // ── TRANSFORM → acumular matriz afín por stroke ID ────────────
            case 'TRANSFORM':
                if (isTransformEvent(ev)) {
                    const newMatrix = new DOMMatrix(ev.transformMatrix);
                    for (const id of ev.targetIds) {
                        const current = transforms.get(id) ?? new DOMMatrix();
                        current.multiplySelf(newMatrix);
                        transforms.set(id, current);
                    }
                }
                break;

            // ── HIDE → marcar IDs como ocultos ───────────────────────────
            case 'HIDE':
                if (isHideEvent(ev)) {
                    for (const id of ev.targetIds) hiddenIds.add(id);
                }
                break;

            case 'LAYER_CREATE': {
                const existing = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing,
                    name: ev.layerName ?? existing.name,
                    visible: true,
                    locked: false,
                });

                derivedActiveLayerIndex = ev.layerIndex; // <--- Foco automático al crear
                break;
            }

            // ── EL NUEVO EVENTO ───────────────────────────────────────────
            case 'LAYER_SELECT': {
                derivedActiveLayerIndex = ev.layerIndex; // <--- Actualizar el foco
                break;
            }

            // ── DUPLICATE_GROUP → los nuevos strokes YA están en el
            //    timeline como STROKE events. DUPLICATE_GROUP solo es
            //    un marcador para el timelapse y para undo grupal.
            case 'DUPLICATE_GROUP':
                break;

            // ── LAYER_CREATE → registrar capa con nombre ─────────────────
            case 'LAYER_CREATE': {
                const existing = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing,
                    name: ev.layerName ?? existing.name,
                    visible: true,
                    locked: false,
                });
                break;
            }

            // ── LAYER_DELETE → HIDE masivo de todos los strokes de esa capa
            case 'LAYER_DELETE': {
                for (const activeEv of active) {
                    if (activeEv.layerIndex === ev.layerIndex) {
                        hiddenIds.add(activeEv.id);
                    }
                }
                break;
            }

            // ── LAYER_REORDER → intercambiar índices en layersState ───────
            case 'LAYER_REORDER': {
                if (ev.fromIndex != null && ev.toIndex != null) {
                    const from = layersState.get(ev.fromIndex) ?? buildDefaultLayerState(ev.fromIndex);
                    const to = layersState.get(ev.toIndex) ?? buildDefaultLayerState(ev.toIndex);
                    layersState.set(ev.fromIndex, to);
                    layersState.set(ev.toIndex, from);
                }
                break;
            }

            // ── LAYER_OPACITY ─────────────────────────────────────────────
            case 'LAYER_OPACITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing(layer),
                    opacity: ev.layerOpacity ?? layer.opacity,
                });
                break;
            }

            // ── LAYER_VISIBILITY ──────────────────────────────────────────
            case 'LAYER_VISIBILITY': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing(layer),
                    visible: ev.visible ?? layer.visible,
                });
                break;
            }

            // ── LAYER_LOCK ────────────────────────────────────────────────
            case 'LAYER_LOCK': {
                const layer = layersState.get(ev.layerIndex) ?? buildDefaultLayerState(ev.layerIndex);
                layersState.set(ev.layerIndex, {
                    ...existing(layer),
                    locked: ev.locked ?? layer.locked,
                });
                break;
            }

            // ── LAYER_MERGE_DOWN → Enrutamiento Virtual No-Destructivo ────
            case 'LAYER_MERGE_DOWN': {
                const source = ev.layerIndex;
                const target = source - 1;

                if (target >= 0) {
                    // Si el target a su vez ya había sido fusionado hacia otra capa, 
                    // buscamos el destino final real.
                    const finalDest = layerRoute.get(target) ?? target;

                    // Todos los trazos que iban a "source", ahora van a "finalDest"
                    // Y si había capas fusionadas previamente hacia "source", también se actualizan
                    for (const [key, value] of layerRoute.entries()) {
                        if (value === source) {
                            layerRoute.set(key, finalDest);
                        }
                    }
                    layerRoute.set(source, finalDest);

                    // La capa origen queda oculta lógicamente
                    const layer = layersState.get(source) ?? buildDefaultLayerState(source);
                    layersState.set(source, { ...layer, visible: false });
                }
                break;
            }

            // ── Eventos de control → no afectan el estado derivado ────────
            case 'UNDO':
            case 'REDO':
            case 'FLIP_H':
                break;

            // ── TypeScript exhaustiveness check ───────────────────────────
            // Si añades un ActionType nuevo y no lo manejas aquí,
            // TypeScript te avisa en compile time. Patrón never check.
            default: {
                const _exhaustive: never = ev.type;
                if (import.meta.env.DEV) {
                    console.warn(`[computeTimelineState] Tipo no manejado: "${_exhaustive}"`);
                }
            }
        }
    }

    return { spine, active, transforms, hiddenIds, layersState, layerRoute, derivedActiveLayerIndex, undone };
}

// Helper interno para el spread limpio
function existing<T>(val: T): T { return val; }