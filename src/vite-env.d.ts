/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * URL base del proxy hacia aviationweather.gov (sin slash final), p. ej.
     * `https://tu-worker.workers.dev` o vacío para usar `/api/aviation` en el mismo origen.
     */
    readonly VITE_AVIATION_WEATHER_BASE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
