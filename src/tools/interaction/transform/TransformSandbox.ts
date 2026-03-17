// src/tools/interaction/transform/TransformSandbox.ts
//
// Responsabilidad ÚNICA: mantener el canvas offscreen con los trazos seleccionados
// renderizados en su estado actual (con transforms aplicados).
//
// El sandbox es un canvas invisible que se vuelca al paintingCanvas con la
// matriz de transformación activa en _renderLivePreview().
//
// CUÁNDO se regenera:
//   - Al entrar en estado FOCUSED (enterFocused)
//   - Después de commit de transform (la posición base cambió)
//   - En REQUEST_TRANSFORM_HANDLE_REFRESH (undo/redo externo)
//
// CONTRATOS:
//   generate()  → pinta los trazos seleccionados en el canvas offscreen
//   canvas      → getter del HTMLCanvasElement para pasarlo al renderer

import type { ToolContext } from '../../core/ITool';
import { CommandFactory } from '../../../history/commands/CommandFactory';

export class TransformSandbox {
    private _canvas: HTMLCanvasElement;

    constructor(width: number, height: number) {
        this._canvas = document.createElement('canvas');
        this._canvas.width = width;
        this._canvas.height = height;
    }

    public get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /**
     * Regenera el sandbox dibujando todos los trazos seleccionados con sus transforms.
     * Llama a storage si algún trazo no tiene datos en RAM.
     */
    public async generate(ctx: ToolContext): Promise<void> {
        const sCtx = this._canvas.getContext('2d')!;
        sCtx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        const { active, transforms, hiddenIds } = ctx.history.getState();

        for (const eventId of ctx.selection.selectedIds) {
            if (hiddenIds.has(eventId)) continue;

            const ev = active.find(e => e.id === eventId);
            if (!ev) continue;

            const cmd = CommandFactory.create(ev, ctx.activeBrush);
            await cmd.loadDataIfNeeded(ctx.storage);

            const t = transforms.get(eventId);
            if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

            cmd.execute(sCtx);
        }
    }
}