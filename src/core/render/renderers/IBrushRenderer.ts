// src/core/render/renderers/IBrushRenderer.ts
import type { BasePoint } from '../../../input/InputManager';
import type { IBrushProfile } from '../profiles/IBrushProfile';

export interface IBrushRenderer {
    updateTip?(profile: IBrushProfile, color: string): void;
    // === NUEVO HOOK: Invalida el caché del tipCanvas ===
    forceInvalidateTip?(): void;

    // === NUEVO HOOK: Permite a la estrategia estabilizar la mano antes de interpolar ===
    transformInput?(profile: IBrushProfile, data: BasePoint): BasePoint;

    beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void;
    getStep?(profile: IBrushProfile, baseStep: number, pressure: number, dx: number, dy: number): number;
    stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, pressure: number): void;
    drawMoveLive?(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void;
    endStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void;
}