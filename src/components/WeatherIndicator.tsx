import { useEffect, useState } from "react";
import { CloudLightning } from "lucide-react";
import { fetchWeatherAlert } from "../lib/weatherApi";
import type { WeatherAlert } from "../lib/weatherApi";

interface Props {
    iata: string;
    date: string;
    time: string;
    align?: "left" | "right";
}

export function WeatherIndicator({ iata, date, time, align = "left" }: Props) {
    const [alert, setAlert] = useState<WeatherAlert | null>(null);

    useEffect(() => {
        fetchWeatherAlert(iata, date, time).then(res => setAlert(res));
    }, [iata, date, time]);

    if (!alert || !alert.hasAlert) return null;

    return (
        <div className={`absolute -top-4 ${align === "left" ? "-left-5" : "-right-5"} group cursor-help z-10 flex items-center justify-center bg-red-100 dark:bg-red-900/80 p-1.5 rounded-full shadow-sm border border-red-200 dark:border-red-800 animate-in zoom-in`}>
            <CloudLightning className="w-5 h-5 text-red-600 dark:text-red-400" />

            {/* Tooltip */}
            <div className={`absolute opacity-0 group-hover:opacity-100 transition-opacity bottom-full mb-2 ${align === "left" ? "left-0" : "right-0"} w-56 bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl pointer-events-none z-50`}>
                <div className="font-bold border-b border-slate-700 pb-1.5 mb-2 text-cyan-400">
                    METAR · {iata} ({time} LT)
                </div>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-200">
                    {alert.messages.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
                <div className={`absolute -bottom-1 ${align === "left" ? "left-4" : "right-4"} w-2 h-2 bg-slate-900 rotate-45`}></div>
            </div>
        </div>
    );
}
