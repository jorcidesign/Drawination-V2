// src/history/DiagnosticsService.ts

import type { HistoryManager } from './HistoryManager';
import type { CacheManager } from './CacheManager';
import type { TimelineEvent } from './TimelineTypes';

const EVENT_LABELS: Record<string, string> = {
    STROKE: '✏️  Trazo', ERASE: '🧽 Borrado', FILL: '🪣 Relleno',
    TRANSFORM: '↔️  Transform', HIDE: '👁️  Ocultar', DUPLICATE_GROUP: '📋 Duplicar',
    LAYER_CREATE: '➕ Capa nueva', LAYER_DELETE: '🗑️  Capa borrada',
    LAYER_REORDER: '↕️  Reorden capa', LAYER_OPACITY: '🔆 Opacidad capa',
    LAYER_VISIBILITY: '👁️  Visibilidad', LAYER_LOCK: '🔒 Bloqueo',
    LAYER_MERGE_DOWN: '⏬ Merge down', LAYER_SELECT: '🎯 Seleccionar capa',
    LAYER_DUPLICATE: '📋 Duplicar capa',
    UNDO: '↩️  Undo', REDO: '↪️  Redo', FLIP_H: '🪞 Flip H',
};

const PROFILE_LABELS: Record<string, string> = {
    'pencil-hb': 'Lápiz HB', 'ink-pen': 'Tinta', 'eraser-hard': 'Borrador',
    'solid-fill': 'Relleno', 'oil-brush': 'Óleo', 'hard-round': 'Hard Round',
    'airbrush': 'Aerógrafo', 'charcoal': 'Carboncillo',
};

const TOOL_LABELS: Record<string, string> = {
    'pencil': '✏️  Lápiz', 'eraser': '🧽 Borrador', 'vector-eraser': '💥 Borrador Vectorial',
    'lasso': '🔲 Lazo', 'transform-handle': '⬛ Transform Handle', 'move': '✋ Mover',
    'pan': '🖐️  Pan', 'zoom': '🔍 Zoom', 'rotate': '🔄 Rotar',
};

export class DiagnosticsService {

    public static async printMetrics(actionTimeMs: number, history: HistoryManager, cache: CacheManager) {
        if (!import.meta.env.DEV) return;
        const memSnaps = (cache as any).getStats ? (cache as any).getStats().memoryCacheSize : 0;
        const totalEvents = history.getActiveEvents().length;
        const lastEvent = history.timeline[history.timeline.length - 1];
        const eventLabel = lastEvent ? (EVENT_LABELS[lastEvent.type] ?? lastEvent.type) : '?';
        const profileLabel = lastEvent ? (PROFILE_LABELS[lastEvent.profileId] ?? lastEvent.profileId ?? '') : '';
        const layerStr = lastEvent && lastEvent.layerIndex !== undefined ? ` [Capa ${lastEvent.layerIndex}]` : '';

        console.groupCollapsed(
            `%c${eventLabel} #${totalEvents}${layerStr}${profileLabel ? ' · ' + profileLabel : ''} | ${actionTimeMs.toFixed(1)}ms`,
            'color: #00d2ff; font-weight: bold;'
        );
        console.log(`%c⚡ Cache: %c${memSnaps}/20 snapshots`, 'font-weight:bold', 'color:#00ff00');
        console.groupEnd();
    }

    public static logEvent(event: TimelineEvent): void {
        if (!import.meta.env.DEV) return;
        const label = EVENT_LABELS[event.type] ?? event.type;
        const profile = PROFILE_LABELS[event.profileId] ?? event.profileId;
        const layerStr = event.layerIndex !== undefined ? `[Capa ${event.layerIndex}]` : '';

        switch (event.type) {
            case 'STROKE': case 'ERASE': case 'FILL':
                console.log(`%c${label} %c${layerStr}%c ${profile}`, 'color:#fff;background:#2c3e50;padding:1px 4px;border-radius:3px;font-weight:bold', 'color:#f1c40f;font-weight:bold', 'color:#adf');
                break;
            case 'TRANSFORM':
                console.log(`%c${label} %c${layerStr}%c ${event.targetIds?.length ?? 0} trazo(s)`, 'color:#fff;background:#e67e22;padding:1px 4px;border-radius:3px;font-weight:bold', 'color:#f1c40f;font-weight:bold', 'color:#fa0');
                break;
            case 'HIDE':
                console.log(`%c${label} %c${layerStr}%c Ocultó ${event.targetIds?.length ?? 0} trazo(s)`, 'color:#fff;background:#8e44ad;padding:1px 4px;border-radius:3px;font-weight:bold', 'color:#f1c40f;font-weight:bold', 'color:#c8a');
                break;
            case 'DUPLICATE_GROUP':
                console.log(
                    `%c${label} %c${layerStr}%c ${(event as any).clonePayloads?.length ?? 0} clon(es) atómicos`,
                    'color:#fff;background:#2ecc71;padding:1px 4px;border-radius:3px;font-weight:bold',
                    'color:#f1c40f;font-weight:bold',
                    'color:#fff',
                );
                break;
            case 'LAYER_CREATE': case 'LAYER_DELETE': case 'LAYER_VISIBILITY': case 'LAYER_MERGE_DOWN': case 'LAYER_SELECT': case 'LAYER_DUPLICATE':
                console.log(`%c${label} %c${layerStr}`, 'color:#fff;background:#27ae60;padding:1px 4px;border-radius:3px;font-weight:bold', 'color:#f1c40f;font-weight:bold');
                break;
            default:
                console.log(`%c${label} %c${layerStr}`, 'color:#fff;background:#555;padding:1px 4px;border-radius:3px', 'color:#f1c40f;font-weight:bold');
        }
    }

    public static logToolSwitch(toolId: string): void {
        if (!import.meta.env.DEV) return;
        const label = TOOL_LABELS[toolId] ?? toolId;
        console.log(`%c🔧 Herramienta: ${label}`, 'color:#2ecc71;font-weight:bold');
    }

    public static logSelection(count: number): void {
        if (!import.meta.env.DEV) return;
        if (count > 0) console.log(`%c🔲 Lazo: %c${count} trazo(s) seleccionado(s) → Transform Handle activado`, 'color:#00a8ff;font-weight:bold', 'color:#aaa');
    }

    public static logUndoRedo(action: 'UNDO' | 'REDO', event: TimelineEvent | null): void {
        if (!import.meta.env.DEV) return;
        const icon = action === 'UNDO' ? '↩️' : '↪️';
        if (!event) return;
        const label = EVENT_LABELS[event.type] ?? event.type;
        const layerStr = event.layerIndex !== undefined ? ` [Capa ${event.layerIndex}]` : '';
        console.log(`%c${icon} ${action}: %c${label}${layerStr}`, 'color:#f39c12;font-weight:bold', 'color:#aaa');
    }

    public static logDuplicate(
        phase: 'start' | 'missing_data' | 'no_payloads' | 'done',
        detail: number | string,
    ): void {
        if (!import.meta.env.DEV) return;

        switch (phase) {
            case 'start':
                console.log(
                    `%c📋 Duplicate: inicio — ${detail} trazo(s) seleccionado(s)`,
                    'color:#2ecc71;font-weight:bold',
                );
                break;
            case 'missing_data':
                console.warn(
                    `%c📋 Duplicate: sin datos para id ${detail} — se omite`,
                    'color:#e67e22',
                );
                break;
            case 'no_payloads':
                console.warn(
                    '%c📋 Duplicate: sin payloads — operación cancelada',
                    'color:#e74c3c',
                );
                break;
            case 'done':
                console.log(
                    `%c📋 Duplicate: ✅ evento atómico creado con ${detail} clon(es). Un solo Ctrl+Z lo deshace todo.`,
                    'color:#2ecc71;font-weight:bold',
                );
                break;
        }
    }

    public static logTransformState(
        reason: string,
        actionType: 'move' | 'scale' | 'rotate' | 'none' | boolean
    ): void {
        if (!import.meta.env.DEV) return;

        let actionText = '';
        let color = '';

        switch (reason) {
            case 'enter':
                actionText = '✅ Confirmado (Enter)';
                color = '#2ecc71';
                break;
            case 'escape':
                actionText = '❌ Abortado (Escape)';
                color = '#e74c3c';
                break;
            case 'click_outside':
                actionText = '🖱️ Confirmado (Click afuera)';
                color = '#3498db';
                break;
            case 'system_interruption':
                actionText = '⚠️ Interrupción Global';
                color = '#f39c12';
                break;
            case 'delete': case 'DELETE':
                actionText = '🗑️ Eliminado';
                color = '#e74c3c';
                break;
            case 'duplicate':
                actionText = '📋 Duplicado';
                color = '#27ae60';
                break;
            case 'flip_h': case 'flip_v':
                actionText = '🪞 Espejado';
                color = '#9b59b6';
                break;

            // ── Estados de la máquina de undo/redo ────────────────────────
            case 'resurrect_undo':
                actionText = '⏪ [FOCO] Abriendo handle pre-undo';
                color = '#9b59b6';
                break;
            case 'resurrect_redo':
                actionText = '⏩ [FOCO] Abriendo handle pre-redo';
                color = '#9b59b6';
                break;
            case 'travel_undo':
                actionText = '⏪ [VIAJE] Aplicando undo histórico (handle abierto)';
                color = '#3498db';
                break;
            case 'travel_redo':
                actionText = '⏩ [VIAJE] Aplicando redo histórico (handle abierto)';
                color = '#3498db';
                break;
            case 'undo_exit':
                actionText = '⏪ [SALIDA] Cerrando handle antes del undo';
                color = '#e67e22';
                break;
            case 'redo_exit':
                actionText = '⏩ [SALIDA] Cerrando handle antes del redo';
                color = '#e67e22';
                break;

            default: {
                const toolName = TOOL_LABELS[reason] ?? reason;
                actionText = `⚠️ Interrumpido por [${toolName}]`;
                color = '#f39c12';
            }
        }

        const noMoveText = ['duplicate', 'delete', 'DELETE', 'flip_h', 'flip_v',
            'travel_undo', 'travel_redo', 'undo_exit', 'redo_exit'].includes(reason);

        if (noMoveText || reason.startsWith('resurrect')) {
            console.log(`%c⬛ Transform Handle: ${actionText}`, `color:${color}; font-weight:bold;`);
            return;
        }

        let moveText = 'sin alteraciones';
        if (actionType === 'scale') moveText = 'se reescaló (genera evento en historial)';
        else if (actionType === 'rotate') moveText = 'se rotó (genera evento en historial)';
        else if (actionType === 'move' || actionType === true) moveText = 'se movió (genera evento en historial)';

        console.log(`%c⬛ Transform Handle: ${actionText} — ${moveText}`, `color:${color}; font-weight:bold;`);
    }
}