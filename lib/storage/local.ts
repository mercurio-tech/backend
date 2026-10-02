import fs from "node:fs/promises";
import type { FileStorage } from "./tipos.ts";

export class LocalFileStorage implements FileStorage {
    constructor(private baseDir = "dados/files") {}

    async saveProjectFiles(opts: {
        id: number;
        image?: { buffer: Buffer; extension: string; mimetype: string };
        pdf?: { buffer: Buffer; mimetype: string };
    }): Promise<void> {
        const { id, image, pdf } = opts;

        if (image) {
            await fs.mkdir(`${this.baseDir}/imagens/${id}`, { recursive: true });
            await fs.writeFile(
                `${this.baseDir}/imagens/${id}/imagem.${image.extension}`,
                image.buffer,
            );
        }

        if (pdf) {
            await fs.mkdir(`${this.baseDir}/pdfs/${id}`, { recursive: true });
            await fs.writeFile(
                `${this.baseDir}/pdfs/${id}/arquivo.pdf`,
                pdf.buffer,
            );
        }
    }

    async deleteProjectFiles(
        id: number,
        opts: { image: boolean; pdf: boolean },
    ): Promise<void> {
        if (opts.image) {
            try {
                await fs.rm(`${this.baseDir}/imagens/${id}`, { recursive: true });
            } catch (err) {
                console.error(`Error deleting image files for project ${id}:`, err);
            }
        }
        if (opts.pdf) {
            try {
                await fs.rm(`${this.baseDir}/pdfs/${id}`, { recursive: true });
            } catch (err) {
                console.error(`Error deleting PDF files for project ${id}:`, err);
            }
        }
    }
}