import sqlite3 from "sqlite3-offline-next";
import { open, Database } from "sqlite";
import { compare, hash } from "bcrypt-ts";
import * as z from "zod";
import {
  Project,
  DetailedProject,
  Admin,
} from "./tipos.ts";

export class DB {
    db? : Database
    constructor() {
        open({
        filename: "./dados/banco.db",
        driver: sqlite3.Database,
        }).then((db) => {
            this.db = db;
        });
    }

    isDBCreated() {
        return this.db !== undefined;
    }

    async createDB() {
        if (!this.isDBCreated()) throw new Error("Database ainda não foi carregada");
        if (!this.doesDBExist()) {

        }
    }

    async doesDBExist() {
        if (!this.isDBCreated()) return false;
        const db = this.db!;
        let {count} = await db.get("select count(name) as count from sqlite_master where type='table' and name='admins'");
        if (count == 0) {
            return false;
        } else {
            let { count } = await db.get("select count(name) as count from sqlite_master where type='table' and name='teses'")
            if (count == 0) {
                return false;
            }
        }
        return true;
    }

    async getProjects(page: number): Promise<z.infer<typeof Project>[]> {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
        const db = this.db!;
      const projects: z.infer<typeof Project>[] = [];
      const result = await db.all(
        "select id, titulo, subtitulo, aluno, ano, tags, imagem from teses order by ano limit 10 offset ?;",
        [(page - 1) * 10],
      );
      for (const val of result) {
        // need to convert tags to array of strings, since sqlite doesn't support arrays natively
        if (val.tags && typeof val.tags === "string") {
          val.tags = val.tags.split(",").map((tag: string) => tag.trim());
        }
        projects.push(Project.parse(val));
      }
      return projects;
    }
    
    async getDetailedProject(id: string) {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
        const db = this.db!;
      const val = await db.get("select * from teses where id = ?;", [id]);
      if (val.tags && typeof val.tags === "string") {
        val.tags = val.tags.split(",").map((tag: string) => tag.trim());
      }
      if (val === undefined) {
        return null;
      }
      return DetailedProject.parse(val);
    }
    
    async verifyAuth(username: string, password: string) {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
        const db = this.db!;
      const adminUnverified = await db.get(
        "select senha from admins where nome = ?;",
        [username],
      );
      if (adminUnverified === undefined) {
        return false;
      } else {
        const admin = await Admin.parse(adminUnverified);
        return await compare(password, admin.senha);
      }
    }

    async getAdminCount() {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
        const { count } = await this.db!.get("select count(*) as count from admins");
        return count;
    }

    async insertAdmin(username: string, password: string, permission: "admin" | "editor") {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
      await this.db!.run(
        "insert into admins (nome, senha, permissao) values (?, ?, ?);",
        [username, await hash(password, 10), permission],
      );
    }

    async getAdmin(username: string) {
        if (!await this.doesDBExist()) throw new Error("Database não existe");
        const result = await this.db!.get("select * from admins where username = ?;", {username})
        return Admin.parse(result);
    }
}