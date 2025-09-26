import redis from "@repo/redis";
import { Hono } from "hono";

const auth = new Hono();

auth.get("/", c => {
  redis.set("hello", { ok: true, message: "ok" });
  return c.json({ result: "hello" });
});

export default auth;
