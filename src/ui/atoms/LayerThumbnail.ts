// src/ui/atoms/LayerThumbnail.ts
export class LayerThumbnail {
    public element: HTMLDivElement;

    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'layer-thumb';
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }
}