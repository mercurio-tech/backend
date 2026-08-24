
import { rateLimit } from "express-rate-limit";
import express from "express";
import type { Response } from "express";
import { hash } from "bcrypt-ts";
import * as z from "zod";
import type {
  ResponseError,
  GetProjectsResponse,
  GetProjectDetailsResponse,
  RegisterAdminResponse,
} from "./tipos";
import {
  RegisterAdminSchema,
} from "./tipos.ts";
import { DB } from "./db.ts";

const port = 3000;
const app = express();
const db = new DB();

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

app.use(limiter);

app.get(
  "/getProjects/",
  async (req: {}, res: Response<ResponseError | GetProjectsResponse>) => {
    let val;
    try {
      val = await db.getProjects(1);
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
      val = await db.getProjects(1);
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
      val = await db.getDetailedProject(id);
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

app.post(
  "/registerAdmin/",
  async (
    req: { body: z.infer<typeof RegisterAdminSchema> },
    res: Response<ResponseError | RegisterAdminResponse>,
  ) => {
    let body;
    try {
      body = RegisterAdminSchema.parse(req.body);
    } catch (error) {
      sendError(res, "Invalid request body.", 400);
      return;
    }
    const { username, password, permission } = body;
    if (await db.getAdminCount() < 0) {
      await db.insertAdmin(username, await hash(password, 10), permission)
      send(res, { message: "Admin registered successfully." }, 201);
    } else {
      if (body.auth === undefined) {
        sendError(res, "Authentication required to register new admin.", 401);
        return;
      }
      const isAuth = await db.verifyAuth(body.auth.username, body.auth.password);
      if (!isAuth) {
        sendError(res, "Could not authenticate user.", 401);
        return;
      }
      await db.insertAdmin(username, await hash(password, 10), permission);
      send(res, { message: "Admin registered successfully." }, 201);
    }
  },
);
