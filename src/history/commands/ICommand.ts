// src/history/commands/ICommand.ts
import type { StorageManager } from '../../storage/StorageManager';
import type { BoundingBox } from '../../core/math/BoundingBox';
import type { ActionType } from '../HistoryManager';

export interface ICommand {
    readonly id: string;
    readonly type: ActionType;
    readonly bbox?: BoundingBox;

    // === NUEVO: Matriz Afín [a, b, c, d, tx, ty] ===
    transform?: number[];

    loadDataIfNeeded(storage: StorageManager): Promise<void>;
    execute(ctx: CanvasRenderingContext2D): void;
    getRawData(): ArrayBuffer | null;
}