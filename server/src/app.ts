import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter      from "./routes/auth.js";
import teamsRouter     from "./routes/teams.js";
import membershipRouter from "./routes/membership.js";
import invitesRouter   from "./routes/invites.js";
import discoveryRouter from "./routes/discovery.js";
import eventsRouter    from "./routes/events.js";
import meRouter        from "./routes/me.js";
import adminRouter     from "./routes/admin.js";

export function createApp() {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }));

  // ── CORS — restricted to client origin ────────────────────────────────────
  app.use(cors({
    origin:      env.CLIENT_ORIGIN,
    credentials: true,
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Idempotency-Key"],
  }));

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // ── Request ID correlation ─────────────────────────────────────────────────
  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // ── Health check (unauthenticated) ─────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use("/api/v1/auth",      authRouter);
  app.use("/api/v1/teams",     teamsRouter);
  app.use("/api/v1/teams",     membershipRouter);
  app.use("/api/v1/teams",     invitesRouter);
  app.use("/api/v1/invites",   invitesRouter);    // /api/v1/invites/redeem/:code
  app.use("/api/v1/discovery", discoveryRouter);
  app.use("/api/v1/events",    eventsRouter);
  app.use("/api/v1/me",        meRouter);
  app.use("/api/v1/admin",     adminRouter);

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // ── Central error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
