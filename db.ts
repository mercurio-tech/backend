import type { DBAdapter } from "./tipos.ts";
import { PostgresDB } from "./postgres.ts";
import { SQLiteDB } from "./sqlite.ts";

export type DBDriver = "postgres" | "sqlite";

export function createDB(driver?: DBDriver): DBAdapter {
    const chosen =
        driver ?? (process.env.DB_DRIVER as DBDriver | undefined) ?? "postgres";
    switch (chosen) {
        case "sqlite":
            return new SQLiteDB();
        case "postgres":
        default:
            return new PostgresDB();
    }
}

export type { DBAdapter } from "./tipos.ts";