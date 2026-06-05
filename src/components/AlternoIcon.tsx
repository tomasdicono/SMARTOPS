type Props = {
    className?: string;
};

/**
 * Desvío: ruta programada (→ tenue) y bifurcación hacia el alterno (↘).
 */
export function AlternoIcon({ className }: Props) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            {/* Destino programado (referencia) */}
            <path d="M4 8h9" strokeWidth="1.5" opacity="0.35" />
            <path d="M13 8l2-2" strokeWidth="1.5" opacity="0.35" />
            <path d="M13 8l2 2" strokeWidth="1.5" opacity="0.35" />

            {/* Origen → bifurcación → alterno */}
            <path d="M4 12h5" strokeWidth="2" />
            <circle cx="9" cy="12" r="1.25" fill="currentColor" stroke="none" />
            <path d="M9 12l7 7" strokeWidth="2" />
            <path d="M14 17l3 1" strokeWidth="2" />
            <path d="M14 17l1 3" strokeWidth="2" />
        </svg>
    );
}
