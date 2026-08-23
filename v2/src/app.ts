import express, { type Express } from "express";
import { join } from "node:path";
import type { WebhookController } from "./controllers/webhook.controller.js";

export function createApp(webhook: WebhookController): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  const aboutDirectory = join(process.cwd(), "public", "about");
  app.get("/about", (_request, response) => {
    response.sendFile(join(aboutDirectory, "index.html"));
  });
  app.use("/about", express.static(aboutDirectory, { index: "index.html", maxAge: "1h" }));

  app.post("/webhook", express.raw({ type: "application/json", limit: "1mb" }), webhook.handle);

  app.use((_request, response) => {
    response.status(404).json({ error: "not found" });
  });
  return app;
}
