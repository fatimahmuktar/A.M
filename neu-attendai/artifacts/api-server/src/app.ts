import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

/* Serve frontend static build — PUBLIC_DIR defaults to sibling public dir */
const publicDir = process.env["PUBLIC_DIR"] || path.resolve(import.meta.dirname, "..", "public");
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  /* SPA fallback: serve index.html for non-API routes */
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
