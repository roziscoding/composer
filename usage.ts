import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
import { Router } from "./router.ts";

const port = 8080;

const router = new Router();

router.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(
    `[${ctx.request.method}] ${new URL(ctx.request.url).pathname} - ${ctx.response.status} in ${Date.now() - start} ms`,
  );
});

router.post("/", (ctx, next) => {
  ctx.response = new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
  });
  return next();
});

router.get("/", (ctx, next) => {
  ctx.response = new Response(JSON.stringify({ hello: "world" }));
  return next();
});

router.post("/teste", (ctx, next) => {
  ctx.response = new Response(JSON.stringify({ you: "found me" }));
  return next();
});

const handler = async (request: Request): Promise<Response> => {
  const context = {
    request,
    response: new Response(),
  };

  await router.execute(context);

  console.log(context);

  return context.response;
};

console.log(`HTTP webserver running. Access it at: http://localhost:8080/`);
await serve(handler, { port });
