import { Pool } from "pg";
import { compare, hash } from "bcrypt-ts";
import * as z from "zod";
import "dotenv/config";

import {
    Project,
    ProjectWithNoId,
    ProjectOptionalExtension,
    Admin,
    Perms,
} from "./tipos.ts";
import type { Filter, DBAdapter } from "./tipos.ts";

export class PostgresDB implements DBAdapter {
    private pool: Pool;
    private readyPromise: Promise<void>;
    private _ready = false;

    constructor(connectionString = process.env.DATABASE_URL) {
        if (!connectionString) {
            throw new Error("DATABASE_URL não definida");
        }
        this.pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 10,
        });
        this.readyPromise = this.createDB();
    }

    async ready() {
        await this.readyPromise;
    }

    isReady() {
        return this._ready;
    }

    async close() {
        await this.pool.end();
    }

    // ---------------------------------------------------------------------
    private async doesDBExist() {
        const { rows } = await this.pool.query(
            `select count(*)::int as count from information_schema.tables
             where table_schema='public' and table_name in ('admins','teses');`,
        );
        return rows[0].count === 2;
    }

    private async createDB() {
        const client = await this.pool.connect();
        try {
            if (await this.doesDBExist()) {
                this._ready = true;
                return;
            }
            console.log("DB does not exist, creating...");
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
            this._ready = true;
        } catch (err) {
            console.error("Error creating DB:", err);
            throw err;
        } finally {
            client.release();
        }
    }

    // ---------------------------------------------------------------------
    async getNextId() {
        const { rows } = await this.pool.query(
            "select coalesce(max(id), 0) + 1 as id from teses;",
        );
        return rows[0].id as number;
    }

    async getAvailableFilters() {
        const { rows: res } = await this.pool.query(
            "select distinct ano as year, tipo as type, professor from teses;",
        );
        const { rows: tagRows } = await this.pool.query(`
            select distinct trim(tag) as tag
            from teses, regexp_split_to_table(coalesce(tags,''), ',') as tag
            where trim(tag) <> ''
            order by tag;
        `);
        return {
            filters: res as Omit<Filter, "tag">[],
            tags: tagRows.map(({ tag }: { tag: string }) => tag),
        };
    }

    async searchProject(query: string, page = 1) {
        const { rows } = await this.pool.query(
            `select t.*, ts_rank_cd(t.search_vec, q) as rank
             from teses t, websearch_to_tsquery('portuguese', $1) q
             where t.search_vec @@ q
             order by rank desc, t.ano desc
             limit 10 offset $2;`,
            [query, (page - 1) * 10],
        );
        return rows.map((val) => {
            if (val.tags && typeof val.tags === "string")
                val.tags = val.tags.split(",").map((t: string) => t.trim());
            return Project.parse(val);
        });
    }

    async getProjects(page: number, filters?: Filter) {
        let result;
        if (filters) {
            let query = "select * from teses where 1=1";
            const params: any[] = [];
            let i = 1;
            if (filters.year) {
                query += ` and ano = $${i++}`;
                params.push(filters.year);
            }
            if (filters.tag) {
                query += ` and tags ilike $${i++}`;
                params.push(`%${filters.tag}%`);
            }
            if (filters.professor) {
                query += ` and professor ilike $${i++}`;
                params.push(`%${filters.professor}%`);
            }
            if (filters.type) {
                query += ` and tipo = $${i++}`;
                params.push(filters.type);
            }
            query += ` order by ano limit 10 offset $${i++};`;
            params.push((page - 1) * 10);
            result = (await this.pool.query(query, params)).rows;
        } else {
            result = (
                await this.pool.query(
                    "select * from teses order by ano limit 10 offset $1;",
                    [(page - 1) * 10],
                )
            ).rows;
        }
        return result.map((val) => {
            if (val.tags && typeof val.tags === "string")
                val.tags = val.tags.split(",").map((t: string) => t.trim());
            return Project.parse(val);
        });
    }

    async getProject(id: string) {
        const { rows } = await this.pool.query(
            "select * from teses where id = $1;",
            [id],
        );
        const val = rows[0];
        if (val === undefined) return null;
        if (val.tags && typeof val.tags === "string")
            val.tags = val.tags.split(",").map((t: string) => t.trim());
        return Project.parse(val);
    }

    async putProject(project: z.infer<typeof ProjectWithNoId>) {
        await this.pool.query(
            `insert into teses (titulo, subtitulo, descricao, aluno, professor, tags, ano, tipo, extensao)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9);`,
            [
                project.titulo,
                project.subtitulo,
                project.descricao,
                project.aluno,
                project.professor,
                project.tags.join(", "),
                project.ano,
                project.tipo,
                project.extensao,
            ],
        );
    }

    async updateProject(project: z.infer<typeof ProjectOptionalExtension>) {
        const tagsString = project.tags.join(", ");
        let result;
        if (project.extensao) {
            result = await this.pool.query(
                `update teses set titulo=$1, subtitulo=$2, descricao=$3, aluno=$4,
                 professor=$5, tags=$6, ano=$7, tipo=$8, extensao=$9 where id=$10;`,
                [
                    project.titulo, project.subtitulo, project.descricao,
                    project.aluno, project.professor, tagsString,
                    project.ano, project.tipo, project.extensao, project.id,
                ],
            );
        } else {
            result = await this.pool.query(
                `update teses set titulo=$1, subtitulo=$2, descricao=$3, aluno=$4,
                 professor=$5, tags=$6, ano=$7, tipo=$8 where id=$9;`,
                [
                    project.titulo, project.subtitulo, project.descricao,
                    project.aluno, project.professor, tagsString,
                    project.ano, project.tipo, project.id,
                ],
            );
        }
        return (result.rowCount ?? 0) > 0;
    }

    async deleteProject(id: number) {
        const result = await this.pool.query(
            "delete from teses where id = $1;",
            [id],
        );
        return (result.rowCount ?? 0) > 0;
    }

    // ---------------------------------------------------------------------
    async verifyAuth(
        username: string,
        password: string,
        permissionLevel: Perms[keyof Perms],
    ) {
        const { rows } = await this.pool.query(
            "select * from admins where nome = $1;",
            [username],
        );
        const adminUnverified = rows[0];
        if (adminUnverified === undefined) return false;
        const admin = Admin.parse(adminUnverified);
        if (admin.permissao < permissionLevel) return false;
        return compare(password, admin.senha);
    }

    async getAdminCount() {
        const { rows } = await this.pool.query(
            "select count(*)::int as count from admins;",
        );
        return rows[0].count;
    }

    async adminExists(username: string) {
        const { rows } = await this.pool.query(
            "select 1 from admins where nome = $1 limit 1;",
            [username],
        );
        return rows.length > 0;
    }

    async insertAdmin(
        username: string,
        password: string,
        permission: Perms[keyof Perms],
    ) {
        if (await this.adminExists(username)) return false;
        await this.pool.query(
            "insert into admins (nome, senha, permissao) values ($1,$2,$3);",
            [username, await hash(password, 10), permission],
        );
    }

    async getAdmin(username: string) {
        const { rows } = await this.pool.query(
            "select * from admins where nome = $1;",
            [username],
        );
        return Admin.parse(rows[0]);
    }
}