// src/history/commands/StrokeCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { ProfileRegistry } from '../../core/render/profiles/ProfileRegistry';
import { CommandFactory } from './CommandFactory';

export class StrokeCommand implements ICommand {
    private event: TimelineEvent;
    private brush: BrushEngine;
    public transform?: number[]; // <--- NUEVO

    constructor(event: TimelineEvent, brush: BrushEngine) {
        this.event = event;
        this.brush = brush;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox() { return this.event.bbox; }

    public async loadDataIfNeeded(storage: StorageManager): Promise<void> {
        if (!this.event.data) this.event.data = await storage.loadEventData(this.id);
    }

    public execute(ctx: CanvasRenderingContext2D): void {
        if (!this.event.data) return;
        const pts = BinarySerializer.decode(this.event.data);

        const originalProfile = this.brush.profile;
        const savedProfile = ProfileRegistry[this.event.profileId];
        if (savedProfile) this.brush.setProfile(savedProfile);

        // === MAGIA MATEMÁTICA NATIVA ===
        ctx.save();
        if (this.transform) {
            ctx.transform(this.transform[0], this.transform[1], this.transform[2], this.transform[3], this.transform[4], this.transform[5]);
        }

        this.brush.reproduceStroke(ctx, this.event.color, this.event.size, this.event.opacity, pts);
        ctx.restore();

        this.brush.setProfile(originalProfile);
    }

    public getRawData(): ArrayBuffer | null { return this.event.data; }
}
CommandFactory.register('STROKE', StrokeCommand);