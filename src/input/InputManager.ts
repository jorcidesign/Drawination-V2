// src/core/InputManager.ts
//
// CAMBIO vs versión anterior:
//   setPointerCapture() y releasePointerCapture() envueltos en try/catch.
//
// POR QUÉ:
//   Los PointerEvents sintéticos (DebugBot, tests) tienen un pointerId válido
//   pero NO registrado en el sistema de hardware del browser.
//   El browser lanza NotFoundError en esas dos llamadas aunque el evento sea
//   bien formado — es un requisito del spec que el pointer esté "activo".
//
//   Con tableta real o mouse: comportamiento idéntico al anterior.
//   Con bot/tests: los eventos se procesan normalmente, solo se ignora
//   el error de capture (que no importa porque move/up ya llegan via window).

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
        try {
            this.element.setPointerCapture(e.pointerId);
        } catch {
            // PointerEvent sintético (bot/tests) — el pointer no está registrado
            // en hardware. En uso normal con tableta o mouse nunca falla.
        }
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
        try {
            this.element.releasePointerCapture(e.pointerId);
        } catch {
            // Mismo motivo que setPointerCapture arriba.
        }
        if (this.onPointerUp) this.onPointerUp(this.extractData(e));
    }

    private handleWheel(e: WheelEvent) {
        e.preventDefault();
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