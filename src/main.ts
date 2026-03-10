// src/main.ts
import { DrawinationApp } from './app/DrawinationApp';

// Esperamos a que el HTML cargue completamente antes de arrancar el motor
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Boom. Una sola línea arranca todo el motor (EventBus, UI, Canvas, etc.)
    const app = new DrawinationApp('drawination-workspace');

    // Lo exportamos a Window para poder debugear desde la consola
    (window as any).drawinationApp = app;

    console.log("🚀 Drawination Engine iniciado correctamente");
  } catch (error) {
    console.error("Error al iniciar la app:", error);
  }
});