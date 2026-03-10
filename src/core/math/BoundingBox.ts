// src/core/BoundingBox.ts
import type { StrokePoint } from '../io/BinarySerializer';

export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class BBoxUtils {
    // Calcula la caja que envuelve perfectamente a un trazo
    static computeFromPoints(points: StrokePoint[], brushSize: number): BoundingBox {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // El padding asegura que el grosor del pincel (y la punta redonda) queden dentro de la caja
        const padding = Math.ceil(brushSize / 2) + 2;

        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        return {
            minX: Math.floor(minX - padding),
            minY: Math.floor(minY - padding),
            maxX: Math.ceil(maxX + padding),
            maxY: Math.ceil(maxY + padding)
        };
    }

    // Comprueba si dos cajas se tocan (Intersección AABB)
    static intersects(a: BoundingBox, b: BoundingBox): boolean {
        return (
            a.minX <= b.maxX &&
            a.maxX >= b.minX &&
            a.minY <= b.maxY &&
            a.maxY >= b.minY
        );
    }
}