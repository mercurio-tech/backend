import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FileStorage } from "./tipos.ts";

export class SupabaseFileStorage implements FileStorage {
    private client: SupabaseClient;
    private bucket: string;

    constructor(
        url = process.env.SUPABASE_URL,
        serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
        bucket = "projetos",
    ) {
        if (!url || !serviceKey) {
            throw new Error(
                "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias quando DB_DRIVER=postgres",
            );
        }
        this.client = createClient(url, serviceKey);
        this.bucket = bucket;
    }

    async saveProjectFiles(opts: {
        id: number;
        image?: { buffer: Buffer; extension: string; mimetype: string };
        pdf?: { buffer: Buffer; mimetype: string };
    }): Promise<void> {
        const { id, image, pdf } = opts;

        if (image) {
            const path = `imagens/${id}/imagem.${image.extension}`;
            const { error } = await this.client.storage
                .from(this.bucket)
                .upload(path, image.buffer, {
                    contentType: image.mimetype,
                    upsert: true,
                });
            if (error) throw error;
        }

        if (pdf) {
            const path = `pdfs/${id}/arquivo.pdf`;
            const { error } = await this.client.storage
                .from(this.bucket)
                .upload(path, pdf.buffer, {
                    contentType: pdf.mimetype,
                    upsert: true,
                });
            if (error) throw error;
        }
    }

    async deleteProjectFiles(
        id: number,
        opts: { image: boolean; pdf: boolean },
    ): Promise<void> {
        const pastas: string[] = [];
        if (opts.image) pastas.push(`imagens/${id}`);
        if (opts.pdf) pastas.push(`pdfs/${id}`);

        for (const pasta of pastas) {
            const { data, error } = await this.client.storage
                .from(this.bucket)
                .list(pasta);
            if (error || !data || data.length === 0) continue;

            const arquivos = data.map((f) => `${pasta}/${f.name}`);
            const { error: removeError } = await this.client.storage
                .from(this.bucket)
                .remove(arquivos);
            if (removeError) {
                console.error(`Error deleting ${pasta}:`, removeError);
            }
        }
    }
}