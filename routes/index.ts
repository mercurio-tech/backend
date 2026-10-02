import type { Express } from "express";
import type { DBAdapter } from "../tipos.ts";
import { projectsRouter } from "./projects.ts";
import { adminsRouter } from "./admins.ts";
import { adminProjectsRouter } from "./admin-projects.ts";
import type { FileStorage } from "../lib/storage/index.ts";

export function mountRoutes(app: Express, db: DBAdapter, storage: FileStorage) {
    app.use(projectsRouter(db));
    app.use(adminsRouter(db));
    app.use(adminProjectsRouter(db, storage));
}