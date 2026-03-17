// src/tools/interaction/transform/TransformHandleRenderer.ts
//
// Responsabilidad ÚNICA: dibujar el handle visual y el live preview sobre el paintingCanvas.
// No tiene estado propio. No conoce ITool, no conoce ToolContext.
// Recibe exactamente lo que necesita por parámetro.
//
// CONTRATOS:
//   renderLivePreview() → limpia el paintingCanvas, aplica matriz, vuelca el sandbox, dibuja el handle
//   drawHandle()        → dibuja los controles visuales (rectángulo, esquinas, arcos de rotación)

import type { BoundingBox } from '../../../core/math/BoundingBox';

export class TransformHandleRenderer {

    /**
     * Vuelca el sandboxCanvas con la transformación actual y dibuja los controles encima.
     */
    public renderLivePreview(
        paintingCtx: CanvasRenderingContext2D,
        sandboxCanvas: HTMLCanvasElement,
        currentMatrix: number[],
        bbox: BoundingBox | null,
        zoom: number
    ): void {
        paintingCtx.clearRect(0, 0, paintingCtx.canvas.width, paintingCtx.canvas.height);

        const pCtx = paintingCtx;
        pCtx.save();

        const m = currentMatrix;
        pCtx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        pCtx.drawImage(sandboxCanvas, 0, 0);
        pCtx.restore();

        this.drawHandle(paintingCtx, currentMatrix, bbox, zoom);
    }

    /**
     * Dibuja el rectángulo punteado, las manijas de escala en cada vértice,
     * y los puntos de rotación desplazados hacia el exterior diagonal.
     *
     * GEOMETRÍA:
     *
     *   [R]·····[R]
     *    · [bbox] ·       R = círculo rojo de rotación (fuera del bbox)
     *   [R]·····[R]       □ = círculo blanco de escala (sobre el vértice)
     *
     * Cada punto R está a ROTATE_OFFSET px del vértice en la dirección
     * opuesta al centro, es decir en la diagonal exterior de la esquina.
     * Esto garantiza que nunca se solapen con el interior del bbox.
     */
    public drawHandle(
        paintingCtx: CanvasRenderingContext2D,
        m: number[],
        bbox: BoundingBox | null,
        zoom: number
    ): void {
        if (!bbox) return;

        const { minX, minY, maxX, maxY } = bbox;

        const pts = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
        ].map(p => ({
            x: p.x * m[0] + p.y * m[2] + m[4],
            y: p.x * m[1] + p.y * m[3] + m[5],
        }));

        const pCtx = paintingCtx;
        pCtx.save();

        // ── 1. Overlay tint ───────────────────────────────────────────────
        pCtx.beginPath();
        pCtx.moveTo(pts[0].x, pts[0].y);
        pCtx.lineTo(pts[1].x, pts[1].y);
        pCtx.lineTo(pts[2].x, pts[2].y);
        pCtx.lineTo(pts[3].x, pts[3].y);
        pCtx.closePath();
        pCtx.fillStyle = 'rgba(0, 168, 255, 0.05)';
        pCtx.fill();

        // ── 2. Guías proyectadas hasta los bordes del canvas ──────────────
        // Cada lado del bbox (como línea infinita) se extiende hasta los
        // bordes del canvas. Dibujamos solo los tramos exteriores al bbox,
        // dando el efecto "crosshair de estudio" de Concepts App.
        const W = pCtx.canvas.width;
        const H = pCtx.canvas.height;

        pCtx.save();
        pCtx.strokeStyle = 'rgba(0, 168, 255, 0.22)';
        pCtx.lineWidth = 0.75 / zoom;
        pCtx.setLineDash([4 / zoom, 6 / zoom]);

        // 4 lados: par de vértices consecutivos
        const sides: [number, number, number, number][] = [
            [pts[0].x, pts[0].y, pts[1].x, pts[1].y],
            [pts[1].x, pts[1].y, pts[2].x, pts[2].y],
            [pts[2].x, pts[2].y, pts[3].x, pts[3].y],
            [pts[3].x, pts[3].y, pts[0].x, pts[0].y],
        ];

        for (const [ax, ay, bx, by] of sides) {
            const sdx = bx - ax;
            const sdy = by - ay;

            // t parametrico: punto = A + t*(B-A)
            // Intersectamos con los 4 bordes del canvas y recogemos todos los t
            const ts: number[] = [];
            if (Math.abs(sdx) > 0.001) {
                ts.push((0 - ax) / sdx);
                ts.push((W - ax) / sdx);
            }
            if (Math.abs(sdy) > 0.001) {
                ts.push((0 - ay) / sdy);
                ts.push((H - ay) / sdy);
            }

            const tMin = Math.min(...ts);
            const tMax = Math.max(...ts);

            // Extremos de la línea infinita recortada al canvas
            const x0 = ax + sdx * tMin;
            const y0 = ay + sdy * tMin;
            const x1 = ax + sdx * tMax;
            const y1 = ay + sdy * tMax;

            // Tramo exterior izquierdo: borde canvas → vértice A
            pCtx.beginPath();
            pCtx.moveTo(x0, y0);
            pCtx.lineTo(ax, ay);
            pCtx.stroke();

            // Tramo exterior derecho: vértice B → borde canvas
            pCtx.beginPath();
            pCtx.moveTo(bx, by);
            pCtx.lineTo(x1, y1);
            pCtx.stroke();
        }

        pCtx.setLineDash([]);
        pCtx.restore();

        // ── 3. Rectángulo punteado ────────────────────────────────────────
        pCtx.beginPath();
        pCtx.moveTo(pts[0].x, pts[0].y);
        pCtx.lineTo(pts[1].x, pts[1].y);
        pCtx.lineTo(pts[2].x, pts[2].y);
        pCtx.lineTo(pts[3].x, pts[3].y);
        pCtx.closePath();
        pCtx.lineWidth = 1.5 / zoom;
        pCtx.strokeStyle = '#00a8ff';
        pCtx.setLineDash([6 / zoom, 6 / zoom]);
        pCtx.stroke();
        pCtx.setLineDash([]);

        // ── 3. Centro (pivote) ────────────────────────────────────────────
        const cx = (pts[0].x + pts[2].x) / 2;
        const cy = (pts[0].y + pts[2].y) / 2;

        pCtx.beginPath();
        pCtx.arc(cx, cy, 3 / zoom, 0, Math.PI * 2);
        pCtx.fillStyle = '#00a8ff';
        pCtx.fill();

        // ── 4. Handles por esquina ────────────────────────────────────────
        const SCALE_R = 6 / zoom;
        const ROTATE_R = 5 / zoom;
        const ROTATE_OFFSET = 20 / zoom;

        for (const p of pts) {
            // Vector unitario desde centro hacia el vértice (dirección exterior)
            const dx = p.x - cx;
            const dy = p.y - cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? dx / len : 0;
            const ny = len > 0 ? dy / len : 0;

            // Posición del punto de rotación: exterior de la esquina
            const rx = p.x + nx * ROTATE_OFFSET;
            const ry = p.y + ny * ROTATE_OFFSET;

            // Línea conector vértice → punto de rotación
            pCtx.beginPath();
            pCtx.moveTo(p.x, p.y);
            pCtx.lineTo(rx, ry);
            pCtx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
            pCtx.lineWidth = 1 / zoom;
            pCtx.stroke();

            // Círculo rojo de rotación (exterior)
            pCtx.beginPath();
            pCtx.arc(rx, ry, ROTATE_R, 0, Math.PI * 2);
            pCtx.fillStyle = 'rgba(231, 76, 60, 0.9)';
            pCtx.strokeStyle = '#ffffff';
            pCtx.lineWidth = 1.5 / zoom;
            pCtx.fill();
            pCtx.stroke();

            // Círculo blanco de escala (sobre el vértice, dibujado encima)
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, SCALE_R, 0, Math.PI * 2);
            pCtx.fillStyle = '#ffffff';
            pCtx.strokeStyle = '#00a8ff';
            pCtx.lineWidth = 2 / zoom;
            pCtx.fill();
            pCtx.stroke();
        }

        pCtx.restore();
    }
}