import type { Request, Response } from "express";
import fs from "node:fs/promises";
import { sendError } from "./responses.ts";
import type { DBAdapter } from "../tipos.ts";

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

    const imageCondition = requiresBoth ? files.image && files.pdf : files.image !== undefined;
    if (imageCondition) {
        const image = files.image[0];
        const splitImage = image.originalname.split(".");
        const imageExtension = splitImage[splitImage.length - 1];
        extension = imageExtension;
        try {
            if (!isValidImage(image.buffer)) throw new Error("Invalid Files");
            await fs.mkdir(`dados/files/imagens/${id}`, { recursive: true });
            await fs.writeFile(
                `dados/files/imagens/${id}/imagem.${imageExtension}`,
                image.buffer,
            );
        } catch {
            sendError(res, "Invalid Files", 401);
            return;
        }
    }

    const pdfCondition = requiresBoth ? files.pdf && files.image : files.pdf !== undefined;
    if (pdfCondition) {
        const pdf = files.pdf[0];
        if (!isValidPdf(pdf.buffer)) {
            sendError(res, "Invalid Files", 401);
            return;
        }
        try {
            await fs.mkdir(`dados/files/pdfs/${id}`, { recursive: true });
            await fs.writeFile(`dados/files/pdfs/${id}/arquivo.pdf`, pdf.buffer);
        } catch {
            sendError(res, "Invalid Files", 401);
            return;
        }
    }
    return extension;
}

export async function deleteFiles(id: number, image: boolean, pdf: boolean) {
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