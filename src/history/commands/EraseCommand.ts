// src/history/commands/EraseCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { ProfileRegistry } from '../../core/render/profiles/ProfileRegistry';

export class EraseCommand implements ICommand {
    private event: TimelineEvent;
    private brush: BrushEngine; // <-- AQUÍ

    constructor(event: TimelineEvent, brush: BrushEngine) {
        this.event = event;
        this.brush = brush;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox() { return this.event.bbox; }

    public async loadDataIfNeeded(storage: StorageManager): Promise<void> {
        if (!this.event.data) {
            this.event.data = await storage.loadEventData(this.id);
        }
    }

    public execute(ctx: CanvasRenderingContext2D): void {
        if (!this.event.data) return;
        const pts = BinarySerializer.decode(this.event.data);

        const originalProfile = this.brush.profile;
        const savedProfile = ProfileRegistry[this.event.profileId];
        if (savedProfile) {
            this.brush.setProfile(savedProfile);
        }

        // === CORRECCIÓN BUG 2 ===
        // Usamos la opacidad guardada en la historia (this.event.opacity)
        // El color negro da igual porque usamos destination-out
        this.brush.reproduceStroke(ctx, '#000000', this.event.size, this.event.opacity, pts);

        this.brush.setProfile(originalProfile);
    }

    public getRawData(): ArrayBuffer | null {
        return this.event.data;
    }
}