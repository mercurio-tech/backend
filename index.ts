import sqlite3 from "sqlite3-offline-next";
import { open } from "sqlite";
import { rateLimit } from "express-rate-limit";
import express from "express";
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

function send(res: express.Response, val: Object, statusCode?: number) {
  if (statusCode) {
    res.status(statusCode);
  }
  res.send({
    error: false,
    result: val,
  });
}

function sendError(res: express.Response, error: string, statusCode?: number) {
  if (statusCode) {
    res.status(statusCode);
  }
  res.send({
    error: true,
    result: error,
  });
}

async function getProjects(page: number) {
  return await db.all(
    "select id, titulo, subtitulo, aluno, ano, tags, imagem from teses order by ano limit 10, ?;",
    [(page - 1) * 10],
  );
}

app.use(limiter);

app.get("/getProjects/", async (req, res) => {
  const val = await getProjects(1);
  if (val.length === 0) {
    sendError(res, "No projects found.", 404);
  } else {
    send(res, val);
  }
});

app.get("/getProjects/:page", async (req, res) => {
  const page = parseInt(req.params.page);
  if (isNaN(page) || page < 1) {
    sendError(
      res,
      "Invalid page number. Page number must be a positive integer.",
      400,
    );
    return;
  }
  const val = await getProjects(page);
  if (val.length === 0) {
    sendError(res, "No projects found.", 404);
  } else {
    send(res, val);
  }
});
app.get("/getProjectDetails/", (req, res) =>
  sendError(res, "Missing id parameter. Use /getProjectDetails/:id", 400),
);
app.get("/getProjectDetails/:id", async (req, res) => {
  const id = req.params.id;
  const val = await db.get("select * from teses where id = ?;", [id]);
  if (val) {
    send(res, val);
  } else {
    sendError(res, "No project found with id: " + id);
  }
});

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
