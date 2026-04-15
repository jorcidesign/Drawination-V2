// src/history/commands/DuplicateGroupCommand.ts
//
// Comando atómico para DUPLICATE_GROUP.
// Un solo evento en el timeline agrupa todos los clones + sus transforms.
//
// ESTRUCTURA del evento:
//   event.sourceIds   → IDs originales seleccionados
//   event.newIds      → IDs de los clones creados
//   event.cloneData   → ArrayBuffer[] serializado de cada clon (en orden de newIds)
//   event.cloneTransforms → number[][] de cada clon (identidad si no hay transform)
//   event.layerIndex  → capa destino
//
// FLUJO:
//   execute()       → reproduce todos los clones en el ctx
//   onAfterUndo()   → vuelve a seleccionar los originales en el TransformHandle
//   onAfterRedo()   → selecciona los clones en el TransformHandle

import type { ICommand, CommandContext } from './ICommand';
import type { TimelineEvent } from '../TimelineTypes';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { BoundingBox } from '../../core/math/BoundingBox';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import { ProfileRegistry } from '../../core/render/profiles/ProfileRegistry';
import { CommandFactory } from './CommandFactory';

export class DuplicateGroupCommand implements ICommand {
    private event: TimelineEvent;
    private brush: BrushEngine;
    public transform?: number[];

    constructor(event: TimelineEvent, brush: BrushEngine) {
        this.event = event;
        this.brush = brush;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox(): BoundingBox | undefined { return undefined; }

    public async loadDataIfNeeded(_storage: StorageManager): Promise<void> {
        // Los datos de los clones van incrustados en clonePayloads.
        // No hay IDs de IDB separados que cargar.
    }

    public execute(ctx: CanvasRenderingContext2D): void {
        const payloads = this.event.clonePayloads;
        if (!payloads || payloads.length === 0) return;

        for (const payload of payloads) {
            if (!payload.data) continue;

            const pts = BinarySerializer.decode(payload.data);
            const historicalProfile =
                ProfileRegistry[payload.profileId] || this.brush.profile;

            ctx.save();

            // Aplicar transform del clon si existe
            if (payload.matrix) {
                ctx.transform(
                    payload.matrix[0], payload.matrix[1],
                    payload.matrix[2], payload.matrix[3],
                    payload.matrix[4], payload.matrix[5],
                );
            }

            this.brush.reproduceStroke(
                ctx,
                historicalProfile,
                payload.color,
                payload.size,
                payload.opacity,
                pts,
            );

            ctx.restore();
        }
    }

    public getRawData(): ArrayBuffer | null { return null; }

    // Ctrl+Z sobre DUPLICATE_GROUP → TransformHandle vuelve a los originales
    public async onAfterUndo(ctx: CommandContext): Promise<void> {
        if (!this.event.sourceIds || this.event.sourceIds.length === 0) return;

        ctx.eventBus.emit('REQUEST_TRANSFORM_HANDLE_REFRESH', {
            targetIds: this.event.sourceIds,
        });
    }

    // Ctrl+Y sobre DUPLICATE_GROUP → TransformHandle va a los clones
    public async onAfterRedo(ctx: CommandContext): Promise<void> {
        if (!this.event.newIds || this.event.newIds.length === 0) return;

        ctx.eventBus.emit('REQUEST_TRANSFORM_HANDLE_REFRESH', {
            targetIds: this.event.newIds,
        });
    }
}

CommandFactory.register('DUPLICATE_GROUP', DuplicateGroupCommand);