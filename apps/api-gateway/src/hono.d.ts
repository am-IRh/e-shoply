import "hono";

declare module "hono" {
  interface ContextVariableMap {
    ip: string;
    protocol: string;
    user: string;
  }
}
