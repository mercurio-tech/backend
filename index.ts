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
    DeleteProjectSchema,
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

// Helper to check image signatures
function isValidImage(buffer: Buffer): boolean {
    // PNG: 89 50 4E 47
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return true;
    }
    // JPEG: FF D8 FF
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return true;
    }
    return false;
}

function isValidPdf(buffer: Buffer): boolean {
    // PDF: %PDF (25 50 44 46)
    return (
        buffer.length >= 4 &&
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
    );
}

async function uploadFiles(
    req: Request,
    res: Response,
    requiresBoth: boolean,
    id?: number,
) {
    const filesBody = req as unknown as {
        files: { image: Express.Multer.File[]; pdf: Express.Multer.File[] };
    };
    let extension;
    if (filesBody.files) {
        const files = filesBody.files;
        id = id || (await db.getNextId());
        let imageCondition;
        if (requiresBoth) {
            imageCondition = files.image && files.pdf;
        } else {
            imageCondition = files.image !== undefined;
        }

        if (imageCondition) {
            const image = files.image[0];
            const splitImage = image.originalname.split(".");
            const imageExtension = splitImage[splitImage.length - 1];
            extension = imageExtension;
            try {
                if (!isValidImage(image.buffer)) {
                    throw new Error("Invalid Files");
                }
                await fs.mkdir(`dados/files/imagens/${id}`, {
                    recursive: true,
                });
                await fs.writeFile(
                    `dados/files/imagens/${id}/imagem.${imageExtension}`,
                    image.buffer,
                );
            } catch (err) {
                sendError(res, "Invalid Files", 401);
                return;
            }
        }

        let pdfCondition;
        if (requiresBoth) {
            pdfCondition = files.pdf && files.image;
        } else {
            pdfCondition = files.pdf !== undefined;
        }

        if (pdfCondition) {
            const pdf = files.pdf[0];
            if (!isValidPdf(pdf.buffer)) {
                throw new Error("Invalid Files");
            }
            try {
                await fs.mkdir(`dados/files/pdfs/${id}`, {
                    recursive: true,
                });
                await fs.writeFile(
                    `dados/files/pdfs/${id}/arquivo.pdf`,
                    pdf.buffer,
                );
            } catch (err) {
                sendError(res, "Invalid Files", 401);
                return;
            }
        }
        return extension;
    }
}

async function deleteFiles(id: number, image: boolean, pdf: boolean) {
    if (image) {
        try {
            await fs.rm(`dados/files/imagens/${id}`, { recursive: true });
        } catch (err) {
            console.error(`Error deleting image files for project ${id}:`, err);
        }
    }
    if (pdf) {
        try {
            await fs.rm(`dados/files/pdfs/${id}`, { recursive: true });
        } catch (err) {
            console.error(`Error deleting PDF files for project ${id}:`, err);
        }
    }
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

        const extension = await uploadFiles(
            req as unknown as Request,
            res,
            true,
        );
        if (extension === undefined) {
            return;
        }
        await db.putProject({ ...body.project, extensao: extension! });
        send(res, { message: "Project created successfully." }, 201);
    },
);

app.post(
    "/updateProject/",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "pdf", maxCount: 1 },
    ]),
    async (
        req: {
            body: z.infer<typeof CreateProjectReq>;
        },
        res: Response<ResponseError | ResponseSuccess<Object>>,
    ) => {
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
            const files = req as unknown as {
                files: {
                    image: Express.Multer.File[];
                    pdf: Express.Multer.File[];
                };
            };
            let extension;
            const pdfPresent = files.files.pdf !== undefined;
            const imagePresent = files.files.image !== undefined;
            if (pdfPresent || imagePresent) {
                deleteFiles(body.project.id, imagePresent, pdfPresent);
                extension = await uploadFiles(
                    files as unknown as Request,
                    res,
                    false,
                    body.project.id,
                );
            }

            updated = await db.updateProject({
                ...body.project,
                extensao: extension,
            });
        } catch (error) {
            console.log(error);
            //sendError(res, "Error updating project.", 500);
            return;
        }
        if (!updated) {
            sendError(res, "No project found with id: " + body.project.id, 404);
            return;
        }
        send(res, { message: "Project updated successfully." });
    },
);

app.post(
    "/deleteProject/",
    async (
        req: { body: z.infer<typeof DeleteProjectSchema> },
        res: Response<ResponseError | ResponseSuccess<boolean>>,
    ) => {
        let body;
        try {
            body = DeleteProjectSchema.parse(req.body);
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
        deleteFiles(body.id, true, true);
        await db.deleteProject(body.id);
        send(res, { message: true });
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

app.use("/files", express.static("dados/files"));
