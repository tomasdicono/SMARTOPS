import type { User } from "../types";

/** Solo usuarios creados o reseteados con clave temporal deben cambiarla antes de usar la app. */
export function userMustChangePassword(user: User): boolean {
    return user.mustChangePassword === true;
}
