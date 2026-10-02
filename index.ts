import { rateLimit } from "express-rate-limit";
import express from "express";
import cors from "cors";
import "dotenv/config";

import { createDB, type DBAdapter } from "./db.ts";
import { sendError } from "./lib/responses.ts";
import { mountRoutes } from "./routes/index.ts";

const port = 3000;
const app = express();
const db: DBAdapter = createDB();

const isTesting = (process.env.NODE_ENV || "development") === "development";
const limiter = rateLimit({
    windowMs: isTesting ? 1 : 5 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    ipv6Subnet: 56,
});

app.use([express.json(), cors(), limiter]);

// Bloqueia requests até DB + schema estarem prontos.
app.use(async (req, res, next) => {
    if (db.isReady()) return next();
    try {
        await db.ready();
        next();
    } catch (err) {
        console.error("DB not ready:", err);
        sendError(res, "Database not ready.", 503);
    }
});

mountRoutes(app, db);

app.use("/files", express.static("dados/files"));

// Middleware de erro final (o asyncHandler manda pra cá).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    sendError(res, "Internal server error.", 500);
});

process.on("SIGINT", async () => { await db.close(); process.exit(0); });
process.on("SIGTERM", async () => { await db.close(); process.exit(0); });

app.listen(port, () => {
    console.log(`Server listening on :${port}`);
});