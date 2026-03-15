// src/history/commands/LayerCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent, ActionType } from '../TimelineTypes';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { CommandFactory } from './CommandFactory';

export class LayerCommand implements ICommand {
    private event: TimelineEvent;

    // Aceptamos el brush para cumplir con la firma de CommandConstructor
    constructor(event: TimelineEvent, _brush: BrushEngine) {
        this.event = event;
    }

    public get id() { return this.event.id; }
    public get type(): ActionType { return this.event.type; }

    // Los eventos de capa son pura metadata, no tienen ArrayBuffer
    public async loadDataIfNeeded(_storage: StorageManager): Promise<void> { }

    // No dibujan nada directamente, el CanvasRebuilder los salta
    // Su estado se procesa globalmente en computeTimelineState
    public execute(_ctx: CanvasRenderingContext2D): void { }

    public getRawData(): ArrayBuffer | null { return null; }
}

// Auto-registro masivo para todos los eventos de capa
const layerEvents: ActionType[] = [
    'LAYER_CREATE',
    'LAYER_DELETE',
    'LAYER_REORDER',
    'LAYER_OPACITY',
    'LAYER_VISIBILITY',
    'LAYER_LOCK',
    'LAYER_MERGE_DOWN',
    'LAYER_SELECT'
];

for (const type of layerEvents) {
    CommandFactory.register(type, LayerCommand);
}