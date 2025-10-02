import type { Context } from "hono";

import { setCookie } from "hono/cookie";

export const setSecureCookie = (c: Context, name: string, value: string, maxAge: "15m" | "7d" = "7d"): void => {
  setCookie(c, name, value, {
    secure: true,
    httpOnly: true,
    sameSite: "None",
    maxAge: maxAge === "7d" ? 7 * 24 * 60 * 60 : 15 * 60,
  });
};
