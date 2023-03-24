type MaybePromise<T> = Promise<T> | T;
type MaybeArray<T> = Array<T> | T;

type NextFunction = (err?: unknown) => MaybePromise<void>;
export type MiddlewareFn<C> = (ctx: C, next: NextFunction) => void;
export type MiddlewareObj<C> = {
  middleware: () => MiddlewareFn<C>;
};
export type Middleware<C> = MiddlewareFn<C> | MiddlewareObj<C>;

function concat<C>(
  first: MiddlewareFn<C>,
  andThen: MiddlewareFn<C>,
) {
  return (ctx: C, next: NextFunction) => {
    let nextCalled = false;
    return first(ctx, (err) => {
      if (err) throw err;
      if (nextCalled) throw new Error("next already called");
      nextCalled = true;
      return andThen(ctx, next);
    });
  };
}

function flatten<C>(mw: Middleware<C>): MiddlewareFn<C> {
  return typeof mw === "function" ? mw : (ctx, next) => mw.middleware()(ctx, next);
}

function run<C>(middleware: Middleware<C>, ctx: C, next?: NextFunction) {
  return flatten(middleware)(ctx, () => next ? next() : Promise.resolve());
}

export class Composer<C> {
  private handler: MiddlewareFn<C>;

  constructor(...middleware: Array<Middleware<C>>) {
    this.handler = middleware.length ? middleware.map(flatten).reduce(concat) : (_, next) => {
      return next();
    };
  }

  middleware() {
    return this.handler;
  }

  use(...middleware: Array<Middleware<C>>) {
    const composer = new Composer(...middleware);
    this.handler = concat(this.handler, flatten(composer));
    return composer;
  }

  fork(...middleware: Array<Middleware<C>>) {
    const composer = new Composer(...middleware);
    this.use((ctx, next) => Promise.all([next(), run(composer, ctx)]));
    return composer;
  }

  lazy(middlewareFactory: (ctx: C) => MaybePromise<MaybeArray<Middleware<C>>>) {
    return this.use(async (ctx, next) => {
      const middleware = await middlewareFactory(ctx);
      const arr = Array.isArray(middleware) ? middleware : [middleware];
      return run(new Composer(...arr), ctx, next);
    });
  }

  branch(
    predicate: (ctx: C) => MaybePromise<boolean>,
    trueMiddleware: MaybeArray<Middleware<C>>,
    falseMiddleware: MaybeArray<Middleware<C>>,
  ) {
    return this.lazy(async (ctx) => (await predicate(ctx)) ? trueMiddleware : falseMiddleware);
  }

  filter<D extends C>(
    predicate: (ctx: C) => ctx is D,
    ...middleware: Array<Middleware<D>>
  ): Composer<D>;
  filter(
    predicate: (ctx: C) => MaybePromise<boolean>,
    ...middleware: Array<Middleware<C>>
  ): this;
  filter(
    predicate: (ctx: C) => MaybePromise<boolean>,
    ...middleware: Array<Middleware<C>>
  ) {
    const composer = new Composer(...middleware);
    this.branch(predicate, composer, (_, next) => next());
    return composer;
  }

  execute(ctx: C, leaf?: NextFunction) {
    return run(this, ctx, leaf);
  }
}
