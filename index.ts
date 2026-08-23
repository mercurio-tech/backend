import sqlite3 from "sqlite3-offline-next";
import { open } from "sqlite";
import { rateLimit } from "express-rate-limit";
import express from "express";
import type { Response } from "express";
import * as z from "zod";
import type {
  ResponseError,
  GetProjectsResponse,
  GetProjectDetailsResponse,
} from "./tipos";
import { Project, DetailedProject } from "./tipos.ts";

const port = 3000;
const app = express();
const db = await open({
  filename: "./dados/banco.db",
  driver: sqlite3.Database,
});
app.listen(port);

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

async function getProjects(page: number): Promise<z.infer<typeof Project>[]> {
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

async function getDetailedProject(id: string) {
  const val = await db.get("select * from teses where id = ?;", [id]);
  if (val.tags && typeof val.tags === "string") {
    val.tags = val.tags.split(",").map((tag: string) => tag.trim());
  }
  if (val === undefined) {
    return null;
  }
  return DetailedProject.parse(val);
}
app.use(limiter);

app.get(
  "/getProjects/",
  async (req: {}, res: Response<ResponseError | GetProjectsResponse>) => {
    let val;
    try {
      val = await getProjects(1);
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
      val = await getProjects(1);
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
    res: Response<ResponseError | GetProjectDetailsResponse>,
  ) => {
    const id = req.params.id;
    let val;
    try {
      val = await getDetailedProject(id);
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

app.post("/registerAdmin/", async (req, res) => {
  const { count } = await db.get("select count(*) as count from admins");
  if (count < 0) {
    // no admins yet stored. this means we're setting up the DB
    // in this case, we can allow the registration of the first admin without any authentication
    const { username, password, permission } = req.body;
    if (!username || !password || !permission) {
      sendError(res, "Missing username, password, or permission.", 400);
      return;
    }
    await db.run(
      "insert into admins (username, password, permission) values (?, ?, ?);",
      [username, password, permission],
    );
    send(res, { message: "Admin registered successfully." }, 201);
  } else {
    sendError(res, "Not Implemented", 501);
    /*const admin = await db.get(
      "select * from admins where username = ? and password = ?;",
      [username, password],
    );*/
  }
});
