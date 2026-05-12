import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import admin from "./routes/admin";
import proxy from "./routes/proxy";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());
app.use("/v1/*", cors());

app.route("/api/admin", admin);
app.route("/v1", proxy);

// SPA fallback: serve static assets for all non-API/non-proxy routes
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
