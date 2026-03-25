// src/core/render/renderers/FillRenderer.ts
import type { IBrushRenderer, RebuildHelpers } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';
import { CatmullRom } from '../../math/CatmullRom';

export class FillRenderer implements IBrushRenderer {
    private inputBuffer: BasePoint[] = [];

    public beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    public stamp() { }

    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        const windowSize = profile.physics?.stabilizerWindow ?? 6;

        if (windowSize <= 1) return data;

        this.inputBuffer.push(data);
        if (this.inputBuffer.length > windowSize) {
            this.inputBuffer.shift();
        }

        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        let weightedP = 0;

        for (let i = 0; i < this.inputBuffer.length; i++) {
            const weight = Math.pow(2, i);
            totalWeight += weight;
            weightedX += this.inputBuffer[i].x * weight;
            weightedY += this.inputBuffer[i].y * weight;
            weightedP += this.inputBuffer[i].pressure * weight;
        }

        return {
            x: weightedX / totalWeight,
            y: weightedY / totalWeight,
            pressure: weightedP / totalWeight
        };
    }

    private _buildSmoothPath(points: BasePoint[]): Path2D {
        const path = new Path2D();
        if (points.length === 0) return path;

        path.moveTo(points[0].x, points[0].y);

        if (points.length < 3) {
            for (let i = 1; i < points.length; i++) {
                path.lineTo(points[i].x, points[i].y);
            }
            return path;
        }

        const spacing = 5;

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i < points.length - 2 ? points[i + 2] : p2;

            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const steps = Math.max(1, Math.floor(dist / spacing));

            for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                const pt = CatmullRom.evaluate(p0 as any, p1 as any, p2 as any, p3 as any, t);
                path.lineTo(pt.x, pt.y);
            }
        }

        return path;
    }

    public drawMoveLive(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        if (points.length < 2) return;

        ctx.save();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.fillStyle = color;
        ctx.globalAlpha = profile.baseOpacity;

        const path = this._buildSmoothPath(points);
        ctx.fill(path);

        ctx.restore();
    }

    public endStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        this.inputBuffer = [];

        if (points.length < 3) return;

        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = profile.baseOpacity;
        ctx.globalCompositeOperation = profile.blendMode;

        const path = this._buildSmoothPath(points);
        ctx.fill(path);

        ctx.restore();
    }

    // === FIX CRÍTICO: Aislar la simulación ===
    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: RebuildHelpers): void {
        const offCtx = helpers.getOffscreenCanvas(ctx.canvas.width, ctx.canvas.height);

        helpers.simulateDrawing(offCtx);

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = profile.blendMode;
        ctx.drawImage(offCtx.canvas, 0, 0);
        ctx.restore();

        offCtx.clearRect(0, 0, offCtx.canvas.width, offCtx.canvas.height);
    }
}