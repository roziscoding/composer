type MaybePromise<T> = Promise<T> | T;
type MaybeArray<T> = Array<T> | T;

type NextFunction<TContext> = (ctx: TContext) => void;
type MiddlewareFn<TContext> = (ctx: TContext, next: NextFunction<TContext>) => void;
type MiddlewareObj<TContext> = {
  middleware(): MiddlewareFn<TContext>;
};
type Middleware<TContext> = MiddlewareFn<TContext> | MiddlewareObj<TContext>;

export function concat<TContext>(first: MiddlewareFn<TContext>, andThen: MiddlewareFn<TContext>) {
  return (ctx: TContext, next: NextFunction<TContext>) => {
    let nextCalled = false;
    return first(ctx, async (newCtx) => {
      if (nextCalled) throw new Error("next already called!");
      nextCalled = true;
      await andThen(newCtx, next);
      return newCtx;
    });
  };
}

export function flatten<TContext>(middleware: Middleware<TContext>) {
  return typeof middleware === "function" ? middleware : middleware.middleware();
}

export function run<TContext>(ctx: TContext, middleware: MiddlewareFn<TContext>) {
  return new Promise<TContext>((resolve, reject) => {
    try {
      middleware(ctx, resolve);
    } catch (err) {
      reject(err);
    }
  });
}

const pass = <TContext>(ctx: TContext, next: NextFunction<TContext>) => next(ctx);

export class Composer<TContext> {
  private handler: MiddlewareFn<TContext>;

  constructor(...middleware: Middleware<TContext>[]) {
    this.handler = middleware.length ? middleware.map(flatten).reduce(concat) : pass;
  }

  middleware() {
    return this.handler;
  }

  use(...middleware: Middleware<TContext>[]) {
    const composer = new Composer(...middleware);
    this.handler = concat(this.handler, composer.middleware());
    return composer;
  }

  before(...middlewares: Middleware<TContext>[]) {
    const composer = new Composer<TContext>(...middlewares);
    this.handler = concat(composer.middleware(), this.handler);
    return composer;
  }

  after(deffered: (ctx: TContext) => void) {
    this.use(async (ctx, next) => {
      await next(ctx);
      deffered(ctx);
    });
  }

  fork(...middleware: Array<Middleware<TContext>>) {
    const composer = new Composer(...middleware);
    this.use((ctx, next) => Promise.all([next(ctx), run(ctx, composer.middleware())]));
    return composer;
  }

  lazy(middlewareFactory: (ctx: TContext) => MaybePromise<MaybeArray<Middleware<TContext>>>) {
    return this.use(async (ctx, next) => {
      const middleware = await middlewareFactory(ctx);
      const arr = Array.isArray(middleware) ? middleware : [middleware];
      return next(await run(ctx, new Composer(...arr).middleware()));
    });
  }

  branch(
    predicate: (ctx: TContext) => MaybePromise<boolean>,
    trueMiddleware: MaybeArray<Middleware<TContext>>,
    falseMiddleware: MaybeArray<Middleware<TContext>>,
  ) {
    return this.lazy(async (ctx) => (await predicate(ctx)) ? trueMiddleware : falseMiddleware);
  }

  filter<D extends TContext>(
    predicate: (ctx: TContext) => ctx is D,
    ...middleware: Array<Middleware<D>>
  ): Composer<D>;
  filter(
    predicate: (ctx: TContext) => MaybePromise<boolean>,
    ...middleware: Array<Middleware<TContext>>
  ): this;
  filter(
    predicate: (ctx: TContext) => MaybePromise<boolean>,
    ...middleware: Array<Middleware<TContext>>
  ) {
    const composer = new Composer(...middleware);
    this.branch(predicate, composer, (_, next) => next(_));
    return composer;
  }

  execute(ctx: TContext) {
    return run(ctx, this.handler);
  }
}

type Context = {
  start: number;
};

const composer = new Composer<Context>();
composer.before((ctx, next) => {
  console.log("composer before");
  next({ ...ctx, start: Date.now() });
});
composer.after((ctx) => console.log(`Took ${Date.now() - ctx.start} ms`));

composer.use(async (ctx, next) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return next(ctx);
});

composer.execute({
  start: 0,
}).then(console.log);
