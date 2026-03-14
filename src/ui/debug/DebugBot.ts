// src/ui/debug/DebugBot.ts
//
// Bot de pruebas de estrés — completamente autónomo.
// Simula trazos sobre el canvas para detectar bugs, fugas de memoria
// y degradación de rendimiento sin necesidad de dibujar manualmente.
//
// AUTONOMÍA: Solo necesita el elemento canvas y el EventBus.
// No importa HistoryManager, BrushEngine, ni ningún subsistema interno.
// Toda la interacción es via PointerEvents y EventBus — exactamente
// como lo hace un usuario real.
//
// CONFIGURACIÓN: Cambiar BOT_CONFIG aquí, no en ningún otro archivo.
//   totalStrokes:       cuántos trazos en total
//   delayBetweenMs:     ms entre trazos (0 = máxima velocidad, cede al event loop cada 5 pts)
//   eraseRatio:         0.0–1.0, fracción de trazos que son borrador
//   fillRatio:          0.0–1.0, fracción de trazos que son relleno
//   undoEvery:          cada N trazos hacer Ctrl+Z (0 = nunca)
//   redoAfterUndo:      hacer Ctrl+Y después de cada Ctrl+Z
//   minPoints/maxPoints: rango de puntos por trazo
//   strokeTypes:        'line' | 'curve' | 'arc' | 'all' — tipo de geometría

export interface BotConfig {
    totalStrokes: number;
    delayBetweenMs: number;
    eraseRatio: number;
    fillRatio: number;
    undoEvery: number;
    redoAfterUndo: boolean;
    minPoints: number;
    maxPoints: number;
    strokeTypes: 'line' | 'curve' | 'arc' | 'all';
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
    totalStrokes: 100,
    delayBetweenMs: 15,
    eraseRatio: 0.15,
    fillRatio: 0.05,
    undoEvery: 50,
    redoAfterUndo: true,
    minPoints: 20,
    maxPoints: 40,
    strokeTypes: 'all',
};

type ProfileKey = 'pencil' | 'ink' | 'eraser' | 'fill';

// Eventos del EventBus que el bot puede emitir — son los mismos que emite la UI
const PROFILE_EVENTS: Record<ProfileKey, string> = {
    pencil: 'SET_PROFILE_PENCIL',
    ink: 'SET_PROFILE_INK',
    eraser: 'SET_TOOL_ERASER',
    fill: 'SET_PROFILE_FILL',
};

export class DebugBot {
    private eventBus: { emit(event: string, payload?: any): void };
    private canvasEl: HTMLElement;
    private running = false;
    private strokesDone = 0;
    private startTime = 0;
    private timings: number[] = [];

    constructor(
        eventBus: { emit(event: string, payload?: any): void },
        canvasEl: HTMLElement
    ) {
        this.eventBus = eventBus;
        this.canvasEl = canvasEl;
    }

    public isRunning(): boolean { return this.running; }
    public getStrokesDone(): number { return this.strokesDone; }

    public async start(overrides: Partial<BotConfig> = {}): Promise<void> {
        if (this.running) {
            console.warn('[DebugBot] Ya está corriendo. Llama stop() primero.');
            return;
        }

        const cfg = { ...DEFAULT_BOT_CONFIG, ...overrides };
        this.running = true;
        this.strokesDone = 0;
        this.timings = [];
        this.startTime = performance.now();

        console.group(`%c🤖 DebugBot arrancado: ${cfg.totalStrokes} trazos`, 'color:#e74c3c;font-weight:bold');
        console.table({
            totalStrokes: cfg.totalStrokes,
            eraseRatio: `${(cfg.eraseRatio * 100).toFixed(0)}%`,
            fillRatio: `${(cfg.fillRatio * 100).toFixed(0)}%`,
            undoEvery: cfg.undoEvery || 'nunca',
            strokeTypes: cfg.strokeTypes,
            delayMs: cfg.delayBetweenMs,
        });

        try {
            for (let i = 0; i < cfg.totalStrokes; i++) {
                if (!this.running) break;

                // Cambiar profile cada 15 trazos
                if (i % 15 === 0) {
                    this._switchProfile(this._pickProfile(cfg));
                }

                // Undo/Redo periódico
                if (cfg.undoEvery > 0 && i > 0 && i % cfg.undoEvery === 0) {
                    await this._doUndoRedo(cfg.redoAfterUndo);
                }

                const t0 = performance.now();
                await this._drawRandomStroke(cfg);
                this.timings.push(performance.now() - t0);
                this.strokesDone++;

                if (this.strokesDone % 50 === 0) this._logProgress(cfg.totalStrokes);

                await this._sleep(cfg.delayBetweenMs);
            }
        } finally {
            this.running = false;
            this._logSummary();
            console.groupEnd();
        }
    }

    public stop(): void {
        if (!this.running) return;
        this.running = false;
        console.log('%c🤖 DebugBot detenido manualmente', 'color:#e74c3c');
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private _pickProfile(cfg: BotConfig): ProfileKey {
        const r = Math.random();
        if (r < cfg.eraseRatio) return 'eraser';
        if (r < cfg.eraseRatio + cfg.fillRatio) return 'fill';
        return Math.random() < 0.5 ? 'pencil' : 'ink';
    }

    private _switchProfile(profile: ProfileKey): void {
        const eventName = PROFILE_EVENTS[profile];
        if (eventName) this.eventBus.emit(eventName);
    }

    private async _drawRandomStroke(cfg: BotConfig): Promise<void> {
        const rect = this.canvasEl.getBoundingClientRect();
        const W = rect.width || 1180;
        const H = rect.height || 1180;

        const n = cfg.minPoints + Math.floor(Math.random() * (cfg.maxPoints - cfg.minPoints));

        const type = cfg.strokeTypes === 'all'
            ? (['line', 'curve', 'arc'] as const)[Math.floor(Math.random() * 3)]
            : cfg.strokeTypes;

        const points = type === 'line' ? this._line(n, W, H)
            : type === 'curve' ? this._curve(n, W, H)
                : this._arc(n, W, H);

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const evType = i === 0 ? 'pointerdown' : i === points.length - 1 ? 'pointerup' : 'pointermove';

            this.canvasEl.dispatchEvent(new PointerEvent(evType, {
                bubbles: true, cancelable: true,
                clientX: rect.left + p.x,
                clientY: rect.top + p.y,
                pressure: evType === 'pointerup' ? 0 : p.pressure,
                pointerType: 'pen',
                pointerId: 1,
                isPrimary: true,
            }));

            // Ceder al event loop cada 5 puntos para no bloquear la UI
            if (i > 0 && i % 5 === 0) await this._sleep(0);
        }

        // Garantizar pointerup final
        const last = points[points.length - 1];
        this.canvasEl.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true,
            clientX: rect.left + last.x,
            clientY: rect.top + last.y,
            pressure: 0, pointerType: 'pen', pointerId: 1, isPrimary: true,
        }));
    }

    private _line(n: number, W: number, H: number) {
        const x0 = rnd(0.1, 0.9) * W, y0 = rnd(0.1, 0.9) * H;
        const x1 = rnd(0.1, 0.9) * W, y1 = rnd(0.1, 0.9) * H;
        return Array.from({ length: n }, (_, i) => {
            const t = i / (n - 1);
            return { x: lerp(x0, x1, t) + jitter(3), y: lerp(y0, y1, t) + jitter(3), pressure: arcPressure(t) };
        });
    }

    private _curve(n: number, W: number, H: number) {
        const x0 = rnd(0, 1) * W, y0 = rnd(0, 1) * H;
        const cx = rnd(0, 1) * W, cy = rnd(0, 1) * H;
        const x1 = rnd(0, 1) * W, y1 = rnd(0, 1) * H;
        return Array.from({ length: n }, (_, i) => {
            const t = i / (n - 1), mt = 1 - t;
            return {
                x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
                y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
                pressure: arcPressure(t),
            };
        });
    }

    private _arc(n: number, W: number, H: number) {
        const cx = rnd(0.2, 0.8) * W, cy = rnd(0.2, 0.8) * H;
        const r = rnd(20, 180);
        const startAngle = Math.random() * Math.PI * 2;
        const sweep = (0.5 + Math.random() * 1.5) * Math.PI;
        return Array.from({ length: n }, (_, i) => {
            const t = i / (n - 1);
            const angle = startAngle + sweep * t;
            return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, pressure: arcPressure(t) };
        });
    }

    private async _doUndoRedo(withRedo: boolean): Promise<void> {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        await this._sleep(60);
        if (withRedo) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
            await this._sleep(60);
        }
    }

    private _logProgress(total: number): void {
        const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
        const pct = Math.round((this.strokesDone / total) * 100);
        const avg = avgMs(this.timings);
        console.log(`%c🤖 ${this.strokesDone}/${total} (${pct}%) | ${elapsed}s | ${avg}ms avg/trazo`, 'color:#e67e22');
    }

    private _logSummary(): void {
        const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(2);
        const sorted = [...this.timings].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(sorted.length * 0.99)]?.toFixed(1) ?? '?';
        console.log(
            `%c🤖 Resumen: %c${this.strokesDone} trazos | ${elapsed}s | avg ${avgMs(this.timings)}ms | max ${Math.max(...this.timings).toFixed(1)}ms | p99 ${p99}ms`,
            'color:#e74c3c;font-weight:bold', 'color:#aaa'
        );
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }
}

// ── Helpers puros ─────────────────────────────────────────────────────────────
function rnd(min: number, max: number): number { return min + Math.random() * (max - min); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function jitter(amp: number): number { return (Math.random() - 0.5) * 2 * amp; }
function arcPressure(t: number): number { return 0.3 + Math.sin(t * Math.PI) * 0.7; }
function avgMs(arr: number[]): string {
    return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '?';
}