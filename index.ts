import { rateLimit } from "express-rate-limit";
import express from "express";
import type { Response } from "express";
import cors from "cors";
import * as z from "zod";
import multer from "multer";
import fs from "node:fs/promises";
import type {
    ResponseError,
    ResponseSuccess,
    GetProjectsResponse,
    GetProjectResponse,
    RegisterAdminResponse,
    GetAdminPresentResponse,
    CreateProjectReq,
} from "./tipos";
import {
    RegisterAdminSchema,
    IsAdminSchema,
    CreateProjectSchema,
    UpdateProjectSchema,
    Perms,
} from "./tipos.ts";
import { DB } from "./db.ts";

const port = 3000;
const app = express();
const db = new DB();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
});

function send(res: Response, val: Object, statusCode?: number) {
    if (statusCode) {
        res.status(statusCode);
    }
    res.send({
        error: false,
        result: val,
    });
}

function sendError(res: Response, error: string, statusCode?: number) {
    if (statusCode) {
        res.status(statusCode);
    }
    res.send({
        error: true,
        result: error,
    });
}

const middleware = [express.json(), cors(), limiter];
app.use(middleware);
app.listen(port);

app.get(
    "/getProjects/",
    async (req: {}, res: Response<ResponseError | GetProjectsResponse>) => {
        let val;
        try {
            val = await db.getProjects(1);
        } catch (error) {
            sendError(res, "Error fetching projects.", 500);
            return;
        }
        send(res, val);
    },
);

app.get(
    "/getProjects/:page",
    async (
        req: { params: { page: string } },
        res: Response<ResponseError | GetProjectsResponse>,
    ) => {
        const page = parseInt(req.params.page);
        if (isNaN(page) || page < 1) {
            sendError(
                res,
                "Invalid page number. Page number must be a positive integer.",
                400,
            );
            return;
        }
        let val;
        try {
            val = await db.getProjects(1);
        } catch (error) {
            sendError(res, "Error fetching projects.", 500);
            return;
        }
        send(res, val);
    },
);
app.get("/getProjectDetails/", (req: {}, res: Response<ResponseError>) =>
    sendError(res, "Missing id parameter. Use /getProjectDetails/:id", 400),
);
app.get(
    "/getProjectDetails/:id",
    async (
        req: { params: { id: string } },
        res: Response<ResponseError | GetProjectResponse>,
    ) => {
        const id = req.params.id;
        let val;
        try {
            val = await db.getProject(id);
        } catch (error) {
            sendError(res, "Error fetching project details.", 500);
            return;
        }
        if (val) {
            send(res, val);
        } else {
            sendError(res, "No project found with id: " + id, 404);
        }
    },
);

app.get(
    "/isAdminPresent/",
    async (req: {}, res: Response<ResponseError | GetAdminPresentResponse>) => {
        let val;
        try {
            val = await db.getAdminCount();
        } catch (error) {
            sendError(res, "Error fetching admin count.", 500);
            return;
        }
        send(res, val !== 0);
    },
);

const upload = multer();
app.post(
    "/createProject/",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "pdf", maxCount: 1 },
    ]),
    async (
        req: { body: z.infer<typeof CreateProjectReq> },
        res: Response<ResponseError>,
    ) => {
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
        } catch (error) {
            sendError(res, "Invalid request body.", 400);
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
        const filesBody = req as unknown as {
            files: { image: Express.Multer.File[]; pdf: Express.Multer.File[] };
        };
        let extension;
        if (filesBody.files) {
            const files = filesBody.files;
            if (files.image && files.pdf) {
                const image = files.image[0];
                const pdf = files.pdf[0];
                const splitImage = image.originalname.split(".");
                const imageExtension = splitImage[splitImage.length - 1];
                extension = imageExtension;
                const id = await db.getNextId();
                try {
                    await fs.mkdir(`dados/files/imagens/${id}`, {
                        recursive: true,
                    });
                    await fs.mkdir(`dados/files/pdfs/${id}`, {
                        recursive: true,
                    });
                    await fs.writeFile(
                        `dados/files/imagens/${id}/imagem.${imageExtension}`,
                        image.buffer,
                    );
                    await fs.writeFile(
                        `dados/files/pdfs/${id}/arquivo.pdf`,
                        pdf.buffer,
                    );
                } catch (err) {
                    console.log(err);
                }
            } else {
                sendError(res, "Invalid files", 401);
            }
        }
        await db.putProject({ ...body.project, extensao: extension! });
        send(res, { message: "Project created successfully." }, 201);
    },
);

app.post(
    "/isAdmin/",
    async (
        req: { body: z.infer<typeof IsAdminSchema> },
        res: Response<ResponseError | ResponseSuccess<boolean>>,
    ) => {
        let body;
        try {
            body = IsAdminSchema.parse(req.body);
        } catch (error) {
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
    },
);

app.post(
    "/registerAdmin/",
    async (
        req: { body: z.infer<typeof RegisterAdminSchema> },
        res: Response<ResponseError | RegisterAdminResponse>,
    ) => {
        let body;
        try {
            body = RegisterAdminSchema.parse(req.body);
        } catch (error) {
            sendError(res, "Invalid request body.", 400);
            return;
        }
        const { username, password, permission } = body;
        const adminCount = await db.getAdminCount();
        if (adminCount == 0) {
            await db.insertAdmin(username, password, permission);
            send(res, { message: "Admin registered successfully." }, 201);
        } else {
            if (body.auth === undefined) {
                sendError(
                    res,
                    "Authentication required to register new admin.",
                    401,
                );
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
            if (
                (await db.insertAdmin(username, password, permission)) !== false
            ) {
                send(res, { message: "Admin registered successfully." }, 201);
            } else {
                sendError(res, "Duplicate Admin");
            }
        }
    },
);

app.post(
    "/updateProject/:id",
    async (
        req: {
            params: { id: string };
            body: z.infer<typeof UpdateProjectSchema>;
        },
        res: Response<ResponseError | ResponseSuccess<Object>>,
    ) => {
        // to-do: fix this
        let body;
        try {
            body = UpdateProjectSchema.parse(req.body);
        } catch (error) {
            sendError(res, "Invalid request body.", 400);
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
        let updated;
        try {
            updated = await db.updateProject(req.params.id, body.project);
        } catch (error) {
            sendError(res, "Error updating project.", 500);
            return;
        }
        if (!updated) {
            sendError(res, "No project found with id: " + req.params.id, 404);
            return;
        }
        send(res, { message: "Project updated successfully." });
    },
);

app.use("/files", express.static("dados/files"));
