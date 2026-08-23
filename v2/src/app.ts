import express, { type Express } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WebhookController } from "./controllers/webhook.controller.js";

export type AboutPageConfig = {
  contactEmail: string;
  contactSubject: string;
};

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createApp(webhook: WebhookController, aboutConfig: AboutPageConfig): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  const aboutDirectory = join(process.cwd(), "public", "about");
  const aboutTemplate = readFileSync(join(aboutDirectory, "index.html"), "utf8");
  const contactUrl = new URL("https://mail.google.com/mail/");
  contactUrl.search = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: aboutConfig.contactEmail,
    su: aboutConfig.contactSubject
  }).toString();
  const aboutPage = aboutTemplate.replace("__CONTACT_URL__", escapeHtmlAttribute(contactUrl.toString()));

  app.get(["/about", "/about/", "/about/index.html"], (_request, response) => {
    response.set("Cache-Control", "no-cache").type("html").send(aboutPage);
  });
  app.use("/about", express.static(aboutDirectory, { index: false, maxAge: 0 }));

  app.post("/webhook", express.raw({ type: "application/json", limit: "1mb" }), webhook.handle);

  app.use((_request, response) => {
    response.status(404).json({ error: "not found" });
  });
  return app;
}
