// src/tools/core/ToolRegistry.ts
import type { ITool, ToolContext } from './ITool';

export type ToolFactory = (ctx: ToolContext) => ITool;

export interface ToolConfig {
    id: string;
    factory: ToolFactory;
    downShortcut?: string; // Ej: 'b', 'e', 'space'
    upShortcut?: string;   // Ej: 'space'
    isSticky?: boolean;    // True si al pulsar la tecla, se vuelve la herramienta permanente (como el lápiz), False si es temporal (como el paneo con Espacio).
}

export class ToolRegistry {
    private static tools = new Map<string, ToolConfig>();

    public static register(config: ToolConfig) {
        this.tools.set(config.id, config);
    }

    public static getAll(): ToolConfig[] {
        return Array.from(this.tools.values());
    }
}