import type { Request, Response } from "express";
import type { DBAdapter } from "../tipos.ts";
import type { FileStorage } from "./storage/index.ts";
import { sendError } from "./responses.ts";

export function isValidImage(buffer: Buffer): boolean {
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4e && buffer[3] === 0x47
    ) return true;
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ) return true;
    return false;
}

export function isValidPdf(buffer: Buffer): boolean {
    return (
        buffer.length >= 4 &&
        buffer[0] === 0x25 && buffer[1] === 0x50 &&
        buffer[2] === 0x44 && buffer[3] === 0x46
    );
}

export async function uploadFiles(
    req: Request,
    res: Response,
    db: DBAdapter,
    storage: FileStorage,
    requiresBoth: boolean,
    id?: number,
): Promise<string | undefined> {
    const filesBody = req as unknown as {
        files: { image: Express.Multer.File[]; pdf: Express.Multer.File[] };
    };
    if (!filesBody.files) return;

    const files = filesBody.files;
    id = id || (await db.getNextId());
    let extension: string | undefined;

    // Decide o que foi enviado
    const imageCondition = requiresBoth
        ? files.image && files.pdf
        : files.image !== undefined;
    const pdfCondition = requiresBoth
        ? files.pdf && files.image
        : files.pdf !== undefined;

    // Valida assinatura ANTES de qualquer IO
    if (imageCondition) {
        const image = files.image[0];
        if (!isValidImage(image.buffer)) {
            sendError(res, "Invalid Files", 401);
            return;
        }
        const splitImage = image.originalname.split(".");
        extension = splitImage[splitImage.length - 1];
    }
    if (pdfCondition) {
        const pdf = files.pdf[0];
        if (!isValidPdf(pdf.buffer)) {
            sendError(res, "Invalid Files", 401);
            return;
        }
    }

    // Só então delega ao storage concreto
    try {
        await storage.saveProjectFiles({
            id,
            image: imageCondition
                ? {
                    buffer: files.image[0].buffer,
                    extension: extension!,
                    mimetype: files.image[0].mimetype,
                }
                : undefined,
            pdf: pdfCondition
                ? {
                    buffer: files.pdf[0].buffer,
                    mimetype: files.pdf[0].mimetype,
                }
                : undefined,
        });
    } catch (err) {
        console.error("Storage save error:", err);
        sendError(res, "Invalid Files", 401);
        return;
    }

    return extension;
}

export async function deleteFiles(
    id: number,
    image: boolean,
    pdf: boolean,
    storage: FileStorage,
) {
    await storage.deleteProjectFiles(id, { image, pdf });
}