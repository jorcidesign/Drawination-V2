// src/history/commands/ICommand.ts
import type { BoundingBox } from '../../core/math/BoundingBox';
import type { StorageManager } from '../../storage/StorageManager';
import type { TimelineEvent } from '../HistoryManager';

export interface ICommand {
    readonly id: string;
    readonly type: string;
    readonly bbox?: BoundingBox;

    // El comando se encarga de cargarse desde IndexedDB si la RAM está vacía
    loadDataIfNeeded(storage: StorageManager): Promise<void>;

    // Dibuja su contenido en el lienzo
    execute(ctx: CanvasRenderingContext2D): void;

    // (Opcional) Para la botonera de debug
    getRawData(): ArrayBuffer | null;
}