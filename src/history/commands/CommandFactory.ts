// src/history/commands/CommandFactory.ts
//
// Patrón: Factory + Open/Closed + Self-Registration
//
// CÓMO AÑADIR UN NUEVO COMANDO:
//   1. Crear el archivo (ej: HideCommand.ts) implementando ICommand
//   2. Al final del archivo: CommandFactory.register('HIDE', HideCommand)
//   3. Importar en commands/index.ts
//   4. Listo. Sin tocar CommandFactory, sin tocar WorkspaceController.
//
// El DummyCommand garantiza que la app nunca crashea por un tipo no registrado.

import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../TimelineTypes';
import type { BrushEngine } from '../../core/render/BrushEngine';
import type { ActionType } from '../TimelineTypes';
import type { BoundingBox } from '../../core/math/BoundingBox';
import type { StorageManager } from '../../storage/StorageManager';

type CommandConstructor = new (ev: TimelineEvent, brush: BrushEngine) => ICommand;

// Comando nulo — para eventos no registrados o futuros
// Nunca crashea, loggea en DEV, es transparente en producción
class DummyCommand implements ICommand {
    public readonly id: string;
    public readonly type: ActionType;
    public readonly bbox?: BoundingBox;
    public transform?: number[];

    constructor(ev: TimelineEvent) {
        this.id = ev.id;
        this.type = ev.type;
        this.bbox = ev.bbox;
        if (import.meta.env.DEV) {
            console.warn(`[CommandFactory] No hay comando registrado para tipo: "${ev.type}". Usando DummyCommand.`);
        }
    }

    async loadDataIfNeeded(_storage: StorageManager): Promise<void> { }
    execute(_ctx: CanvasRenderingContext2D): void { }
    getRawData(): ArrayBuffer | null { return null; }
}

export class CommandFactory {
    private static registry = new Map<string, CommandConstructor>();

    // Llamado automáticamente por cada archivo de comando al importarse
    public static register(type: ActionType, ctor: CommandConstructor): void {
        if (this.registry.has(type)) {
            console.warn(`[CommandFactory] Tipo "${type}" ya registrado. Sobreescribiendo.`);
        }
        this.registry.set(type, ctor);
    }

    public static create(ev: TimelineEvent, brush: BrushEngine): ICommand {
        const Ctor = this.registry.get(ev.type);
        if (!Ctor) return new DummyCommand(ev);
        return new Ctor(ev, brush);
    }

    // Utilidad de diagnóstico — lista todos los tipos registrados
    public static getRegisteredTypes(): string[] {
        return Array.from(this.registry.keys());
    }
}