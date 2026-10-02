import type { Express } from "express";
import type { DBAdapter } from "../tipos.ts";
import { projectsRouter } from "./projects.ts";
import { adminsRouter } from "./admins.ts";
import { adminProjectsRouter } from "./admin-projects.ts";

export function mountRoutes(app: Express, db: DBAdapter) {
    app.use(projectsRouter(db));
    app.use(adminsRouter(db));
    app.use(adminProjectsRouter(db));
}