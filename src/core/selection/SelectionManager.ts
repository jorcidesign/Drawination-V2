// src/core/selection/SelectionManager.ts
import type { BoundingBox } from '../math/BoundingBox';

export class SelectionManager {
    public selectedIds: Set<string> = new Set();
    public bbox: BoundingBox | null = null;

    public setSelection(ids: Set<string>, bbox: BoundingBox) {
        this.selectedIds = new Set(ids);
        this.bbox = bbox;
    }

    public clear() {
        this.selectedIds.clear();
        this.bbox = null;
    }

    public isSelected(id: string): boolean {
        return this.selectedIds.has(id);
    }

    public hasSelection(): boolean {
        return this.selectedIds.size > 0;
    }
}