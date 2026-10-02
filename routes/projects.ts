import { Router } from "express";
import type { Response } from "express";
import type {
    ResponseError,
    ResponseSuccess,
    GetProjectsResponse,
    GetProjectResponse,
    AvailableFilters,
    DBAdapter
} from "../tipos.ts";
import { ListProjectsParamsSchema } from "../tipos.ts";
import { send, sendError } from "../lib/responses.ts";
import { asyncHandler } from "../lib/asyncHandler.ts";

export function projectsRouter(db: DBAdapter) {
    const r = Router();

    // ----------------------------------------------------------------
    // Listagem — um handler só, montado em 3 padrões de rota.
    // ----------------------------------------------------------------
    const listProjects = asyncHandler(
    async (req, res: Response<ResponseError | GetProjectsResponse>) => {
        const parsed = ListProjectsParamsSchema.safeParse(req.params);
        if (!parsed.success) {
            sendError(res, parsed.error.issues[0]?.message ?? "Invalid request parameters.", 400);
            return;
        }
        const { page, year, tag, professor, type } = parsed.data;
        const effectivePage = page ?? 1;

        const hasAnyFilter =
            year !== undefined || tag !== undefined ||
            professor !== undefined || type !== undefined;

        const filters = hasAnyFilter ? { year, tag, professor, type } : undefined;

        try {
            const val = await db.getProjects(effectivePage, filters);
            send(res, val);
        } catch (err) {
            console.error(err);
            sendError(res, "Error fetching projects.", 500);
        }
    });

    r.get("/getProjects/", listProjects);
    r.get("/getProjects/:page", listProjects);
    r.get("/getProjects/:page/:year/:tag/:professor/:type", listProjects);

    // ----------------------------------------------------------------
    // Filtros disponíveis
    // ----------------------------------------------------------------
    r.get(
        "/getAvailableFilters/",
        asyncHandler(async (_req, res: Response<ResponseError | ResponseSuccess<AvailableFilters>>) => {
            try {
                const val = await db.getAvailableFilters();
                send(res, val);
            } catch {
                sendError(res, "Error fetching available filters.", 500);
            }
        }),
    );

    // ----------------------------------------------------------------
    // Busca textual
    // ----------------------------------------------------------------
    r.get(
        "/searchProjects/:query/:page",
        asyncHandler(async (req, res: Response<ResponseError | GetProjectsResponse>) => {
            const { query } = req.params;
            const pageParsed = ListProjectsParamsSchema.pick({ page: true }).safeParse(req.params);
            if (!pageParsed.success) {
                sendError(res, pageParsed.error.issues[0]?.message ?? "Invalid page.", 400);
                return;
            }
            if (!query) {
                sendError(res, "Invalid query.", 400);
                return;
            }
            try {
                const val = await db.searchProject(query as string, pageParsed.data.page);
                send(res, val);
            } catch (err) {
                console.log(err);
                sendError(res, "Error fetching projects.", 500);
            }
        }),
    );

    // ----------------------------------------------------------------
    // Detalhes
    // ----------------------------------------------------------------
    r.get("/getProjectDetails/", (_req, res: Response<ResponseError>) =>
        sendError(res, "Missing id parameter. Use /getProjectDetails/:id", 400),
    );

    r.get(
        "/getProjectDetails/:id",
        asyncHandler(async (req, res: Response<ResponseError | GetProjectResponse>) => {
            const id = req.params.id;
            try {
                const val = await db.getProject(id as string);
                if (val) send(res, val);
                else sendError(res, "No project found with id: " + id, 404);
            } catch {
                sendError(res, "Error fetching project details.", 500);
            }
        }),
    );

    return r;
}