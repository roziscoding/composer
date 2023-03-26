import { Composer } from "../mod.ts";

type Context = {
  start: number;
  message?: string;
  extra?: string;
};

const composer = new Composer<Context>();

composer.before((ctx, next) => {
  console.log("composer before");
  next({ ...ctx, start: Date.now() });
});

composer.after((ctx, next) => {
  console.log(`Took ${Date.now() - ctx.start} ms`);
  next(ctx);
});

composer.use(async (ctx, next) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return next(ctx);
});

composer.execute({
  start: 0,
}).then(console.log);
