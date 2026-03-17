// src/tools/interaction/transform/TransformGestureHandler.ts
//
// Responsabilidad ÚNICA: hit testing de esquinas + cálculo de matrices afines
// para las 3 operaciones (drag, scale, rotate).
//
// No tiene estado de canvas. No conoce ITool ni ToolContext.
// El estado mutable (startX, pivotX, etc.) es interno a la sesión de gesto activa.
// El TransformHandleTool es el único que llama a este módulo.
//
// ZONAS DE HIT (modelo Concepts App):
//
//         ╔═══════════════════════╗
//   [rot] ║  [drag — interior]   ║ [rot]
//         ║                       ║
//   [rot] ║                       ║ [rot]
//         ╚═══════════════════════╝
//
//   • Interior del bbox          → drag (mover)
//   • Círculo ≤ scaleRadius      → scale (esquina, dentro o fuera)
//   • Corona scaleRadius..rotateRadius, FUERA del bbox → rotate
//   • Cualquier otra cosa        → outside (deseleccionar)
//
// El orden de evaluación es: escala > interior > rotación > fuera.
// Así, el interior siempre es drag aunque esté cerca de una esquina.

import type { BoundingBox } from '../../../core/math/BoundingBox';

export type HitZone =
    | { kind: 'scale'; cornerX: number; cornerY: number; pivotX: number; pivotY: number }
    | { kind: 'rotate'; cx: number; cy: number }
    | { kind: 'drag' }
    | { kind: 'outside' };

type GestureState =
    | { type: 'drag'; startX: number; startY: number }
    | { type: 'scale'; dragStartX: number; dragStartY: number; pivotX: number; pivotY: number }
    | { type: 'rotate'; initialAngle: number; centerX: number; centerY: number }
    | null;

export class TransformGestureHandler {

    private gesture: GestureState = null;

    // ── Hit Testing ───────────────────────────────────────────────────────

    public hitTest(
        canvasX: number,
        canvasY: number,
        bbox: BoundingBox,
        zoom: number
    ): HitZone {
        // Estos valores deben coincidir exactamente con TransformHandleRenderer
        const SCALE_R = 6 / zoom;
        const ROTATE_R = 5 / zoom;
        const ROTATE_OFFSET = 20 / zoom;
        // Radio de hit algo más generoso que el visual para facilitar la interacción
        const SCALE_HIT = SCALE_R + 6 / zoom;
        const ROTATE_HIT = ROTATE_R + 8 / zoom;

        const cx = (bbox.minX + bbox.maxX) / 2;
        const cy = (bbox.minY + bbox.maxY) / 2;

        const corners = [
            { x: bbox.minX, y: bbox.minY, px: bbox.maxX, py: bbox.maxY },
            { x: bbox.maxX, y: bbox.minY, px: bbox.minX, py: bbox.maxY },
            { x: bbox.maxX, y: bbox.maxY, px: bbox.minX, py: bbox.minY },
            { x: bbox.minX, y: bbox.maxY, px: bbox.maxX, py: bbox.minY },
        ];

        for (const c of corners) {
            // Dirección exterior (desde centro hacia el vértice, normalizada)
            const dx = c.x - cx;
            const dy = c.y - cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? dx / len : 0;
            const ny = len > 0 ? dy / len : 0;

            // Posición del punto de rotación exterior
            const rx = c.x + nx * ROTATE_OFFSET;
            const ry = c.y + ny * ROTATE_OFFSET;

            // ── Escala: hit sobre el vértice ──────────────────────────────
            if (Math.hypot(canvasX - c.x, canvasY - c.y) <= SCALE_HIT) {
                return { kind: 'scale', cornerX: c.x, cornerY: c.y, pivotX: c.px, pivotY: c.py };
            }

            // ── Rotación: hit sobre el círculo exterior ───────────────────
            if (Math.hypot(canvasX - rx, canvasY - ry) <= ROTATE_HIT) {
                return { kind: 'rotate', cx, cy };
            }
        }

        // ── Drag: cualquier punto dentro del bbox ─────────────────────────
        const inside =
            canvasX >= bbox.minX && canvasX <= bbox.maxX &&
            canvasY >= bbox.minY && canvasY <= bbox.maxY;

        return inside ? { kind: 'drag' } : { kind: 'outside' };
    }

    // ── Inicio de gesto ───────────────────────────────────────────────────

    public beginDrag(canvasX: number, canvasY: number): void {
        this.gesture = { type: 'drag', startX: canvasX, startY: canvasY };
    }

    public beginScale(hit: Extract<HitZone, { kind: 'scale' }>): void {
        this.gesture = {
            type: 'scale',
            dragStartX: hit.cornerX,
            dragStartY: hit.cornerY,
            pivotX: hit.pivotX,
            pivotY: hit.pivotY,
        };
    }

    public beginRotate(hit: Extract<HitZone, { kind: 'rotate' }>, canvasX: number, canvasY: number): void {
        this.gesture = {
            type: 'rotate',
            initialAngle: Math.atan2(canvasY - hit.cy, canvasX - hit.cx),
            centerX: hit.cx,
            centerY: hit.cy,
        };
    }

    // ── Cálculo del frame actual ──────────────────────────────────────────

    /**
     * Devuelve la matriz [a,b,c,d,tx,ty] para el frame actual.
     * Si isShiftDown=true aplica el snap de 15° en rotate.
     * Devuelve null si no hay gesto activo.
     */
    public computeMatrix(
        canvasX: number,
        canvasY: number,
        isShiftDown: boolean
    ): number[] | null {
        if (!this.gesture) return null;

        if (this.gesture.type === 'drag') {
            const dx = canvasX - this.gesture.startX;
            const dy = canvasY - this.gesture.startY;
            return [1, 0, 0, 1, dx, dy];
        }

        if (this.gesture.type === 'scale') {
            const { dragStartX, dragStartY, pivotX, pivotY } = this.gesture;
            const dxOrig = dragStartX - pivotX;
            const dyOrig = dragStartY - pivotY;

            let sx = Math.abs(dxOrig) > 0.001 ? (canvasX - pivotX) / dxOrig : 1;
            let sy = Math.abs(dyOrig) > 0.001 ? (canvasY - pivotY) / dyOrig : 1;

            if (Math.abs(sx) < 0.01) sx = 0.01 * Math.sign(sx) || 0.01;
            if (Math.abs(sy) < 0.01) sy = 0.01 * Math.sign(sy) || 0.01;

            if (!isShiftDown) {
                // Escala uniforme: tomamos el mayor
                const scale = Math.max(Math.abs(sx), Math.abs(sy));
                sx = scale * Math.sign(sx);
                sy = scale * Math.sign(sy);
            }

            return [
                sx, 0,
                0, sy,
                pivotX * (1 - sx),
                pivotY * (1 - sy),
            ];
        }

        if (this.gesture.type === 'rotate') {
            const { initialAngle, centerX, centerY } = this.gesture;
            const currentAngle = Math.atan2(canvasY - centerY, canvasX - centerX);
            let deltaDeg = ((currentAngle - initialAngle) * 180) / Math.PI;

            if (isShiftDown) {
                deltaDeg = Math.round(deltaDeg / 15) * 15;
            }

            const m = new DOMMatrix()
                .translate(centerX, centerY)
                .rotate(deltaDeg)
                .translate(-centerX, -centerY);

            return [m.a, m.b, m.c, m.d, m.e, m.f];
        }

        return null;
    }

    public getGestureType(): 'drag' | 'scale' | 'rotate' | null {
        return this.gesture?.type ?? null;
    }

    public clear(): void {
        this.gesture = null;
    }

    // ── Utilidad: recalcula bbox proyectada tras aplicar una matriz ───────

    public static projectBbox(bbox: BoundingBox, m: number[]): BoundingBox {
        const pts = [
            { x: bbox.minX, y: bbox.minY }, { x: bbox.maxX, y: bbox.minY },
            { x: bbox.maxX, y: bbox.maxY }, { x: bbox.minX, y: bbox.maxY },
        ].map(p => ({
            x: p.x * m[0] + p.y * m[2] + m[4],
            y: p.x * m[1] + p.y * m[3] + m[5],
        }));

        return {
            minX: Math.min(...pts.map(p => p.x)),
            minY: Math.min(...pts.map(p => p.y)),
            maxX: Math.max(...pts.map(p => p.x)),
            maxY: Math.max(...pts.map(p => p.y)),
        };
    }
}