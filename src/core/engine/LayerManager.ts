// src/core/engine/LayerManager.ts
import type { CanvasEngine } from './CanvasEngine';
import type { HistoryManager } from '../../history/HistoryManager';
import type { EventBus } from '../../input/EventBus';

export class LayerManager {
    private engine: CanvasEngine;
    private history: HistoryManager;
    private eventBus: EventBus;

    constructor(engine: CanvasEngine, history: HistoryManager, eventBus: EventBus) {
        this.engine = engine;
        this.history = history;
        this.eventBus = eventBus;

        eventBus.on('SYNC_LAYERS_CSS', () => this.syncDOM());
    }

    public syncDOM() {
        const state = this.history.getState();

        this.engine.activeLayerIndex = state.derivedActiveLayerIndex;
        const createdSet = new Set(state.createdLayers);

        for (let i = 0; i < 10; i++) {
            const canvas = this.engine.getLayerCanvas(i);
            const layerState = state.layersState.get(i);
            const isCreated = createdSet.has(i);

            // Mantener el orden de z-index dinámico
            const zIndex = state.layerOrder.indexOf(i);
            canvas.style.zIndex = zIndex.toString();

            // === FIX: Ocultar físicamente las capas que ya no existen en createdLayers ===
            if (layerState && isCreated) {
                canvas.style.display = layerState.visible ? 'block' : 'none';
                canvas.style.opacity = layerState.opacity.toString();
            } else {
                canvas.style.display = 'none';
            }
        }

        const createdLayers = Array.from(state.createdLayers);

        this.eventBus.emit('LAYERS_STATE_CHANGED', {
            createdLayers,
            layersState: state.layersState,
            activeLayerIndex: state.derivedActiveLayerIndex,
            layerOrder: state.layerOrder
        });
    }
}