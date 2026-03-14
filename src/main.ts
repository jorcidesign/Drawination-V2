// src/main.ts
import { DrawinationApp } from './app/DrawinationApp';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const app = new DrawinationApp('drawination-workspace');
    (window as any).drawinationApp = app;

    // === FIX: Sin este await, storage.init() nunca corre y la sesión
    // no se restaura al refrescar. También es la causa raíz de los
    // primeros trazos que no se guardaban en IDB.
    await app.init();

    console.log("🚀 Drawination Engine iniciado correctamente");
  } catch (error) {
    console.error("Error al iniciar la app:", error);
  }
});