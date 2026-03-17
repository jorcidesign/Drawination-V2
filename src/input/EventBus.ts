// src/input/EventBus.ts
import type { TimelineEvent } from '../history/TimelineTypes';

export interface AppEventMap {
    'PLAY_TIMELAPSE': void;
    'DEBUG_DRAW_POINTS': void;
    'CLEAR_ALL': void;
    'RESET_ROTATION': void;
    'FLIP_HORIZONTAL': void;

    'SYNC_UI_SLIDERS': { size: number; opacity: number; minSize?: number; maxSize?: number };
    'GLOBAL_INTERRUPTION': void;
    'SYNC_LAYERS_CSS': void;

    'SET_COLOR': string;
    'UPDATE_BRUSH_SIZE': number;
    'UPDATE_BRUSH_OPACITY': number;
    'REQUEST_TOOL_SWITCH': string;

    // ── Acciones de la Barra Contextual (NUEVO) ───────────────────────────
    'TOGGLE_LASSO_MODE': 'partial' | 'total';
    'SELECTION_DELETE': void;
    'SELECTION_DUPLICATE': void;
    'SELECTION_FLIP_H': void;
    'SELECTION_FLIP_V': void;

    'HISTORY_RESTORED': { event: TimelineEvent; action: 'UNDO' | 'REDO' };
    'REQUEST_TRANSFORM_HANDLE_REFRESH': { targetIds: string[] };

    'HIDE_UNDONE': { targetIds: string[] };
    'HIDE_REDONE': { targetIds: string[] };

    'SET_TOOL_ERASER': void;
    'SET_TOOL_PENCIL': void;
    'SET_TOOL_VECTOR_ERASER': void;
    'SET_PROFILE_INK': void;
    'SET_PROFILE_PENCIL': void;
    'SET_PROFILE_FILL': void;
    'SET_PROFILE_PAINT': void;
    'SET_PROFILE_HARD_ROUND': void;
    'SET_PROFILE_AIRBRUSH': void;
    'SET_PROFILE_CHARCOAL': void;
}

export class EventBus {
    private listeners: Map<keyof AppEventMap, Array<(payload?: any) => void>> = new Map();

    public on<K extends keyof AppEventMap>(event: K, callback: (payload: AppEventMap[K]) => void): void {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(callback);
    }

    public off<K extends keyof AppEventMap>(event: K, callback: (payload: AppEventMap[K]) => void): void {
        const listeners = this.listeners.get(event);
        if (!listeners) return;
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
    }

    public emit<K extends keyof AppEventMap>(event: K, payload?: AppEventMap[K]): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) [...callbacks].forEach(cb => cb(payload));
    }
}