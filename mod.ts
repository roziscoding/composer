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
  private beforewere: MiddlewareFn<TContext> = pass;
  private handler: MiddlewareFn<TContext>;
  private afterware: MiddlewareFn<TContext> = pass;

  /**
   * Constructs a new composer based on the provided middleware. If no
   * middleware is given, the composer instance will simply make all context
   * objects pass through without touching them.
   *
   * @param middleware The middleware to compose
   */
  constructor(...middleware: Middleware<TContext>[]) {
    this.handler = middleware.length ? middleware.map(flatten).reduce(concat) : pass;
  }

  middleware() {
    return [this.beforewere, this.handler, this.afterware].reduce(concat);
  }

  /**
   * Registers middleware to be executed following registration order
   * @param middleware Middleware to be executed
   * @returns A new composer of the given middleware
   */
  use(...middleware: Middleware<TContext>[]) {
    const tree = new Composer(...middleware);
    this.handler = concat(this.handler, tree.middleware());
    return tree;
  }

  /**
   * Registers middleware to be executed before any other middleware, **including
   * ones previously registered with this method**
   * @param middleware Middleware to be prepended
   * @returns A new composer of the given middleware
   */
  before(...middleware: Middleware<TContext>[]) {
    this.beforewere = [this.beforewere, ...middleware].map(flatten).reduce(concat);
  }

  /**
   * Register middleware to run after all the other middlewares.
   * @param deffered Middleware to be appended
   */
  after(...deffered: Middleware<TContext>[]) {
    this.afterware = [this.afterware, ...deffered].map(flatten).reduce(concat);
  }

  /**
   * Register middleware to be executed concurrently with the rest of the middleware stack
   * @param middleware Middleware to be executed
   * @returns A new composer of the given middleware
   */
  fork(...middleware: Array<Middleware<TContext>>) {
    const tree = new Composer(...middleware);
    const fork = tree.middleware();
    this.use(async (ctx, next) => await Promise.all([next(ctx), run(ctx, fork)]));
    return tree;
  }

  /**
   * Allows to determine what middleware should be executed right before execution
   *
   * ```ts
   * type Context = { n: number; m: string };
   * const composer = new Composer<Context>();
   * const odd: MiddlewareFn<Context> = (ctx, next) => next({ ...ctx, m: "odd" });
   * const even: MiddlewareFn<Context> = (ctx, next) => next({ ...ctx, m: "even" });
   *
   * composer.lazy((ctx) => ctx.n % 2 ? odd : even);
   *
   * composer.execute({ n: 1, m: "" }).then((ctx) => console.log(ctx.m)); // 'odd'
   * composer.execute({ n: 2, m: "" }).then((ctx) => console.log(ctx.m)); // 'even'
   * ```
   * @param middlewareFactory Function that returns the middleware to be executed
   * @returns This composer instance
   */
  lazy(middlewareFactory: (ctx: TContext) => MaybePromise<MaybeArray<Middleware<TContext>>>) {
    return this.use(async (ctx, next) => {
      const middleware = await middlewareFactory(ctx);
      const arr = Array.isArray(middleware) ? middleware : [middleware];
      const newCtx = await run(ctx, arr.map(flatten).reduce(concat));
      return next(newCtx);
    });
  }

  /**
   * This method takes a predicate function that is tested once per context
   * object. If it returns `true`, the first supplied middleware is executed.
   * If it returns `false`, the second supplied middleware is executed. Note
   * that the predicate may be asynchronous, i.e. it can return a Promise of a
   * boolean.
   *
   * ```ts
   * type Context = { n: number; m: string };
   * const composer = new Composer<Context>();
   * const odd: MiddlewareFn<Context> = (ctx, next) => next({ ...ctx, m: "odd" });
   * const even: MiddlewareFn<Context> = (ctx, next) => next({ ...ctx, m: "even" });
   *
   * composer.branch((ctx) => Boolean(ctx.n % 2), odd, even);
   *
   * composer.execute({ n: 1, m: "" }).then((ctx) => console.log(ctx.m)); // 'odd'
   * composer.execute({ n: 2, m: "" }).then((ctx) => console.log(ctx.m)); // 'even'
   * ```
   * @param predicate Function to determine which branch to execute
   * @param trueMiddleware Middleware to execute if `predicate` returns true
   * @param falseMiddleware Middleware to execute if `predicate` returns false
   */
  branch(
    predicate: (ctx: TContext) => MaybePromise<boolean>,
    trueMiddleware: MaybeArray<Middleware<TContext>>,
    falseMiddleware: MaybeArray<Middleware<TContext>>,
  ) {
    this.lazy(async (ctx) => (await predicate(ctx)) ? trueMiddleware : falseMiddleware);
  }

  /**
   * Registers middleware behind a custom filter function that operates on the
   * context object and decides whether or not to execute the middleware. In
   * other words, the middleware will only be executed if the given predicate
   * returns `true` for the given context object. Otherwise, it will be
   * skipped and the next middleware will be executed.
   *
   * This method has two signatures. The first one is straightforward, it is
   * the one described above. Note that the predicate may be asynchronous, i.e.
   * it can return a Promise of a boolean.
   *
   * Alternatively, you can pass a function that has a type predicate as
   * return type. This will allow you to narrow down the context object. The
   * installed middleware is then able to operate on this constrained context
   * object.
   * ```ts
   * // NORMAL USAGE
   * // Only process every second update
   * bot.filter(ctx => ctx.update.update_id % 2 === 0, ctx => { ... })
   *
   * // TYPE PREDICATE USAGE
   * function predicate(ctx): ctx is Context & { message: undefined } {
   *   return ctx.message === undefined
   * }
   * // Only process updates where `message` is `undefined`
   * bot.filter(predicate, ctx => {
   *   const m = ctx.message // inferred as always undefined!
   *   const m2 = ctx.update.message // also inferred as always undefined!
   * })
   * ```
   *
   * @param predicate The predicate to check
   * @param middleware The middleware to register
   */
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
    return run(ctx, this.middleware());
  }
}
