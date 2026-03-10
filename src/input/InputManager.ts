// src/core/InputManager.ts
import { ObjectPool } from '../core/memory/ObjectPool';

export type BasePoint = {
    x: number;
    y: number;
    pressure: number;
};

export type PointerData = BasePoint & {
    pointerType: string;
};

export class InputManager {
    private element: HTMLElement;
    private isDrawing: boolean = false;

    public onPointerDown: ((data: PointerData) => void) | null = null;
    public onPointerMove: ((data: PointerData) => void) | null = null;
    public onPointerUp: ((data: PointerData) => void) | null = null;

    // === NUEVO: Evento para la Rueda / Trackpad ===
    public onWheel: ((e: WheelEvent, data: BasePoint) => void) | null = null;

    constructor(element: HTMLElement) {
        this.element = element;
        this.bindEvents();
    }

    private bindEvents() {
        this.element.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        window.addEventListener('pointermove', this.handlePointerMove.bind(this));
        window.addEventListener('pointerup', this.handlePointerUp.bind(this));
        window.addEventListener('pointercancel', this.handlePointerUp.bind(this));

        // El { passive: false } es VITAL para que preventDefault() funcione y la página no scrollee
        this.element.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    private extractData(e: PointerEvent): PointerData {
        const rect = this.element.getBoundingClientRect();
        const pressure = e.pressure !== 0 ? e.pressure : (e.pointerType === 'mouse' ? 1 : 0.5);

        return ObjectPool.getPointerData(
            e.clientX - rect.left,
            e.clientY - rect.top,
            pressure,
            e.pointerType
        );
    }

    private handlePointerDown(e: PointerEvent) {
        this.isDrawing = true;
        this.element.setPointerCapture(e.pointerId);
        if (this.onPointerDown) this.onPointerDown(this.extractData(e));
    }

    private handlePointerMove(e: PointerEvent) {
        if (!this.isDrawing) return;
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];

        for (const event of events) {
            if (this.onPointerMove) this.onPointerMove(this.extractData(event));
        }
    }

    private handlePointerUp(e: PointerEvent) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.element.releasePointerCapture(e.pointerId);
        if (this.onPointerUp) this.onPointerUp(this.extractData(e));
    }

    // === NUEVO ===
    private handleWheel(e: WheelEvent) {
        e.preventDefault(); // Mata el comportamiento del navegador (zoom nativo de página o scroll)
        const rect = this.element.getBoundingClientRect();
        if (this.onWheel) {
            this.onWheel(e, {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                pressure: 0
            });
        }
    }
}