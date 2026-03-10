// src/core/math/Geometry.ts
import type { BasePoint } from '../../input/InputManager';

export class Geometry {
    /**
     * Algoritmo Ray Casting (Point-in-Polygon).
     * Retorna true si el punto (x, y) está dentro del polígono formado por 'vertices'.
     */
    public static isPointInPolygon(x: number, y: number, vertices: BasePoint[]): boolean {
        let isInside = false;

        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            // Verificamos si la línea horizontal imaginaria cruza el segmento
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) {
                isInside = !isInside;
            }
        }

        return isInside;
    }
}