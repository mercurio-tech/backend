/**
 * Migra dados do SQLite (dados/banco.db) para o PostgreSQL do Supabase.
 *
 * Uso:
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts            # modo normal
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts --truncate # limpa destino antes
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts --dry-run  # só mostra o que faria
 *
 * Requer no .env:
 *   DATABASE_URL=postgresql://...
 *
 * Requer que o schema (tabelas admins/teses) já exista no destino.
 * Se não existir, o script cria (mesma DDL do PostgresDB).
 */

import sqlite3 from "sqlite3-offline-next";
import { open } from "sqlite";
import { Pool } from "pg";
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./dados/banco.db";
const DRY_RUN = process.argv.includes("--dry-run");
const TRUNCATE = process.argv.includes("--truncate");

type SqliteAdmin = {
    id: number;
    nome: string;
    senha: string;
    permissao: number;
};

type SqliteProject = {
    id: number;
    titulo: string | null;
    subtitulo: string | null;
    descricao: string | null;
    aluno: string | null;
    professor: string | null;
    tags: string | null;
    ano: number | null;
    tipo: string | null;
    extensao: string | null;
};

async function ensurePostgresSchema(pool: Pool) {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `select count(*)::int as count from information_schema.tables
             where table_schema='public' and table_name in ('admins','teses');`,
        );
        if (rows[0].count === 2) return;

        console.log("→ Criando schema no Postgres...");
        await client.query(`
            create table if not exists admins (
                id serial primary key,
                nome text unique not null,
                senha text not null,
                permissao integer not null
            );
        `);
        await client.query(`
            create table if not exists teses (
                id serial primary key,
                titulo text, subtitulo text, descricao text,
                aluno text, professor text, tags text,
                ano integer, tipo text, extensao text
            );
        `);
        await client.query(`
            alter table teses
            add column if not exists search_vec tsvector
            generated always as (
                setweight(to_tsvector('portuguese', coalesce(titulo,'')), 'A') ||
                setweight(to_tsvector('portuguese', coalesce(subtitulo,'')), 'B') ||
                setweight(to_tsvector('portuguese', coalesce(aluno,'')), 'B') ||
                setweight(to_tsvector('portuguese', coalesce(professor,'')), 'B') ||
                setweight(to_tsvector('portuguese', coalesce(descricao,'')), 'C') ||
                setweight(to_tsvector('portuguese', coalesce(tags,'')), 'C') ||
                setweight(to_tsvector('portuguese', coalesce(tipo,'')), 'D') ||
                setweight(to_tsvector('portuguese', coalesce(ano::text,'')), 'D')
            ) stored;
        `);
        await client.query(`
            create index if not exists teses_search_idx
            on teses using gin(search_vec);
        `);
    } finally {
        client.release();
    }
}

async function main() {
    // ---- 1. valida pré-requisitos --------------------------------------
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL não definida no .env");
    }
    try {
        await fs.access(SQLITE_PATH);
    } catch {
        throw new Error(`SQLite não encontrado em ${SQLITE_PATH}`);
    }

    console.log(`▶ Origem : ${path.resolve(SQLITE_PATH)}`);
    console.log(`▶ Destino: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
    console.log(`▶ Modo   : ${DRY_RUN ? "DRY-RUN" : "REAL"}${TRUNCATE ? " + TRUNCATE" : ""}`);
    console.log();

    // ---- 2. conecta nos dois -------------------------------------------
    const sqliteDb = await open({
        filename: SQLITE_PATH,
        driver: sqlite3.Database,
    });
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
    });

    try {
        await ensurePostgresSchema(pool);

        // ---- 3. lê tudo do SQLite --------------------------------------
        const admins = (await sqliteDb.all(
            "select id, nome, senha, permissao from admins order by id;",
        )) as SqliteAdmin[];
        const projects = (await sqliteDb.all(
            "select id, titulo, subtitulo, descricao, aluno, professor, tags, ano, tipo, extensao from teses order by id;",
        )) as SqliteProject[];

        console.log(`→ Lidos do SQLite: ${admins.length} admin(s), ${projects.length} projeto(s)`);

        if (DRY_RUN) {
            console.log("\n[DRY-RUN] Nada será gravado. Amostra:");
            console.log("  admins[0]:", admins[0]);
            console.log("  teses[0] :", projects[0]);
            return;
        }

        const client = await pool.connect();
        try {
            await client.query("begin;");

            if (TRUNCATE) {
                console.log("→ Truncando destino...");
                // CASCADE pra lidar com FK futuras; hoje não há FKs.
                await client.query("truncate table teses restart identity cascade;");
                await client.query("truncate table admins restart identity cascade;");
            }

            // ---- 4. migra admins ---------------------------------------
            let insertedAdmins = 0;
            let skippedAdmins = 0;
            for (const a of admins) {
                const res = await client.query(
                    `insert into admins (id, nome, senha, permissao)
                     values ($1, $2, $3, $4)
                     on conflict (id) do nothing;`,
                    [a.id, a.nome, a.senha, a.permissao],
                );
                if ((res.rowCount ?? 0) > 0) insertedAdmins++;
                else skippedAdmins++;
            }
            console.log(`→ Admins: ${insertedAdmins} inserido(s), ${skippedAdmins} já existia(m)`);

            // ---- 5. migra teses ----------------------------------------
            let insertedProjects = 0;
            let skippedProjects = 0;
            for (const p of projects) {
                const res = await client.query(
                    `insert into teses
                        (id, titulo, subtitulo, descricao, aluno, professor, tags, ano, tipo, extensao)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                     on conflict (id) do nothing;`,
                    [
                        p.id, p.titulo, p.subtitulo, p.descricao,
                        p.aluno, p.professor, p.tags, p.ano,
                        p.tipo, p.extensao,
                    ],
                );
                if ((res.rowCount ?? 0) > 0) insertedProjects++;
                else skippedProjects++;
            }
            console.log(`→ Teses : ${insertedProjects} inserido(s), ${skippedProjects} já existia(m)`);

            // ---- 6. ajusta sequences -----------------------------------
            // Sem isso, o próximo insert pelo app tentaria id=1 e colidiria.
            if (admins.length > 0) {
                await client.query(
                    `select setval(pg_get_serial_sequence('admins','id'),
                                   coalesce((select max(id) from admins), 1),
                                   (select count(*) from admins) > 0);`,
                );
            }
            if (projects.length > 0) {
                await client.query(
                    `select setval(pg_get_serial_sequence('teses','id'),
                                   coalesce((select max(id) from teses), 1),
                                   (select count(*) from teses) > 0);`,
                );
            }

            await client.query("commit;");

            // ---- 7. verificação final ----------------------------------
            const { rows: counts } = await client.query(
                `select
                    (select count(*)::int from admins) as admins,
                    (select count(*)::int from teses)   as teses;`,
            );
            console.log();
            console.log(`✓ Concluído. Postgres agora tem ${counts[0].admins} admin(s) e ${counts[0].teses} projeto(s).`);
        } catch (err) {
            await client.query("rollback;");
            throw err;
        } finally {
            client.release();
        }
    } finally {
        await sqliteDb.close();
        await pool.end();
    }
}

main().catch((err) => {
    console.error("\n✗ Migração falhou:");
    console.error(err);
    process.exit(1);
});