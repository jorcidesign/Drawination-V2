// src/history/DiagnosticsService.ts
import type { HistoryManager } from './HistoryManager';
import type { CacheManager } from './CacheManager';

export class DiagnosticsService {
    public static async printMetrics(actionTimeMs: number, history: HistoryManager, cache: CacheManager) {
        const estimate = navigator.storage && navigator.storage.estimate
            ? await navigator.storage.estimate()
            : { usage: 0, quota: 0 };

        const usageMB = (estimate.usage || 0) / (1024 * 1024);
        const quotaMB = (estimate.quota || 0) / (1024 * 1024);

        let jsHeap = 0;
        // Se usa (performance as any) porque memory es una API no estándar de V8 (Chrome)
        if ((performance as any).memory) {
            jsHeap = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
        }

        const memSnaps = cache.getStats ? cache.getStats().memoryCacheSize : 0;
        const totalEvents = history.getActiveEvents().length;
        const bytesRam = history.timeline.reduce((acc, ev) => acc + (ev.data ? ev.data.byteLength : 0), 0);

        console.groupCollapsed(`%c🖌️ Trazo #${totalEvents} procesado en ${actionTimeMs.toFixed(1)}ms`, 'color: #00d2ff; font-weight: bold;');
        console.log(`%c💾 Disco (IndexedDB): %c${usageMB.toFixed(2)} MB usados %c(de ${quotaMB.toFixed(0)} MB disp.)`, 'font-weight: bold;', 'color: #ffaa00;', 'color: gray;');
        console.log(`%c🧠 Memoria RAM (V8): %c${jsHeap > 0 ? jsHeap.toFixed(2) + ' MB' : 'No soportado'}`, 'font-weight: bold;', 'color: #00ff00;');
        console.log(`%c⚡ Caché Híbrido: %c${memSnaps} / 20 fotos en RAM`, 'font-weight: bold;', 'color: #00ff00;');
        console.log(`%c🗜️ Vectores en VIVO: %c${(bytesRam / 1024).toFixed(2)} KB en RAM activa`, 'font-weight: bold;', 'color: #ff00ff;');
        console.groupEnd();
    }
}