type MaybePromise<T> = Promise<T> | T;
type MaybeArray<T> = Array<T> | T;

export type NextFunction<TContext> = (ctx: TContext) => void;
export type MiddlewareFn<TContext> = (ctx: TContext, next: NextFunction<TContext>) => void;
export type MiddlewareObj<TContext> = {
  middleware(): MiddlewareFn<TContext>;
};
export type Middleware<TContext> = MiddlewareFn<TContext> | MiddlewareObj<TContext>;

export function concat<TContext>(first: MiddlewareFn<TContext>, andThen: MiddlewareFn<TContext>) {
  return (ctx: TContext, next: NextFunction<TContext>) => {
    let nextCalled = false;
    JSON.stringify({ ctx });
    return first(ctx, async (newCtx) => {
      JSON.stringify({ newCtx });
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
    const tree = new Composer(...middleware);
    this.handler = concat(this.handler, tree.middleware());
    return tree;
  }

  before(...middlewares: Middleware<TContext>[]) {
    const tree = new Composer<TContext>(...middlewares);
    this.handler = concat(tree.middleware(), this.handler);
    return tree;
  }

  after(deffered: (ctx: TContext) => void) {
    this.use(async (ctx, next) => {
      await next(ctx);
      deffered(ctx);
    });
  }

  fork(...middleware: Array<Middleware<TContext>>) {
    const tree = new Composer(...middleware);
    this.use((ctx, next) => Promise.all([next(ctx), run(ctx, tree.middleware())]));
    return tree;
  }

  lazy(middlewareFactory: (ctx: TContext) => MaybePromise<MaybeArray<Middleware<TContext>>>) {
    return this.use(async (ctx, next) => {
      const middleware = await middlewareFactory(ctx);
      const arr = Array.isArray(middleware) ? middleware : [middleware];
      const newCtx = await run(ctx, arr.map(flatten).reduce(concat));
      console.log(newCtx);
      return next(newCtx);
    });
  }

  branch(
    predicate: (ctx: TContext) => MaybePromise<boolean>,
    trueMiddleware: MaybeArray<Middleware<TContext>>,
    falseMiddleware: MaybeArray<Middleware<TContext>>,
  ) {
    this.lazy(async (ctx) => (await predicate(ctx)) ? trueMiddleware : falseMiddleware);
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
    const tree = new Composer(...middleware);
    this.branch(predicate, tree, (_, next) => next(_));
    return tree;
  }

  execute(ctx: TContext) {
    return run(ctx, this.handler);
  }
}
