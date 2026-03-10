// src/core/ObjectPool.ts
import type { PointerData } from '../../input/InputManager';
import type { StrokePoint } from '../io/BinarySerializer';

export class ObjectPool {
    private static strokePoints: StrokePoint[] = [];
    private static strokeIndex: number = 0;

    private static pointerData: PointerData[] = [];
    private static pointerIndex: number = 0;

    // Obtiene un objeto para el historial
    static getStrokePoint(x: number, y: number, pressure: number, t: number): StrokePoint {
        if (this.strokeIndex >= this.strokePoints.length) {
            // Si nos quedamos sin objetos, creamos uno nuevo (solo pasa en los primeros trazos)
            this.strokePoints.push({ x: 0, y: 0, pressure: 0, t: 0 });
        }
        const pt = this.strokePoints[this.strokeIndex++];
        pt.x = x;
        pt.y = y;
        pt.pressure = pressure;
        pt.t = t;
        return pt;
    }

    // Obtiene un objeto para el InputManager y el Brush
    static getPointerData(x: number, y: number, pressure: number, pointerType: string): PointerData {
        if (this.pointerIndex >= this.pointerData.length) {
            this.pointerData.push({ x: 0, y: 0, pressure: 0, pointerType: '' });
        }
        const pt = this.pointerData[this.pointerIndex++];
        pt.x = x;
        pt.y = y;
        pt.pressure = pressure;
        pt.pointerType = pointerType;
        return pt;
    }

    // Se llama al levantar el lápiz para reciclar TODOS los objetos usados en ese trazo
    static reset() {
        this.strokeIndex = 0;
        this.pointerIndex = 0;
    }
}