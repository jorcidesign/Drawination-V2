// src/input/EventBus.ts

// Definimos los eventos exactos que existen en la app para tener autocompletado y tipado estricto
// Añade 'SET_TOOL_PENCIL' y 'SET_TOOL_ERASER' a tus AppEvents en EventBus.ts
// src/input/EventBus.ts (Actualiza la línea de AppEvent)
export type AppEvent =
    'PLAY_TIMELAPSE' | 'DEBUG_DRAW_POINTS' | 'CLEAR_ALL' | 'RESET_ROTATION' | 'FLIP_HORIZONTAL' |
    'SET_TOOL_PENCIL' | 'SET_TOOL_ERASER' | 'SET_PROFILE_INK' | 'SET_PROFILE_PENCIL' |
    'UPDATE_BRUSH_SIZE' | 'UPDATE_BRUSH_OPACITY' | 'SYNC_UI_SLIDERS' | 'SET_COLOR' | 'SET_PROFILE_FILL'; // <--- AQUÍ ESTÁ EL INVITADO
type EventHandler = (payload?: any) => void;

export class EventBus {
    private listeners: Map<AppEvent, EventHandler[]> = new Map();

    public on(event: AppEvent, callback: EventHandler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    public emit(event: AppEvent, payload?: any) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(payload));
        }
    }
}