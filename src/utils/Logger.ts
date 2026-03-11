// src/utils/Logger.ts
export class Logger {
    private static isDev = import.meta.env.DEV; // Vite nos dice si estamos en local

    public static info(msg: string, ...args: any[]) {
        if (this.isDev) console.log(`[Drawination] ${msg}`, ...args);
    }

    public static metric(title: string, value: string, color: string = '#00d2ff') {
        if (this.isDev) {
            console.log(`%c📊 ${title}: %c${value}`, 'font-weight: bold;', `color: ${color};`);
        }
    }
}