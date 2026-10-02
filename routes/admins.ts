import { Router } from "express";
import type { Response } from "express";
import * as z from "zod";
import type {
    ResponseError,
    ResponseSuccess,
    RegisterAdminResponse,
    GetAdminPresentResponse,
    DBAdapter
} from "../tipos.ts";
import {
    RegisterAdminSchema,
    IsAdminSchema,
    Perms,
} from "../tipos.ts";
import { send, sendError } from "../lib/responses.ts";
import { asyncHandler } from "../lib/asyncHandler.ts";

export function adminsRouter(db: DBAdapter) {
    const r = Router();

    r.get(
        "/isAdminPresent/",
        asyncHandler(async (_req, res: Response<ResponseError | GetAdminPresentResponse>) => {
            try {
                const val = await db.getAdminCount();
                send(res, val !== 0);
            } catch {
                sendError(res, "Error fetching admin count.", 500);
            }
        }),
    );

    r.post(
        "/isAdmin/",
        asyncHandler(async (req, res: Response<ResponseError | ResponseSuccess<boolean>>) => {
            let body: z.infer<typeof IsAdminSchema>;
            try {
                body = IsAdminSchema.parse(req.body);
            } catch {
                sendError(res, "Invalid request body.", 400);
                return;
            }
            send(res, {
                message: await db.verifyAuth(
                    body.auth.username,
                    body.auth.password,
                    Perms.ADMIN,
                ),
            });
        }),
    );

    r.post(
        "/registerAdmin/",
        asyncHandler(async (req, res: Response<ResponseError | RegisterAdminResponse>) => {
            let body: z.infer<typeof RegisterAdminSchema>;
            try {
                body = RegisterAdminSchema.parse(req.body);
            } catch {
                sendError(res, "Invalid request body.", 400);
                return;
            }
            const { username, password, permission } = body;
            const adminCount = await db.getAdminCount();

            if (adminCount === 0) {
                await db.insertAdmin(username, password, permission);
                send(res, { message: "Admin registered successfully." }, 201);
                return;
            }

            if (body.auth === undefined) {
                sendError(res, "Authentication required to register new admin.", 401);
                return;
            }
            const isAuth = await db.verifyAuth(
                body.auth.username,
                body.auth.password,
                Perms.ADMIN,
            );
            if (!isAuth) {
                sendError(res, "Could not authenticate user.", 401);
                return;
            }
            if ((await db.insertAdmin(username, password, permission)) !== false) {
                send(res, { message: "Admin registered successfully." }, 201);
            } else {
                sendError(res, "Duplicate Admin");
            }
        }),
    );

    return r;
}