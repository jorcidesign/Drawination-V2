// src/history/commands/BackgroundColorCommand.ts
//
// Comando para el evento BACKGROUND_COLOR.
// No dibuja nada — el color de fondo es CSS puro en el transformContainer.
// onAfterUndo / onAfterRedo re-aplican el color derivado del estado actual.

import type { ICommand, CommandContext } from './ICommand';
import type { TimelineEvent } from '../TimelineTypes';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { BoundingBox } from '../../core/math/BoundingBox';
import { CommandFactory } from './CommandFactory';

export class BackgroundColorCommand implements ICommand {
    private event: TimelineEvent;
    public transform?: number[];

    constructor(event: TimelineEvent, _brush: BrushEngine) {
        this.event = event;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox(): BoundingBox | undefined { return undefined; }

    public async loadDataIfNeeded(_storage: StorageManager): Promise<void> { }
    public execute(_ctx: CanvasRenderingContext2D): void { }
    public getRawData(): ArrayBuffer | null { return null; }

    // Después de undo/redo — re-aplicar el color derivado del estado del timeline
    public async onAfterUndo(ctx: CommandContext): Promise<void> {
        const state = (ctx as any).history?.getState?.();
        const color = state?.backgroundColor;
        if (color) {
            ctx.eventBus.emit('BACKGROUND_COLOR_CHANGED', color);
        }
    }

    public async onAfterRedo(ctx: CommandContext): Promise<void> {
        await this.onAfterUndo(ctx);
    }
}

CommandFactory.register('BACKGROUND_COLOR', BackgroundColorCommand);