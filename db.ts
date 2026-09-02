import sqlite3 from "sqlite3-offline-next";
import { open, Database } from "sqlite";
import { compare, hash } from "bcrypt-ts";
import * as z from "zod";
import fs from "node:fs/promises";

import {
    Project,
    ProjectWithNoId,
    ProjectOptionalExtension,
    Admin,
    Perms,
} from "./tipos.ts";

async function checkFolder(dirPath: string) {
    try {
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
            return;
        }
        await fs.rm(dirPath);
        await fs.mkdir(dirPath);
    } catch (error) {
        await fs.mkdir(dirPath);
    }
}
export class DB {
    db?: Database;
    constructor() {
        checkFolder("dados").then(() => {
            open({
                filename: "./dados/banco.db",
                driver: sqlite3.Database,
            }).then((db) => {
                this.db = db;
                this.createDB();
            });
        });
    }

    isDBCreated() {
        return this.db !== undefined;
    }

    async createDB() {
        if (!this.isDBCreated())
            throw new Error("Database ainda não foi carregada");
        if (!(await this.doesDBExist())) {
            console.log("DB does not exist, creating...");
            try {
                this.db!.exec(
                    "create table admins (id integer unique primary key autoincrement, nome text, senha text, permissao integer);",
                );
                this.db!.exec(
                    "create table teses (id integer unique primary key autoincrement, titulo text, subtitulo text, descricao text, aluno text, professor text, tags text, ano integer, tipo text, extensao text);",
                );
                this.db!.exec("create virtual table if not exists busca using fts5(titulo, subtitulo, descricao, aluno, professor, content='teses', content_rowid='id')");
                this.db!.exec("create trigger teses_ai after insert on teses begin insert into busca(rowid, titulo, subtitulo, descricao) values (new.id, new.titulo, new.subtitulo, new.descricao);end;")
                this.db!.exec("create trigger teses_ad after delete on teses begin insert into busca(busca, rowid, titulo, subtitulo, descricao) values ('delete', old.id, old.titulo, old.subtitulo, old.descricao); end;")
                this.db!.exec("create trigger teses_au after update on teses begin insert into busca(busca, rowid, titulo, subtitulo, descricao) values ('delete', old.id, old.titulo, old.subtitulo, old.descricao); insert into busca(rowid, titulo, subtitulo, descricao) values (new.id, new.titulo, new.subtitulo, new.descricao); end;")
            } catch (error) {
                console.log(error);
            }
        }
    }

    async doesDBExist() {
        if (!this.isDBCreated()) return false;
        const db = this.db!;
        let { count } = await db.get(
            "select count(name) as count from sqlite_master where type='table' and name='admins';",
        );
        if (count == 0) {
            return false;
        } else {
            let { count } = await db.get(
                "select count(name) as count from sqlite_master where type='table' and name='teses';",
            );
            if (count == 0) {
                return false;
            }
        }
        return true;
    }

    async getNextId() {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const { id } = await db.get("select max(id) as id from teses;");
        if (id === null) {
            return 1;
        }
        return id + 1;
    }

    async searchProject(query: string) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        console.log(query)
        //  where busca match ?
        const res = await db.all("select t.titulo, t.subtitulo, t.descricao, t.aluno, t.professor, t.tags, t.ano, t.tipo, t.extensao from teses t join busca b on b.rowid = t.id where busca match ? order by bm25(busca, 10, 5, 1, 5, 5)", [query]);
        console.log(res);
        return res;
    }

    async getProjects(
        page: number,
        filters?: { year?: string; tag?: string; professor?: string },
    ): Promise<z.infer<typeof Project>[]> {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const projects: z.infer<typeof Project>[] = [];
        let result;
        if (filters) {
            let query = "select * from teses where 1=1";
            const params: any[] = [];
            if (filters.year) {
                query += " and ano = ?";
                params.push(filters.year);
            }
            if (filters.tag) {
                query += " and tags like ?";
                params.push(`%${filters.tag}%`);
            }
            if (filters.professor) {
                query += " and professor like ?";
                params.push(`%${filters.professor}%`);
            }
            query += " order by ano limit 10 offset ?;";
            params.push((page - 1) * 10);
            result = await db.all(query, params);
        } else {
            result = await db.all(
                "select * from teses order by ano limit 10 offset ?;",
                [(page - 1) * 10],
            );
        }

        for (const val of result) {
            // need to convert tags to array of strings, since sqlite doesn't support arrays natively
            if (val.tags && typeof val.tags === "string") {
                val.tags = val.tags.split(",").map((tag: string) => tag.trim());
            }
            projects.push(Project.parse(val));
        }
        return projects;
    }

    async getProject(id: string) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const val = await db.get("select * from teses where id = ?;", [id]);
        if (val.tags && typeof val.tags === "string") {
            val.tags = val.tags.split(",").map((tag: string) => tag.trim());
        }
        if (val === undefined) {
            return null;
        }
        return Project.parse(val);
    }

    async putProject(project: z.infer<typeof ProjectWithNoId>) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const tagsString = project.tags.join(", ");
        await db.run(
            "insert into teses (titulo, subtitulo, descricao, aluno, professor, tags, ano, tipo, extensao) values (?, ?, ?, ?, ?, ?, ?, ?, ?);",
            [
                project.titulo,
                project.subtitulo,
                project.descricao,
                project.aluno,
                project.professor,
                tagsString,
                project.ano,
                project.tipo,
                project.extensao,
            ],
        );
    }

    async updateProject(project: z.infer<typeof ProjectOptionalExtension>) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const tagsString = project.tags.join(", ");
        let result;
        if (project.extensao) {
            result = await db.run(
                "update teses set titulo = ?, subtitulo = ?, descricao = ?, aluno = ?, professor = ?, tags = ?, ano = ?, tipo = ?, extensao = ? where id = ?;",
                [
                    project.titulo,
                    project.subtitulo,
                    project.descricao,
                    project.aluno,
                    project.professor,
                    tagsString,
                    project.ano,
                    project.tipo,
                    project.extensao,
                    project.id,
                ],
            );
        } else {
            result = await db.run(
                "update teses set titulo = ?, subtitulo = ?, descricao = ?, aluno = ?, professor = ?, tags = ?, ano = ?, tipo = ? where id = ?;",
                [
                    project.titulo,
                    project.subtitulo,
                    project.descricao,
                    project.aluno,
                    project.professor,
                    tagsString,
                    project.ano,
                    project.tipo,
                    project.id,
                ],
            );
        }

        return (result.changes ?? 0) > 0;
    }

    async deleteProject(id: number) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const result = await db.run("delete from teses where id = ?;", [id]);
        return (result.changes ?? 0) > 0;
    }

    async verifyAuth(
        username: string,
        password: string,
        permissionLevel: Perms[keyof Perms],
    ) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const db = this.db!;
        const adminUnverified = await db.get(
            "select * from admins where nome = ?;",
            [username],
        );
        if (adminUnverified === undefined) {
            return false;
        } else {
            const admin = await Admin.parse(adminUnverified);
            if (admin.permissao < permissionLevel) {
                return false;
            }
            const res = await compare(password, admin.senha);
            return res;
        }
    }

    async getAdminCount() {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const { count } = await this.db!.get(
            "select count(*) as count from admins;",
        );
        return count;
    }

    async adminExists(username: string) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const val = await this.db!.get("select * from admins where nome=?", [
            username,
        ]);
        console.log(val);
        return val !== undefined;
    }

    async insertAdmin(
        username: string,
        password: string,
        permission: Perms[keyof Perms],
    ) {
        if (!(await this.adminExists(username))) {
            await this.db!.run(
                "insert into admins (nome, senha, permissao) values (?, ?, ?);",
                [username, await hash(password, 10), permission],
            );
        } else {
            return false;
        }
    }

    async getAdmin(username: string) {
        if (!(await this.doesDBExist())) throw new Error("Database não existe");
        const result = await this.db!.get(
            "select * from admins where username = ?;",
            { username },
        );
        return Admin.parse(result);
    }
}
