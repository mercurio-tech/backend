/**
 * Migra os arquivos locais em dados/files/ para o Supabase Storage.
 *
 * Uso:
 *   npx tsx scripts/migrate-files-to-supabase.ts              # migra tudo
 *   npx tsx scripts/migrate-files-to-supabase.ts --dry-run    # só lista
 *   npx tsx scripts/migrate-files-to-supabase.ts --only=imagens
 *   npx tsx scripts/migrate-files-to-supabase.ts --only=pdfs
 *   npx tsx scripts/migrate-files-to-supabase.ts --skip-existing
 *
 * Requer no .env:
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * O bucket precisa existir (padrão: "projetos-files").
 * Estrutura esperada no disco:
 *   dados/files/imagens/{id}/imagem.{ext}
 *   dados/files/pdfs/{id}/arquivo.pdf
 * Essa mesma estrutura é replicada no bucket.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const BUCKET = process.env.SUPABASE_BUCKET ?? "projetos";
const ROOT = process.env.FILES_DIR ?? "dados/files";
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const ONLY = (() => {
    const arg = process.argv.find((a) => a.startsWith("--only="));
    if (!arg) return undefined;
    const v = arg.split("=")[1];
    if (v !== "imagens" && v !== "pdfs") {
        throw new Error(`--only aceita apenas "imagens" ou "pdfs", recebeu "${v}"`);
    }
    return v;
})();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

type Arquivo = {
    /** Caminho absoluto no disco */
    localPath: string;
    /** Caminho relativo ao ROOT — é o que vai virar chave no bucket */
    storageKey: string;
    /** Tamanho em bytes */
    size: number;
};

/** Percorre recursivamente um diretório, retornando arquivos com chave relativa. */
async function walkDir(
    baseDir: string,
    currentDir: string = baseDir,
): Promise<Arquivo[]> {
    const out: Arquivo[] = [];
    let entries;
    try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }

    for (const entry of entries) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walkDir(baseDir, full)));
        } else {
            const stat = await fs.stat(full);
            // path.relative + normalização de separador pra usar "/" sempre
            const storageKey = path
                .relative(baseDir, full)
                .split(path.sep)
                .join("/");
            out.push({ localPath: full, storageKey, size: stat.size });
        }
    }
    return out;
}

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Lista tudo que já existe no bucket sob um prefixo (para --skip-existing). */
async function listExisting(
    supabase: SupabaseClient,
    prefix: string,
): Promise<Set<string>> {
    const found = new Set<string>();

    // O Supabase Storage não tem "list recursivo" — precisa descer pasta a pasta.
    async function walk(prefixoAtual: string) {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .list(prefixoAtual, { limit: 1000 });
        if (error) throw error;
        if (!data) return;

        for (const item of data) {
            const full = prefixoAtual
                ? `${prefixoAtual}/${item.name}`
                : item.name;
            // Pastas vêm com metadata === null
            if (item.metadata === null) {
                await walk(full);
            } else {
                found.add(full);
            }
        }
    }

    await walk(prefix);
    return found;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    // 1. Validações
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
            "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env",
        );
    }
    if (DRY_RUN) console.log("⚙️  Modo DRY-RUN — nada será enviado\n");

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // 2. Confere que o bucket existe
    const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
    if (bucketsErr) throw bucketsErr;
    if (!buckets?.some((b) => b.name === BUCKET)) {
        throw new Error(
            `Bucket "${BUCKET}" não existe. Crie-o no painel do Supabase (público) antes de rodar.`,
        );
    }
    console.log(`📦 Bucket: ${BUCKET}`);
    console.log(`📁 Pasta local: ${path.resolve(ROOT)}\n`);

    // 3. Descobre arquivos no disco
    const areas: Array<"imagens" | "pdfs"> = ONLY
        ? [ONLY]
        : ["imagens", "pdfs"];

    const todos: Arquivo[] = [];
    for (const area of areas) {
        const dir = path.join(ROOT, area);
        const arquivos = await walkDir(dir, dir);
        const relativo = path.relative(ROOT, dir);
        // Ajusta storageKey para incluir "imagens/" ou "pdfs/"
        for (const a of arquivos) {
            a.storageKey = `${area}/${a.storageKey}`;
            todos.push(a);
        }
        console.log(
            `📂 ${relativo}: ${arquivos.length} arquivo(s) — ${humanSize(
                arquivos.reduce((s, f) => s + f.size, 0),
            )}`,
        );
    }

    if (todos.length === 0) {
        console.log("\nNada para migrar.");
        return;
    }

    console.log(`\n🔎 Total: ${todos.length} arquivo(s)\n`);

    // 4. Opcionalmente, pré-carrega o que já existe no bucket
    let existentes = new Set<string>();
    if (SKIP_EXISTING) {
        console.log("🔍 Consultando arquivos já presentes no bucket...");
        for (const area of areas) {
            const set = await listExisting(supabase, area);
            for (const k of set) existentes.add(k);
        }
        console.log(`   → ${existentes.size} já existem\n`);
    }

    // 5. Upload loop
    let enviados = 0;
    let pulados = 0;
    let falhas = 0;
    const erros: Array<{ arquivo: Arquivo; motivo: string }> = [];

    for (let i = 0; i < todos.length; i++) {
        const a = todos[i];
        const idx = `[${i + 1}/${todos.length}]`;

        if (SKIP_EXISTING && existentes.has(a.storageKey)) {
            console.log(`${idx} ⏭️  ${a.storageKey} (já existe)`);
            pulados++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`${idx} 📄 ${a.storageKey} (${humanSize(a.size)})`);
            continue;
        }

        try {
            const buffer = await fs.readFile(a.localPath);

            // Detecta content-type pelo cabeçalho — mais seguro que confiar na extensão
            let contentType = "application/octet-stream";
            if (
                buffer.length >= 4 &&
                buffer[0] === 0x89 && buffer[1] === 0x50 &&
                buffer[2] === 0x4e && buffer[3] === 0x47
            ) {
                contentType = "image/png";
            } else if (
                buffer.length >= 3 &&
                buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
            ) {
                contentType = "image/jpeg";
            } else if (
                buffer.length >= 4 &&
                buffer[0] === 0x25 && buffer[1] === 0x50 &&
                buffer[2] === 0x44 && buffer[3] === 0x46
            ) {
                contentType = "application/pdf";
            }

            const { error } = await supabase.storage
                .from(BUCKET)
                .upload(a.storageKey, buffer, {
                    contentType,
                    upsert: !SKIP_EXISTING, // sobrescreve se não for skip
                });

            if (error) throw error;

            console.log(`${idx} ✅ ${a.storageKey} (${humanSize(a.size)})`);
            enviados++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`${idx} ❌ ${a.storageKey} — ${msg}`);
            erros.push({ arquivo: a, motivo: msg });
            falhas++;
        }
    }

    // 6. Resumo
    console.log("\n────────────────────────────────────────");
    console.log(`✅ Enviados : ${enviados}`);
    if (SKIP_EXISTING) console.log(`⏭️  Pulados  : ${pulados}`);
    if (falhas) console.log(`❌ Falhas   : ${falhas}`);
    console.log("────────────────────────────────────────");

    if (falhas) {
        console.log("\nArquivos com erro:");
        for (const { arquivo, motivo } of erros) {
            console.log(`  • ${arquivo.storageKey} — ${motivo}`);
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("\n✗ Migração falhou:");
    console.error(err);
    process.exit(1);
});