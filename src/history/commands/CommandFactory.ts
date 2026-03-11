// src/history/commands/CommandFactory.ts
import type { ICommand } from './ICommand';
import type { TimelineEvent } from '../HistoryManager';
import type { BrushEngine } from '../../core/render/BrushEngine';

// Definimos el tipo del constructor (todos los comandos deben aceptar el evento y el pincel)
type CommandConstructor = new (ev: TimelineEvent, brush: BrushEngine) => ICommand;

export class CommandFactory {
    private static registry = new Map<string, CommandConstructor>();

    // Abierto a la extensión: Registramos comandos aquí
    public static register(type: string, ctor: CommandConstructor) {
        this.registry.set(type, ctor);
    }

    // Cerrado a la modificación: Instanciamos basados en el tipo
    public static create(ev: TimelineEvent, brush: BrushEngine): ICommand {
        const Ctor = this.registry.get(ev.type);
        if (!Ctor) {
            // Un fallback de seguridad por si hay algún evento viejo no soportado
            console.warn(`[CommandFactory] No hay comando para el tipo: ${ev.type}. Se omitirá.`);
            // Retornamos un comando nulo (Dummy Object) para que no crashee la app
            return {
                id: ev.id, type: ev.type, bbox: ev.bbox,
                loadDataIfNeeded: async () => { },
                execute: () => { },
                getRawData: () => null
            };
        }
        return new Ctor(ev, brush);
    }
}