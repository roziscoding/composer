import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { Composer, Middleware } from "../mod.ts";

export type RouterContext = { request: Request; response: Response };
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const pathname = (url: string) => new URL(url).pathname.toLowerCase();

export class Router<Context extends RouterContext> extends Composer<Context> {
  route(path: string, method: Method, ...middleware: Middleware<Context>[]) {
    return this
      .filter((ctx) => pathname(ctx.request.url) === path)
      .filter((ctx) => ctx.request.method === method)
      .use(...middleware)
      .use((ctx) => Promise.resolve(ctx));
  }

  get(path: string, ...middleware: Middleware<Context>[]) {
    return this.route(path, "GET", ...middleware);
  }

  post(path: string, ...middleware: Middleware<Context>[]) {
    return this.route(path, "POST", ...middleware);
  }

  put(path: string, ...middleware: Middleware<Context>[]) {
    return this.route(path, "PUT", ...middleware);
  }

  delete(path: string, ...middleware: Middleware<Context>[]) {
    return this.route(path, "DELETE", ...middleware);
  }

  patch(path: string, ...middleware: Middleware<Context>[]) {
    return this.route(path, "PATCH", ...middleware);
  }
}

const port = 8080;

const router = new Router<RouterContext & { start: number }>();
router.before((ctx, next) => next({ ...ctx, start: Date.now() }));
router.after((ctx) =>
  console.log(
    `[${ctx.request.method}] ${new URL(ctx.request.url).pathname} - ${ctx.response.status} in ${
      Date.now() - ctx.start
    } ms`,
  )
);

router.post("/", (ctx, next) => {
  return next({
    ...ctx,
    response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  });
});

router.get("/", (ctx, next) => {
  return next({
    ...ctx,
    response: new Response(JSON.stringify({ hello: "world" })),
  });
});

router.post("/teste", (ctx, next) => {
  return next({
    ...ctx,
    response: new Response(JSON.stringify({ you: "found me" })),
  });
});

const handler = (request: Request): Promise<Response> => {
  const context = {
    request,
    response: new Response(),
    start: 0,
  };

  return router.execute(context).then(({ response }) => response);
};

console.log(`HTTP webserver running. Access it at: http://localhost:8080/`);
await serve(handler, { port });
