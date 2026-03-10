// src/core/Brush.ts
import type { BasePoint } from '../../input/InputManager';
import type { StrokePoint } from '../io/BinarySerializer';

export class Brush {
    public color: string = '#000000';
    public size: number = 10;
    public opacity: number = 1;

    private points: BasePoint[] = [];

    constructor() { }

    private setupContext(ctx: CanvasRenderingContext2D): void {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
    }

    public beginStroke(ctx: CanvasRenderingContext2D, data: BasePoint): void {
        this.points = [data];
        this.setupContext(ctx);
    }

    public drawMove(ctx: CanvasRenderingContext2D, data: BasePoint): void {
        this.points.push(data);
        this.setupContext(ctx);
        const n = this.points.length;

        if (n === 2) {
            const p0 = this.points[0];
            const p1 = this.points[1];
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineWidth = this.size * data.pressure; // Presión exacta directa
            ctx.stroke();
            return;
        }

        const p0 = this.points[n - 3];
        const p1 = this.points[n - 2];
        const p2 = this.points[n - 1];

        const mid1 = { x: p0.x + (p1.x - p0.x) * 0.5, y: p0.y + (p1.y - p0.y) * 0.5 };
        const mid2 = { x: p1.x + (p2.x - p1.x) * 0.5, y: p1.y + (p2.y - p1.y) * 0.5 };

        ctx.beginPath();
        ctx.moveTo(mid1.x, mid1.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
        ctx.lineWidth = this.size * data.pressure; // Presión exacta directa
        ctx.stroke();
    }

    public endStroke(ctx?: CanvasRenderingContext2D): void {
        if (ctx && this.points.length > 0) {
            this.setupContext(ctx);
            const n = this.points.length;
            const finalPressure = this.points[n - 1].pressure;

            if (n === 1) {
                ctx.beginPath();
                ctx.arc(this.points[0].x, this.points[0].y, (this.size * finalPressure) / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (n >= 2) {
                const p1 = this.points[n - 2];
                const p2 = this.points[n - 1];
                const mid = { x: p1.x + (p2.x - p1.x) * 0.5, y: p1.y + (p2.y - p1.y) * 0.5 };
                ctx.beginPath();
                ctx.moveTo(mid.x, mid.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineWidth = this.size * finalPressure;
                ctx.stroke();
            }
        }
        this.points = [];
    }

    public reproduceStroke(
        ctx: CanvasRenderingContext2D,
        actionColor: string,
        actionSize: number,
        decodedPoints: StrokePoint[]
    ): void {
        if (decodedPoints.length === 0) return;

        const prevColor = this.color;
        const prevSize = this.size;
        this.color = actionColor;
        this.size = actionSize;

        if (decodedPoints.length === 1) {
            this.setupContext(ctx);
            ctx.beginPath();
            ctx.arc(decodedPoints[0].x, decodedPoints[0].y, (this.size * decodedPoints[0].pressure) / 2, 0, Math.PI * 2);
            ctx.fill();
            this.color = prevColor;
            this.size = prevSize;
            return;
        }

        this.beginStroke(ctx, decodedPoints[0]);
        for (let i = 1; i < decodedPoints.length; i++) {
            this.drawMove(ctx, decodedPoints[i]);
        }
        this.endStroke(ctx);

        this.color = prevColor;
        this.size = prevSize;
    }
}