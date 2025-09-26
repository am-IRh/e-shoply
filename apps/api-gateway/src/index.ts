import { Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

const app = new Hono();

// Cors middleware
app.use(
  cors({
    origin: ["http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    allowMethods: ["POST"],
  }),
);
// Body limit
app.use(
  bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError(c) {
      return c.json({ error: "Payload too large" }, 413);
    },
  }),
);

const trustProxy = (trustedProxies = []) => {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    const forwarded = c.req.header("X-Forwarded-For");
    const realIp = c.req.header("X-Real-IP");
    const xForwardedProto = c.req.header("X-Forwarded-Proto");

    if (forwarded) {
      c.set("ip", forwarded.split(",")[0].trim());
    } else if (realIp) {
      c.set("ip", realIp);
    } else {
      c.set("ip", "unknown");
    }

    if (xForwardedProto) {
      c.set("protocol", xForwardedProto);
    } else {
      c.set("protocol", "unknown");
    }

    await next();
  };
};

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: c => (c.get("user") ? 1000 : 100),
  message: {
    error: "Rate limit exceeded",
  },
  standardHeaders: true,
  keyGenerator: c => c.get("ip") || "",
});

app.use(trustProxy());
app.use(limiter);

app.get("/gateway-health", c => {
  return c.text("Welcome to gateway");
});

app.use("/*", async c => {
  return await fetch(`http://localhost:6001${c.req.path}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`, {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? await c.req.arrayBuffer() : undefined,
  });
});

export default {
  port: 8080,
  fetch: app.fetch,
};
