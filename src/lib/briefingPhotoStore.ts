import { get, ref, remove, set } from "firebase/database";
import { db } from "./firebase";

export function briefingPhotoRef(flightId: string) {
    return ref(db, `briefingPhotos/${flightId}`);
}

export function briefingPhotoHash(dataUrl: string): string {
    let h = 5381;
    for (let i = 0; i < dataUrl.length; i++) {
        h = ((h << 5) + h) ^ dataUrl.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
}

export async function fetchBriefingPhoto(flightId: string): Promise<string> {
    const id = String(flightId ?? "").trim();
    if (!id) return "";
    const snap = await get(briefingPhotoRef(id));
    const value = snap.val();
    return typeof value === "string" ? value.trim() : "";
}

export async function saveBriefingPhoto(flightId: string, dataUrl: string): Promise<void> {
    const id = String(flightId ?? "").trim();
    const photo = String(dataUrl ?? "").trim();
    if (!id) return;
    if (!photo) {
        await remove(briefingPhotoRef(id));
        return;
    }
    await set(briefingPhotoRef(id), photo);
}
