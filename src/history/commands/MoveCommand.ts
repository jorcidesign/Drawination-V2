// src/history/commands/MoveCommand.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { StorageManager } from '../../storage/StorageManager';
import type { BrushEngine } from '../../core/render/BrushEngine';
import { CommandFactory } from './CommandFactory';

export class MoveCommand implements ICommand {
    private event: TimelineEvent;

    // === ACTUALIZADO: Debe aceptar el BrushEngine para cumplir con el contrato de la Factory ===
    constructor(event: TimelineEvent, _brush: BrushEngine) {
        this.event = event;
    }

    public get id() { return this.event.id; }
    public get type() { return this.event.type; }
    public get bbox() { return this.event.bbox; }

    public async loadDataIfNeeded(storage: StorageManager): Promise<void> {
        // Mover no requiere descargar vectores
    }

    public execute(ctx: CanvasRenderingContext2D): void {
        const dx = this.event.transformDx || 0;
        const dy = this.event.transformDy || 0;
        if (dx === 0 && dy === 0) return;

        const canvas = ctx.canvas;

        // Creamos una copia del canvas en su estado actual
        const temp = document.createElement('canvas');
        temp.width = canvas.width;
        temp.height = canvas.height;
        temp.getContext('2d')!.drawImage(canvas, 0, 0);

        // Limpiamos y pegamos la copia desplazada
        ctx.save();
        ctx.globalCompositeOperation = 'copy'; // Reemplaza todo el destino
        ctx.drawImage(temp, dx, dy);
        ctx.restore();
    }

    public getRawData(): ArrayBuffer | null {
        return null;
    }
}

// === REGISTRO AUTOMÁTICO ===
CommandFactory.register('TRANSFORM', MoveCommand);