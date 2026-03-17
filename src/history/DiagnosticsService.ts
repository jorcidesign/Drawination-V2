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
            case 'DUPLICATE_GROUP': // <--- AÑADIDO PARA LA ACCIÓN DUPLICAR
                console.log(`%c${label} %c${layerStr}%c Duplicó ${event.sourceIds?.length ?? 0} trazo(s)`, 'color:#fff;background:#2ecc71;padding:1px 4px;border-radius:3px;font-weight:bold', 'color:#f1c40f;font-weight:bold', 'color:#fff');
                break;
            case 'LAYER_CREATE': case 'LAYER_DELETE': case 'LAYER_VISIBILITY': case 'LAYER_MERGE_DOWN': case 'LAYER_SELECT':
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

    // === FIX: Manejo flexible para 'actionType' que previene crasheos por tipos viejos (booleanos) o nuevos (strings) ===
    public static logTransformState(reason: string, actionType: 'move' | 'scale' | 'rotate' | 'none' | boolean): void {
        if (!import.meta.env.DEV) return;

        let actionText = '';
        let color = '';

        if (reason === 'enter') {
            actionText = '✅ Confirmado (Enter)';
            color = '#2ecc71';
        } else if (reason === 'escape') {
            actionText = '❌ Abortado (Escape)';
            color = '#e74c3c';
        } else if (reason === 'click_outside') {
            actionText = '🖱️ Confirmado (Click afuera)';
            color = '#3498db';
        } else if (reason === 'system_interruption') {
            actionText = '⚠️ Interrupción Global (Capa / Timelapse / Clear)';
            color = '#f39c12';
        } else if (reason === 'delete' || reason === 'DELETE') {
            actionText = '🗑️ Eliminado (UI o Suprimir)';
            color = '#e74c3c';
        } else if (reason === 'duplicate') { // <--- AÑADIDO
            actionText = '📋 Duplicado (Desde UI)';
            color = '#27ae60';
        } else if (reason === 'flip_h' || reason === 'flip_v') { // <--- AÑADIDO
            actionText = '🪞 Espejado (Desde UI)';
            color = '#9b59b6';
        } else if (reason === 'resurrect_undo') {
            actionText = '⏪ Resucitado (Por Ctrl+Z)';
            color = '#9b59b6';
        } else if (reason === 'resurrect_redo') {
            actionText = '⏩ Resucitado (Por Ctrl+Y)';
            color = '#9b59b6';
        } else {
            const toolName = TOOL_LABELS[reason] ?? reason;
            actionText = `⚠️ Interrumpido por herramienta [${toolName}]`;
            color = '#f39c12';
        }

        let moveText = 'sin alteraciones (Sin evento, no le afectará el Ctrl+Z).';
        if (actionType === 'scale') moveText = 'se reescaló (Generó evento en historia, le afectará el Ctrl+Z).';
        else if (actionType === 'rotate') moveText = 'se rotó (Generó evento en historia, le afectará el Ctrl+Z).';
        else if (actionType === 'move' || actionType === true) moveText = 'se movió (Generó evento en historia, le afectará el Ctrl+Z).';

        // Acciones instantáneas de la UI Contextual (Ya emiten su propio logEvent arriba, no necesitan texto de movimiento)
        if (reason === 'duplicate' || reason === 'delete' || reason === 'DELETE' || reason.startsWith('flip')) {
            console.log(`%c⬛ Transform Handle: ${actionText}`, `color:${color}; font-weight:bold;`);
            return;
        }

        if (reason.startsWith('resurrect')) {
            console.log(`%c⬛ Transform Handle: ${actionText} — Retomando control.`, `color:${color}; font-weight:bold;`);
        } else {
            console.log(`%c⬛ Transform Handle: ${actionText} — ${moveText}`, `color:${color}; font-weight:bold;`);
        }
    }
}