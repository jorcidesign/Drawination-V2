// src/input/EventBus.ts

// === MAGIA: Usamos 'interface' en lugar de 'type' ===
// Aquí solo declaramos los eventos GLOBALES del Core.
// Las herramientas inyectarán sus propios eventos desde sus propios archivos.
export interface AppEventMap {
    'PLAY_TIMELAPSE': void;
    'DEBUG_DRAW_POINTS': void;
    'CLEAR_ALL': void;
    'RESET_ROTATION': void;
    'FLIP_HORIZONTAL': void;
    'SYNC_UI_SLIDERS': { size: number, opacity: number };
    'SET_COLOR': string;
    'UPDATE_BRUSH_SIZE': number;
    'UPDATE_BRUSH_OPACITY': number;
    'REQUEST_TOOL_SWITCH': string;
}

export class EventBus {
    // El mapa ahora está fuertemente tipado según las llaves de AppEventMap
    private listeners: Map<keyof AppEventMap, Array<(payload?: any) => void>> = new Map();

    public on<K extends keyof AppEventMap>(event: K, callback: (payload: AppEventMap[K]) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    public emit<K extends keyof AppEventMap>(event: K, payload?: AppEventMap[K]) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(payload));
        }
    }
}