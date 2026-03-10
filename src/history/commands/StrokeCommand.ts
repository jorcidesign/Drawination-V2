// src/history/commands/StrokeCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { ProfileRegistry } from '../../core/render/profiles/ProfileRegistry';

export class StrokeCommand implements ICommand {
    private event: TimelineEvent;
    private brush: BrushEngine;
    // Añade estas variables en la clase
    public dx: number = 0;
    public dy: number = 0;

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

        // === MAGIA NO DESTRUCTIVA ===
        ctx.save();
        if (this.dx !== 0 || this.dy !== 0) {
            ctx.translate(this.dx, this.dy);
        }

        // Si es StrokeCommand usa event.color, si es EraseCommand usa '#000000'
        this.brush.reproduceStroke(ctx, this.event.color, this.event.size, this.event.opacity, pts);

        ctx.restore();
        // ===========================

        this.brush.setProfile(originalProfile);
    }

    public getRawData(): ArrayBuffer | null { return this.event.data; }
}