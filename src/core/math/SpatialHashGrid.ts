// src/core/SpatialHashGrid.ts
import type { BoundingBox } from './BoundingBox';

export class SpatialHashGrid {
    private cellSize: number;
    // Mapa donde la key es "x,y" (la coordenada de la celda) y el value un Set con los IDs de los trazos
    private cells: Map<string, Set<string>> = new Map();

    constructor(cellSize: number = 128) {
        this.cellSize = cellSize;
    }

    private hash(x: number, y: number): string {
        return `${x},${y}`;
    }

    // Insertar un trazo en todas las celdas que toca su BoundingBox
    public insert(id: string, bbox: BoundingBox): void {
        const minX = Math.floor(bbox.minX / this.cellSize);
        const minY = Math.floor(bbox.minY / this.cellSize);
        const maxX = Math.floor(bbox.maxX / this.cellSize);
        const maxY = Math.floor(bbox.maxY / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = this.hash(x, y);
                if (!this.cells.has(key)) {
                    this.cells.set(key, new Set());
                }
                this.cells.get(key)!.add(id);
            }
        }
    }

    // Remover un trazo de la grilla (opcional, el Hit-Testing lo filtra solo si no está activo, pero mantiene la memoria limpia)
    public remove(id: string, bbox: BoundingBox): void {
        const minX = Math.floor(bbox.minX / this.cellSize);
        const minY = Math.floor(bbox.minY / this.cellSize);
        const maxX = Math.floor(bbox.maxX / this.cellSize);
        const maxY = Math.floor(bbox.maxY / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = this.hash(x, y);
                const cell = this.cells.get(key);
                if (cell) {
                    cell.delete(id);
                    if (cell.size === 0) {
                        this.cells.delete(key);
                    }
                }
            }
        }
    }

    // Magia negra: te devuelve un Set ÚNICO con los IDs de los trazos en esa zona
    public query(region: BoundingBox): Set<string> {
        const result = new Set<string>();
        const minX = Math.floor(region.minX / this.cellSize);
        const minY = Math.floor(region.minY / this.cellSize);
        const maxX = Math.floor(region.maxX / this.cellSize);
        const maxY = Math.floor(region.maxY / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = this.hash(x, y);
                const cell = this.cells.get(key);
                if (cell) {
                    for (const id of cell) {
                        result.add(id);
                    }
                }
            }
        }
        return result;
    }

    public clear(): void {
        this.cells.clear();
    }
}