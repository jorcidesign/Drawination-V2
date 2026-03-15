// src/core/render/renderers/FillRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';

export class FillRenderer implements IBrushRenderer {
    public beginStroke() { }
    public stamp() { } // El relleno no estampa

    public drawMoveLive(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        if (points.length < 2) return;
        ctx.save();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = color;
        ctx.globalAlpha = profile.baseOpacity;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const pt of points) ctx.lineTo(pt.x, pt.y);
        ctx.fill();
        ctx.restore();
    }

    public endStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        if (points.length < 3) return;
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = profile.baseOpacity;
        ctx.globalCompositeOperation = profile.blendMode;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const pt of points) ctx.lineTo(pt.x, pt.y);
        ctx.fill();
        ctx.restore();
    }

    // El Fill no usa steps ni simulaciones, simplemente dibuja el polígono de golpe
    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: any): void {
        this.endStroke(ctx, profile, color, points);
    }
}