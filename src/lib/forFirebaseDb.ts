/**
 * Realtime Database no acepta `undefined` en ningún nivel del árbol.
 * JSON elimina claves con `undefined` al serializar.
 */
export function forFirebaseDb<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
