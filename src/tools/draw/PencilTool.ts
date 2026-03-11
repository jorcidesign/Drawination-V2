// src/tools/draw/PencilTool.ts
import type { ITool, ToolContext } from '../core/ITool';
import type { PointerData } from '../../input/InputManager';
import { ObjectPool } from '../../core/memory/ObjectPool';
import { ToolRegistry } from '../core/ToolRegistry';
import type { IBrushProfile } from '../../core/render/profiles/IBrushProfile';

import { InkProfile } from '../../core/render/profiles/InkProfile';
import { PencilProfile } from '../../core/render/profiles/PencilProfiles';
import { FillProfile } from '../../core/render/profiles/FillProfile';

// === DECLARATION MERGING: El Lápiz inyecta sus eventos al bus global ===
declare module '../../input/EventBus' {
    interface AppEventMap {
        'SET_TOOL_PENCIL': void;
        'SET_PROFILE_INK': void;
        'SET_PROFILE_PENCIL': void;
        'SET_PROFILE_FILL': void;
    }
}

export class PencilTool implements ITool {
    public readonly id = 'pencil';
    private ctx: ToolContext;
    private drawing: boolean = false;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;

        // Escuchamos los eventos que nosotros mismos acabamos de inyectar
        this.ctx.eventBus.on('SET_PROFILE_INK', () => this.applyProfile(InkProfile));
        this.ctx.eventBus.on('SET_PROFILE_PENCIL', () => this.applyProfile(PencilProfile));
        this.ctx.eventBus.on('SET_PROFILE_FILL', () => this.applyProfile(FillProfile));

        this.ctx.eventBus.on('SET_COLOR', (hex: string) => {
            this.ctx.activeBrush.setColor(hex);
            this.applyProfile(this.ctx.activeBrush.lastDrawingProfile);
        });

        this.ctx.eventBus.on('SET_TOOL_PENCIL', () => {
            this.applyProfile(this.ctx.activeBrush.lastDrawingProfile);
        });
    }

    private applyProfile(profile: IBrushProfile) {
        this.ctx.activeBrush.lastDrawingProfile = profile;
        this.ctx.activeBrush.setProfile(profile);

        this.ctx.eventBus.emit('REQUEST_TOOL_SWITCH', this.id);

        this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
            size: profile.baseSize,
            opacity: profile.baseOpacity
        });
    }

    public isBusy() { return this.drawing; }

    public onActivate() {
        this.ctx.engine.container.style.cursor = 'crosshair';
        this.ctx.activeBrush.setProfile(this.ctx.activeBrush.lastDrawingProfile);
        this.ctx.eventBus.emit('SYNC_UI_SLIDERS', {
            size: this.ctx.activeBrush.profile.baseSize,
            opacity: this.ctx.activeBrush.profile.baseOpacity
        });
    }

    public onDeactivate() { this.drawing = false; }

    public onPointerDown(data: PointerData) {
        this.drawing = true;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.beginStroke('STROKE', this.id, cleanData.x, cleanData.y, cleanData.pressure, this.ctx.activeBrush);
        this.ctx.activeBrush.beginStroke(this.ctx.engine.paintingContext, cleanData);
    }

    public onPointerMove(data: PointerData) {
        if (!this.drawing) return;
        const canvasPos = this.ctx.viewport.screenToCanvas(data.x, data.y);
        const cleanData = ObjectPool.getPointerData(canvasPos.x, canvasPos.y, data.pressure, data.pointerType);
        this.ctx.history.addPoint(cleanData.x, cleanData.y, cleanData.pressure);
        this.ctx.activeBrush.drawMove(this.ctx.engine.paintingContext, cleanData, true);
    }

    public async onPointerUp(data: PointerData) {
        if (!this.drawing) return;
        this.drawing = false;
        if (this.ctx.activeBrush.profile.renderMode === 'fill') this.ctx.engine.clearPaintingCanvas();
        this.ctx.activeBrush.endStroke(this.ctx.engine.paintingContext);
        this.ctx.engine.commitPaintingCanvas();

        const processedEvent = await this.ctx.history.commitStroke();
        if (processedEvent) {
            // Esperamos que se guarde en IndexedDB
            await this.ctx.storage.saveEvent(processedEvent);
            // Avisamos que ya es seguro y limpiamos la RAM
            processedEvent.isSaved = true;
            this.ctx.history.enforceRamLimit();
        }
        ObjectPool.reset();
    }
}

ToolRegistry.register({ id: 'pencil', factory: (ctx) => new PencilTool(ctx), downShortcut: 'b', isSticky: true });