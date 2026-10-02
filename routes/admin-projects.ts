import { Router } from "express";
import type { Response } from "express";
import multer from "multer";
import * as z from "zod";
import type { ResponseError, ResponseSuccess, DBAdapter } from "../tipos.ts";
import {
    CreateProjectSchema,
    UpdateProjectSchema,
    DeleteProjectSchema,
    Perms,
} from "../tipos.ts";
import { send, sendError } from "../lib/responses.ts";
import { uploadFiles, deleteFiles } from "../lib/files.ts";
import { asyncHandler } from "../lib/asyncHandler.ts";

export function adminProjectsRouter(db: DBAdapter) {
    const r = Router();
    const upload = multer();
    const filesMiddleware = upload.fields([
        { name: "image", maxCount: 1 },
        { name: "pdf", maxCount: 1 },
    ]);

    r.post(
        "/createProject/",
        filesMiddleware,
        asyncHandler(async (req, res: Response<ResponseError>) => {
            let body;
            try {
                if (req.body.auth && req.body.project) {
                    body = CreateProjectSchema.parse({
                        auth: JSON.parse(req.body.auth),
                        project: JSON.parse(req.body.project),
                    });
                } else {
                    throw new Error("bad");
                }
            } catch {
                sendError(res, "Invalid request body.", 400);
                return;
            }

            const isAuth = await db.verifyAuth(
                body.auth.username, body.auth.password, Perms.EDITOR,
            );
            if (!isAuth) {
                sendError(res, "Could not authenticate user.", 401);
                return;
            }

            const extension = await uploadFiles(req, res, db, true);
            if (extension === undefined) return;

            await db.putProject({ ...body.project, extensao: extension });
            send(res, { message: "Project created successfully." }, 201);
        }),
    );

    r.post(
        "/updateProject/",
        filesMiddleware,
        asyncHandler(async (req, res: Response<ResponseError | ResponseSuccess<object>>) => {
            let body;
            try {
                if (req.body.auth && req.body.project) {
                    body = UpdateProjectSchema.parse({
                        auth: JSON.parse(req.body.auth),
                        project: JSON.parse(req.body.project),
                    });
                } else {
                    throw new Error("bad");
                }
            } catch {
                sendError(res, "Invalid request body.", 400);
                return;
            }

            const isAuth = await db.verifyAuth(
                body.auth.username, body.auth.password, Perms.EDITOR,
            );
            if (!isAuth) {
                sendError(res, "Could not authenticate user.", 401);
                return;
            }

            let updated;
            try {
                const files = req as unknown as {
                    files: { image: Express.Multer.File[]; pdf: Express.Multer.File[] };
                };
                let extension: string | undefined;
                const pdfPresent = files.files?.pdf !== undefined;
                const imagePresent = files.files?.image !== undefined;
                if (pdfPresent || imagePresent) {
                    await deleteFiles(body.project.id, imagePresent, pdfPresent);
                    extension = await uploadFiles(req, res, db, false, body.project.id);
                }
                updated = await db.updateProject({
                    ...body.project,
                    extensao: extension,
                });
            } catch (error) {
                console.log(error);
                sendError(res, "Error updating project.", 500);
                return;
            }
            if (!updated) {
                sendError(res, "No project found with id: " + body.project.id, 404);
                return;
            }
            send(res, { message: "Project updated successfully." });
        }),
    );

    r.post(
        "/deleteProject/",
        asyncHandler(async (req, res: Response<ResponseError | ResponseSuccess<boolean>>) => {
            let body: z.infer<typeof DeleteProjectSchema>;
            try {
                body = DeleteProjectSchema.parse(req.body);
            } catch {
                sendError(res, "Invalid request body.", 400);
                return;
            }
            const isAuth = await db.verifyAuth(
                body.auth.username, body.auth.password, Perms.ADMIN,
            );
            if (!isAuth) {
                sendError(res, "Could not authenticate user.", 401);
                return;
            }
            await deleteFiles(body.id, true, true);
            await db.deleteProject(body.id);
            send(res, { message: true });
        }),
    );

    return r;
}