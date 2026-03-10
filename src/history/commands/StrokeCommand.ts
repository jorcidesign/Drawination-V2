// src/history/commands/StrokeCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import { BinarySerializer } from '../../core/io/BinarySerializer';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { ProfileRegistry } from '../../core/render/profiles/ProfileRegistry';

export class StrokeCommand implements ICommand {
    private event: TimelineEvent;
    private brush: BrushEngine; // <-- AQUÍ

    constructor(event: TimelineEvent, brush: BrushEngine) {
        this.event = event;
        this.brush = brush;
    }

    // Getters para cumplir con la interfaz
    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox() { return this.event.bbox; }

    public async loadDataIfNeeded(storage: StorageManager): Promise<void> {
        if (!this.event.data) {
            console.log(`Paginación Command: Rescatando ${this.id.substring(0, 5)}...`);
            this.event.data = await storage.loadEventData(this.id);
        }
    }

    public execute(ctx: CanvasRenderingContext2D): void {
        if (!this.event.data) return;
        const pts = BinarySerializer.decode(this.event.data);

        // 1. Guardamos el perfil actual del usuario
        const originalProfile = this.brush.profile;

        // 2. Buscamos el perfil con el que se dibujó esta línea originalmente
        const savedProfile = ProfileRegistry[this.event.profileId];
        if (savedProfile) {
            this.brush.setProfile(savedProfile);
        }

        // 3. Dibujamos
        this.brush.reproduceStroke(ctx, this.event.color, this.event.size, this.event.opacity, pts);

        // 4. Devolvemos el pincel al estado del usuario para no arruinarle su herramienta actual
        this.brush.setProfile(originalProfile);
    }

    public getRawData(): ArrayBuffer | null {
        return this.event.data;
    }
}