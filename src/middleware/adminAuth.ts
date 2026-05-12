import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { verifyJwt } from "../services/jwt";

export const adminAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("adminUser" as never, payload.sub as string);
  await next();
});
