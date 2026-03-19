import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.all("/api/{*path}", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (process.env.SERVE_STATIC === "true" || process.env.DOCKER === "true") {
  const __dirname = typeof __filename !== "undefined"
    ? path.dirname(__filename)
    : path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(__dirname, "..", "..", "horse-racing-ai", "dist", "public");
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
