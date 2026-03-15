// src/history/DiagnosticsService.ts
//
// EXTENSIÓN (sin romper nada):
//   Añadidos métodos estáticos para trazar eventos en consola.
//   Todos los métodos nuevos son opt-in — nadie los llama hasta que
//   el llamador los invoque explícitamente.
//   Solo activos en import.meta.env.DEV para no contaminar producción.

import type { HistoryManager } from './HistoryManager';
import type { CacheManager } from './CacheManager';
import type { TimelineEvent } from './TimelineTypes';

// Etiquetas legibles para cada tipo de evento del timeline
const EVENT_LABELS: Record<string, string> = {
    STROKE: '✏️  Trazo',
    ERASE: '🧽 Borrado',
    FILL: '🪣 Relleno',
    TRANSFORM: '↔️  Transform',
    HIDE: '👁️  Ocultar',
    DUPLICATE_GROUP: '📋 Duplicar',
    LAYER_CREATE: '➕ Capa nueva',
    LAYER_DELETE: '🗑️  Capa borrada',
    LAYER_REORDER: '↕️  Reorden capa',
    LAYER_OPACITY: '🔆 Opacidad capa',
    LAYER_VISIBILITY: '👁️  Visibilidad',
    LAYER_LOCK: '🔒 Bloqueo',
    LAYER_MERGE_DOWN: '⏬ Merge down',
    LAYER_SELECT: '🎯 Seleccionar capa', // <--- NUEVO
    UNDO: '↩️  Undo',
    REDO: '↪️  Redo',
    FLIP_H: '🪞 Flip H',
};

// Nombres legibles de profiles
const PROFILE_LABELS: Record<string, string> = {
    'pencil-hb': 'Lápiz HB',
    'ink-pen': 'Tinta',
    'eraser-hard': 'Borrador',
    'solid-fill': 'Relleno',
    'oil-brush': 'Óleo',
    'hard-round': 'Hard Round',
    'airbrush': 'Aerógrafo',
    'charcoal': 'Carboncillo',
};

// Nombres legibles de herramientas
const TOOL_LABELS: Record<string, string> = {
    'pencil': '✏️  Lápiz',
    'eraser': '🧽 Borrador',
    'vector-eraser': '💥 Borrador Vectorial',
    'lasso': '🔲 Lazo',
    'transform-handle': '⬛ Transform Handle',
    'move': '✋ Mover',
    'pan': '🖐️  Pan',
    'zoom': '🔍 Zoom',
    'rotate': '🔄 Rotar',
};

export class DiagnosticsService {

    // ── Métricas de rendimiento y estado del Timeline ─────────────────────
    public static async printMetrics(
        actionTimeMs: number,
        history: HistoryManager,
        cache: CacheManager
    ) {
        if (!import.meta.env.DEV) return;

        const estimate = navigator.storage && navigator.storage.estimate
            ? await navigator.storage.estimate()
            : { usage: 0, quota: 0 };

        const usageMB = (estimate.usage || 0) / (1024 * 1024);
        const quotaMB = (estimate.quota || 0) / (1024 * 1024);

        let jsHeap = 0;
        if ((performance as any).memory) {
            jsHeap = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
        }

        const memSnaps = (cache as any).getStats ? (cache as any).getStats().memoryCacheSize : 0;
        const totalEvents = history.getActiveEvents().length;
        const bytesRam = history.timeline.reduce(
            (acc, ev) => acc + (ev.data ? ev.data.byteLength : 0), 0
        );

        // Obtener info del evento recién commiteado
        const lastEvent = history.timeline[history.timeline.length - 1];
        const eventLabel = lastEvent ? (EVENT_LABELS[lastEvent.type] ?? lastEvent.type) : '?';
        const profileLabel = lastEvent ? (PROFILE_LABELS[lastEvent.profileId] ?? lastEvent.profileId ?? '') : '';
        const layerStr = lastEvent && lastEvent.layerIndex !== undefined ? ` [Capa ${lastEvent.layerIndex}]` : '';

        console.groupCollapsed(
            `%c${eventLabel} #${totalEvents}${layerStr}${profileLabel ? ' · ' + profileLabel : ''} | ${actionTimeMs.toFixed(1)}ms`,
            'color: #00d2ff; font-weight: bold;'
        );
        console.log(`%c💾 Disco: %c${usageMB.toFixed(2)} MB %c(de ${quotaMB.toFixed(0)} MB)`,
            'font-weight:bold', 'color:#ffaa00', 'color:gray');
        console.log(`%c🧠 RAM V8: %c${jsHeap > 0 ? jsHeap.toFixed(2) + ' MB' : 'N/A'}`,
            'font-weight:bold', 'color:#00ff00');
        console.log(`%c⚡ Cache: %c${memSnaps}/20 snapshots`,
            'font-weight:bold', 'color:#00ff00');
        console.log(`%c🗜️  Vectores RAM: %c${(bytesRam / 1024).toFixed(2)} KB`,
            'font-weight:bold', 'color:#ff00ff');
        console.groupEnd();
    }

    // ── Log visual de eventos (Ahora incluye la Capa) ─────────────────────
    public static logEvent(event: TimelineEvent): void {
        if (!import.meta.env.DEV) return;

        const label = EVENT_LABELS[event.type] ?? event.type;
        const profile = PROFILE_LABELS[event.profileId] ?? event.profileId;
        const layerStr = event.layerIndex !== undefined ? `[Capa ${event.layerIndex}]` : '';

        switch (event.type) {
            case 'STROKE':
            case 'ERASE':
            case 'FILL': {
                const sizeStr = `${event.size}px`;
                const opStr = `${Math.round(event.opacity * 100)}%`;
                console.log(
                    `%c${label} %c${layerStr}%c ${profile} %c${sizeStr} ${opStr} %c${event.color}`,
                    'color:#fff;background:#2c3e50;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold', // Amarillo vibrante para la capa
                    'color:#adf',
                    'color:#aaa',
                    `color:${event.color};font-weight:bold`,
                );
                break;
            }
            case 'TRANSFORM': {
                const ids = event.targetIds?.length ?? 0;
                const m = event.transformMatrix ?? [];
                const dx = m[4]?.toFixed(1) ?? '?';
                const dy = m[5]?.toFixed(1) ?? '?';
                console.log(
                    `%c${label} %c${layerStr}%c ${ids} trazo(s) %cdx:${dx} dy:${dy}`,
                    'color:#fff;background:#e67e22;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold',
                    'color:#fa0', 'color:#aaa',
                );
                break;
            }
            case 'HIDE': {
                const ids = event.targetIds?.length ?? 0;
                const toolName = TOOL_LABELS[event.toolId] ?? event.toolId;
                console.log(
                    `%c${label} %c${layerStr}%c ${toolName} ocultó ${ids} trazo(s)`,
                    'color:#fff;background:#8e44ad;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold',
                    'color:#c8a',
                );
                break;
            }
            case 'LAYER_CREATE':
            case 'LAYER_DELETE':
            case 'LAYER_VISIBILITY':
            case 'LAYER_MERGE_DOWN': {
                console.log(
                    `%c${label} %c${layerStr}`,
                    'color:#fff;background:#27ae60;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold'
                );
                break;
            }
            case 'LAYER_SELECT': { // <--- AÑADIDO
                console.log(
                    `%c${label} %c${layerStr}`,
                    'color:#fff;background:#27ae60;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold'
                );
                break;
            }
            default:
                console.log(
                    `%c${label} %c${layerStr}`,
                    'color:#fff;background:#555;padding:1px 4px;border-radius:3px',
                    'color:#f1c40f;font-weight:bold'
                );
        }
    }

    // ── Cambio de herramienta activa ──────────────────────────────────────
    public static logToolSwitch(toolId: string): void {
        if (!import.meta.env.DEV) return;
        const label = TOOL_LABELS[toolId] ?? toolId;
        console.log(`%c🔧 Herramienta: ${label}`, 'color:#2ecc71;font-weight:bold');
    }

    // ── Resultado de selección con lazo ───────────────────────────────────
    public static logSelection(count: number): void {
        if (!import.meta.env.DEV) return;
        if (count === 0) {
            console.log('%c🔲 Lazo: sin selección', 'color:#aaa');
        } else {
            console.log(
                `%c🔲 Lazo: %c${count} trazo(s) seleccionado(s) → Transform Handle activado`,
                'color:#00a8ff;font-weight:bold', 'color:#aaa'
            );
        }
    }

    // ── Transform Handle confirm / cancel ─────────────────────────────────
    public static logTransformEnd(action: 'confirm' | 'cancel'): void {
        if (!import.meta.env.DEV) return;
        if (action === 'confirm') {
            console.log('%c⬛ Transform Handle: confirmado (Enter)', 'color:#2ecc71');
        } else {
            console.log('%c⬛ Transform Handle: cancelado (Escape)', 'color:#e74c3c');
        }
    }

    // ── Undo / Redo con contexto del evento afectado ──────────────────────
    public static logUndoRedo(action: 'UNDO' | 'REDO', event: TimelineEvent | null): void {
        if (!import.meta.env.DEV) return;
        const icon = action === 'UNDO' ? '↩️' : '↪️';
        if (!event) {
            console.log(`%c${icon} ${action}: nada que ${action === 'UNDO' ? 'deshacer' : 'rehacer'}`, 'color:#aaa');
            return;
        }
        const label = EVENT_LABELS[event.type] ?? event.type;
        const layerStr = event.layerIndex !== undefined ? ` [Capa ${event.layerIndex}]` : '';

        console.log(
            `%c${icon} ${action}: %c${label}${layerStr}`,
            'color:#f39c12;font-weight:bold', 'color:#aaa'
        );
    }
}