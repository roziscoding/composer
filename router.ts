import { Composer, Middleware } from "./mod.ts";

type RouterContext = { request: Request; response: Response };
type RouterMiddleware = Middleware<RouterContext>;
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const pathname = (url: string) => new URL(url).pathname.toLowerCase();

export class Router extends Composer<RouterContext> {
  route(path: string, method: Method, ...middleware: RouterMiddleware[]) {
    return this.filter((ctx) => pathname(ctx.request.url) === path).filter((ctx) => ctx.request.method === method).use(
      ...middleware,
    ).use(() => Promise.resolve());
  }

  get(path: string, ...middleware: RouterMiddleware[]) {
    return this.route(path, "GET", ...middleware);
  }

  post(path: string, ...middleware: RouterMiddleware[]) {
    return this.route(path, "POST", ...middleware);
  }

  put(path: string, ...middleware: RouterMiddleware[]) {
    return this.route(path, "PUT", ...middleware);
  }

  delete(path: string, ...middleware: RouterMiddleware[]) {
    return this.route(path, "DELETE", ...middleware);
  }

  patch(path: string, ...middleware: RouterMiddleware[]) {
    return this.route(path, "PATCH", ...middleware);
  }
}
