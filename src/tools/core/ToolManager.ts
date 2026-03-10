// src/tools/core/ToolManager.ts
import type { ITool } from './ITool';
import type { PointerData } from '../../input/InputManager';

export class ToolManager {
    private tools: Map<string, ITool> = new Map();
    private _activeTool: ITool | null = null;
    private defaultToolId: string = '';
    private previousToolId: string = '';

    public registerTool(tool: ITool) {
        this.tools.set(tool.id, tool);
    }

    public setDefaultTool(toolId: string) {
        this.defaultToolId = toolId;
        this.switchTool(toolId);
    }

    public switchTool(toolId: string) {
        // No permitimos cambiar de herramienta si estamos a mitad de un trazo/paneo
        if (this._activeTool && this._activeTool.isBusy()) return;

        const newTool = this.tools.get(toolId);
        if (!newTool || newTool === this._activeTool) return;

        if (this._activeTool) {
            this.previousToolId = this._activeTool.id;
            this._activeTool.onDeactivate();
        }

        this._activeTool = newTool;
        this._activeTool.onActivate();
    }

    // Regresa a la herramienta anterior (ideal cuando sueltas la barra espaciadora)
    public revertTool() {
        if (this._activeTool && this._activeTool.isBusy()) return;
        this.switchTool(this.defaultToolId); // Por ahora siempre vuelve al pincel
    }

    public get activeTool(): ITool {
        if (!this._activeTool) throw new Error("No active tool");
        return this._activeTool;
    }
}