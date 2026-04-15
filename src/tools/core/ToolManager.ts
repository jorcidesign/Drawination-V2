// src/tools/core/ToolManager.ts
import type { ITool, ToolContext } from './ITool';
import { ToolRegistry } from './ToolRegistry';
import type { ShortcutManager } from '../../input/ShortcutManager';
import type { EventBus } from '../../input/EventBus';

export class ToolManager {
    private tools: Map<string, ITool> = new Map();
    private _activeTool: ITool | null = null;
    private defaultToolId: string = '';

    private eventBus: EventBus | null = null; // Guardamos referencia al bus

    public bootstrap(ctx: ToolContext, shortcuts: ShortcutManager) {
        this.eventBus = ctx.eventBus;
        const configs = ToolRegistry.getAll();

        for (const config of configs) {
            const tool = config.factory(ctx);
            this.registerTool(tool);

            // === FIX: Los atajos ahora envían una solicitud al sistema global ===
            if (config.downShortcut) {
                shortcuts.bindDown(config.downShortcut, (e) => {
                    if (!e.repeat) {
                        ctx.eventBus.emit('REQUEST_TOOL_SWITCH', tool.id);
                    }
                });
            }
            if (config.upShortcut) {
                shortcuts.bindUp(config.upShortcut, () => {
                    ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.defaultToolId);
                });
            }
        }

        ctx.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
            this.switchTool(toolId);

            // Evaluamos si la herramienta es permanente (sticky) para hacerla por defecto
            const toolConfig = configs.find(c => c.id === toolId);
            if (!toolConfig || toolConfig.isSticky !== false) {
                this.defaultToolId = toolId;
            }
        });

        ctx.eventBus.on('GLOBAL_INTERRUPTION', () => {
            this.switchTool(this.defaultToolId, 'system_interruption');
        });
    }

    public registerTool(tool: ITool) {
        this.tools.set(tool.id, tool);
    }

    public setDefaultTool(toolId: string) {
        this.defaultToolId = toolId;
        this.switchTool(toolId);
    }

    public switchTool(toolId: string, reason?: string) {
        if (this._activeTool && this._activeTool.isBusy() && toolId === this._activeTool.id) return;

        const newTool = this.tools.get(toolId);
        if (!newTool || newTool === this._activeTool) return;

        if (this._activeTool) {

            this._activeTool.onDeactivate(reason || toolId);
        }

        this._activeTool = newTool;
        this._activeTool.onActivate();

        // === FIX: Emitimos la confirmación del cambio a TODA LA UI ===
        this.eventBus?.emit('ACTIVE_TOOL_CHANGED', toolId);
    }

    public switchToolSilent(toolId: string) {
        if (this._activeTool && this._activeTool.isBusy()) return;

        const newTool = this.tools.get(toolId);
        if (!newTool || newTool === this._activeTool) return;

        if (this._activeTool) {

            this._activeTool.onDeactivate(toolId);
        }

        this._activeTool = newTool;
    }

    public revertTool() {
        this.switchTool(this.defaultToolId);
    }

    public get activeTool(): ITool {
        if (!this._activeTool) throw new Error("No active tool");
        return this._activeTool;
    }
}