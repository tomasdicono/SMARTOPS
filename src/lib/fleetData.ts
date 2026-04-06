export interface Aircraft {
    registration: string;
    model: string;
    capacity: number;
}

const rawData = [
    ["CC-AWA", "A320-232"], ["CC-AWC", "A320-232"], ["CC-AWE", "A320-232"], ["CC-AWJ", "A320-271"],
    ["CC-AWK", "A320-271"], ["CC-AWL", "A320-271"], ["CC-AWN", "A320-271"], ["CC-AWO", "A320-271"],
    ["CC-AWQ", "A320-271"], ["CC-AWR", "A320-271"], ["CC-AWS", "A321-271"], ["CC-AWT", "A321-271"],
    ["CC-AWU", "A321-271"], ["CC-AWV", "A320-271"], ["CC-AWW", "A321-271"], ["CC-AWX", "A320-271"],
    ["CC-AWY", "A321-271"], ["CC-AWZ", "A320-271"], ["CC-DIA", "A320-271"], ["CC-DIB", "A321-271"],
    ["CC-DIC", "A321-271"], ["CC-DID", "A320-271"], ["CC-DIE", "A321-271"], ["CC-DIF", "A321-271"],
    ["CC-DIG", "A320-271"], ["CC-DIH", "A320-271"], ["CC-DII", "A320-271"], ["CC-DIJ", "A320-271"],
    ["CC-DIK", "A320-271"], ["CC-DIL", "A320-271"], ["CC-DIM", "A320-271"], ["CC-DIN", "A320-271"],
    ["CC-DIO", "A320-271"], ["CC-DIP", "A320-271"], ["CC-DIQ", "A321-271"], ["CC-DIR", "A320-271"],
    ["CC-DIS", "A321-271"], ["CC-DIT", "A320-271"], ["CC-DIU", "A320-271"], ["CC-DIV", "A320-271"],
    ["CC-DIW", "A320-271"], ["CC-DIX", "A320-271"], ["LV-HEK", "A320-232"], ["LV-HVT", "A320-232"],
    ["LV-IVN", "A320-232"], ["LV-IVO", "A320-232"], ["LV-JQE", "A320-232"], ["LV-KDP", "A320-232"],
    ["LV-KFX", "A320-232"], ["LV-KJA", "A320-232"]
];

export const FLEET_DATA: Record<string, Aircraft> = {};

rawData.forEach(([reg, model]) => {
    const capacity = model.includes("321") ? 240 : 186;
    FLEET_DATA[reg] = { registration: reg, model, capacity };
});

export const getAircraftInfo = (reg: string): Aircraft | null => {
    return FLEET_DATA[reg.toUpperCase()] || null;
};
