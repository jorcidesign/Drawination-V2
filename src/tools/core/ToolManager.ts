// src/tools/core/ToolManager.ts
import type { ITool, ToolContext } from './ITool';
import { ToolRegistry } from './ToolRegistry';
import type { ShortcutManager } from '../../input/ShortcutManager';

export class ToolManager {
    private tools: Map<string, ITool> = new Map();
    private _activeTool: ITool | null = null;
    private defaultToolId: string = '';
    private previousToolId: string = '';

    public bootstrap(ctx: ToolContext, shortcuts: ShortcutManager) {
        const configs = ToolRegistry.getAll();

        for (const config of configs) {
            const tool = config.factory(ctx);
            this.registerTool(tool);

            if (config.downShortcut) {
                shortcuts.bindDown(config.downShortcut, (e) => {
                    if (!e.repeat) {
                        this.switchTool(tool.id);
                        if (config.isSticky) this.setDefaultTool(tool.id);
                    }
                });
            }
            if (config.upShortcut) {
                shortcuts.bindUp(config.upShortcut, () => this.revertTool());
            }
        }

        // === NUEVO: El Manager escucha solicitudes de cambio (Desde la UI o las Herramientas) ===
        ctx.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
            this.switchTool(toolId);
            this.setDefaultTool(toolId);
        });
    }

    public registerTool(tool: ITool) {
        this.tools.set(tool.id, tool);
    }

    public setDefaultTool(toolId: string) {
        this.defaultToolId = toolId;
        this.switchTool(toolId);
    }

    public switchTool(toolId: string) {
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

    public revertTool() {
        if (this._activeTool && this._activeTool.isBusy()) return;
        this.switchTool(this.defaultToolId);
    }

    public get activeTool(): ITool {
        if (!this._activeTool) throw new Error("No active tool");
        return this._activeTool;
    }
}