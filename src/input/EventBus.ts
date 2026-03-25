// src/input/EventBus.ts
import type { TimelineEvent, LayerState } from '../history/TimelineTypes';

export interface LayersStatePayload {
    createdLayers: number[];
    layersState: Map<number, LayerState>;
    activeLayerIndex: number;
    layerOrder: number[];
}

export interface AppEventMap {
    'PLAY_TIMELAPSE': void;
    'DEBUG_DRAW_POINTS': void;
    'CLEAR_ALL': void;
    'RESET_ROTATION': void;
    'FLIP_HORIZONTAL': void;
    // === FIX: Agregamos profileId ===
    'SYNC_UI_SLIDERS': { size: number; opacity: number; minSize?: number; maxSize?: number; profileId?: string };
    'GLOBAL_INTERRUPTION': void;
    'SYNC_LAYERS_CSS': void;
    'LAYERS_STATE_CHANGED': LayersStatePayload;
    'SET_COLOR': string;
    'APPLY_COLOR': string;
    'UPDATE_BRUSH_SIZE': number;
    'UPDATE_BRUSH_OPACITY': number;
    'REQUEST_TOOL_SWITCH': string;
    'ACTIVE_TOOL_CHANGED': string;
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
    'SET_PROFILE_STYLIZED': void;
    'TOGGLE_COLOR_PANEL': void;
    'TOGGLE_COLOR_PANEL_FOR_BG': void;
    'TOGGLE_LAYER_PANEL': void;
    'LAYER_PANEL_STATE_CHANGED': boolean;
    'TOGGLE_MENU_PANEL': void;
    'SHOW_NEW_PROJECT': void;
    'NEW_PROJECT': { width: number; height: number };
    'BACKGROUND_COLOR_PREVIEW': string;
    'BACKGROUND_COLOR_CHANGED': string;
    'BACKGROUND_TOOL_ACTIVE': boolean;

    'LAYER_ACTION_CREATE': void;
    'LAYER_ACTION_SELECT': number;
    'LAYER_ACTION_TOGGLE_VISIBILITY': number;
    'LAYER_ACTION_DELETE': number;
    'LAYER_ACTION_REORDER': number[];
    'LAYER_ACTION_OPACITY': { layerIndex: number; opacity: number };
    'LAYER_ACTION_LOCK': number;
    'LAYER_ACTION_DUPLICATE': number;
    'LAYER_ACTION_MERGE': number;

    'DOWNLOAD_PNG': void;
    'DOWNLOAD_VIDEO': void;
    'REQUEST_UNDO': void;
    'REQUEST_REDO': void;
    'VIEWPORT_CHANGED': { zoom: number; angle: number };
    'VIEWPORT_ZOOM_SET': number;
    'VIEWPORT_ANGLE_SET': number;
    'RESET_ZOOM': void;
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