// src/core/render/renderers/StylizedRenderer.ts
import type { IBrushRenderer, RebuildHelpers } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';
import { CatmullRom } from '../../math/CatmullRom';

export class StylizedRenderer implements IBrushRenderer {
    private inputBuffer: BasePoint[] = [];

    public beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        const windowSize = profile.physics?.stabilizerWindow ?? 12;

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

    public stamp() { }

    public drawMoveLive(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        if (points.length < 2) return;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            const xc = (points[i].x + points[i - 1].x) / 2;
            const yc = (points[i].y + points[i - 1].y) / 2;
            ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = profile.baseSize * 0.65;
        ctx.strokeStyle = color;
        ctx.globalAlpha = profile.baseOpacity;

        ctx.stroke();
        ctx.restore();
    }

    public endStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        this.inputBuffer = [];
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        this._drawTapered(ctx, profile, color, points);
    }

    // === FIX CRÍTICO: Aislar la simulación en el offCtx ===
    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: RebuildHelpers): void {
        const offCtx = helpers.getOffscreenCanvas(ctx.canvas.width, ctx.canvas.height);

        // Simular en el entorno aislado (aquí su endStroke hará clearRect sin dañar la capa real)
        helpers.simulateDrawing(offCtx);

        // Volcar el resultado final limpio
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = profile.blendMode;
        ctx.drawImage(offCtx.canvas, 0, 0);
        ctx.restore();

        offCtx.clearRect(0, 0, offCtx.canvas.width, offCtx.canvas.height);
    }

    private _drawTapered(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: BasePoint[]): void {
        if (points.length === 0) return;
        if (points.length === 1) {
            ctx.fillStyle = color;
            ctx.globalAlpha = profile.baseOpacity;
            ctx.beginPath();
            ctx.arc(points[0].x, points[0].y, profile.baseSize / 2, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        const spacing = Math.max(1.0, profile.baseSize * 0.05);
        const smoothPoints: { x: number, y: number }[] = [];

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i < points.length - 2 ? points[i + 2] : p2;

            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const steps = Math.max(1, Math.floor(dist / spacing));

            for (let j = 0; j < steps; j++) {
                const t = j / steps;
                smoothPoints.push(CatmullRom.evaluate(p0 as any, p1 as any, p2 as any, p3 as any, t));
            }
        }
        smoothPoints.push(points[points.length - 1]);

        const dists = [0];
        let totalDist = 0;
        for (let i = 1; i < smoothPoints.length; i++) {
            const dx = smoothPoints[i].x - smoothPoints[i - 1].x;
            const dy = smoothPoints[i].y - smoothPoints[i - 1].y;
            totalDist += Math.sqrt(dx * dx + dy * dy);
            dists.push(totalDist);
        }

        const maxTaper = profile.baseSize * 4.5;
        const startTaper = Math.min(maxTaper, totalDist * 0.35);
        const endTaper = Math.min(maxTaper, totalDist * 0.45);

        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = profile.baseOpacity;
        ctx.beginPath();

        for (let i = 0; i < smoothPoints.length; i++) {
            const pt = smoothPoints[i];
            const d = dists[i];

            let factor = 1.0;
            if (d < startTaper) {
                factor = d / startTaper;
            } else if (d > totalDist - endTaper) {
                factor = (totalDist - d) / endTaper;
            }

            factor = Math.sin(factor * (Math.PI / 2));

            const radius = Math.max(0.5, (profile.baseSize / 2) * factor);

            ctx.moveTo(pt.x + radius, pt.y);
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        }

        ctx.fill();
        ctx.restore();
    }
}