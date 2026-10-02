import type { FileStorage } from "./tipos.ts";
import { LocalFileStorage } from "./local.ts";
import { SupabaseFileStorage } from "./supabase.ts";
import type { DBDriver } from "../../db.ts";

export function createFileStorage(driver: DBDriver): FileStorage {
    return driver === "postgres"
        ? new SupabaseFileStorage()
        : new LocalFileStorage();
}

export type { FileStorage } from "./tipos.ts";