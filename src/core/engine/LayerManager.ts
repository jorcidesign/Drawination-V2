// src/core/engine/LayerManager.ts
import type { CanvasEngine } from './CanvasEngine';
import type { HistoryManager } from '../../history/HistoryManager';
import type { EventBus } from '../../input/EventBus';

export class LayerManager {
    private engine: CanvasEngine;
    private history: HistoryManager;

    constructor(engine: CanvasEngine, history: HistoryManager, eventBus: EventBus) {
        this.engine = engine;
        this.history = history;

        // Nos suscribimos a los cambios de capa para actualizar el DOM
        eventBus.on('SYNC_LAYERS_CSS', () => this.syncDOM());
    }

    public syncDOM() {
        const state = this.history.getState();

        // === EL FIX DEL BUG DE CTRL+Z ===
        // El motor físico ya no es dueño de la verdad. Obedece a la historia.
        this.engine.activeLayerIndex = state.derivedActiveLayerIndex;

        for (let i = 0; i < 10; i++) {
            const canvas = this.engine.getLayerCanvas(i);
            const layerState = state.layersState.get(i);

            if (layerState) {
                canvas.style.display = layerState.visible ? 'block' : 'none';
                canvas.style.opacity = layerState.opacity.toString();
            }
        }
    }
}