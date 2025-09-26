import { Hono } from "hono";
import createErrorHandler from "./lib/error-handler";
import auth from "./routes/auth";
const app = new Hono();

app.route("/auth", auth);
app.onError(createErrorHandler({ logErrors: true }));
app.notFound(c => {
  return c.text("404", 404);
});

export default {
  port: 6001,
  fetch: app.fetch,
};
