import { Icon } from "lucide-react";
import { broom } from "@lucide/lab";

type Props = {
    className?: string;
};

/** Escoba (Lucide Lab) — mismo estilo que el resto de iconos. */
export function BroomIcon({ className }: Props) {
    return <Icon iconNode={broom} className={className} aria-hidden />;
}
