import type { BasePoint } from '../../../input/InputManager';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { StrokePoint } from '../../io/BinarySerializer'; // <-- AÑADIR IMPORT

// NUEVO: Herramientas que el Engine le presta al Renderer para el rebuild
export interface RebuildHelpers {
    getOffscreenCanvas: (width: number, height: number) => CanvasRenderingContext2D;
    simulateDrawing: (targetCtx: CanvasRenderingContext2D) => void;
}

export interface IBrushRenderer {
    updateTip?(profile: IBrushProfile, color: string): void;
    forceInvalidateTip?(): void;
    transformInput?(profile: IBrushProfile, data: BasePoint): BasePoint;

    beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void;
    getStep?(profile: IBrushProfile, baseStep: number, pressure: number, dx: number, dy: number): number;
    stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, pressure: number): void;
    drawMoveLive?(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void;
    endStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void;

    // NUEVO HOOK: El renderer toma control absoluto de cómo se reconstruye el trazo en la historia
    rebuildStroke?(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        points: StrokePoint[],
        helpers: RebuildHelpers
    ): void;
}