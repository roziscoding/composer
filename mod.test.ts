import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.181.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.181.0/testing/bdd.ts";
import { assertSpyCallArg, assertSpyCalls, spy } from "https://deno.land/std@0.181.0/testing/mock.ts";
import { Composer, MiddlewareFn } from "./mod.ts";

type StepsContext = {
  steps: number[];
};

const addStep = (value: number): MiddlewareFn<StepsContext> => (ctx, next) =>
  next({ ...ctx, steps: ctx.steps.concat([value]) });

const delay =
  <TContext = StepsContext>(middleware: MiddlewareFn<TContext>, ms: number): MiddlewareFn<TContext> => (ctx, next) =>
    new Promise((resolve) => setTimeout(resolve, ms)).then(() => middleware(ctx, next));

async function assertSteps(
  composer: Composer<StepsContext>,
  steps: number[],
  initialContext: StepsContext = { steps: [] },
) {
  assertEquals(await composer.execute(initialContext), { steps: steps });
}

class StepsComposer extends Composer<StepsContext> {}

describe("Composer", () => {
  describe("when no middleware is registered", () => {
    it("returns the unmodified context", async () => {
      const composer = new Composer();

      assertEquals(await composer.execute({ a: "b" }), { a: "b" });
    });
  });

  describe("use", () => {
    it("registers and runs the middleware", () => {
      const composer = new StepsComposer();
      composer.use(addStep(1));

      assertSteps(composer, [1]);
    });

    it("is able to run multiple middleware in sequence", () => {
      const composer = new StepsComposer();

      composer.use(addStep(1));
      composer.use(addStep(2));

      assertSteps(composer, [1, 2]);
    });

    it("can register multiple middleware at once and keep the order", () => {
      const composer = new StepsComposer();

      composer.use(addStep(1), addStep(2));
      composer.use(addStep(3), addStep(4));

      assertSteps(composer, [1, 2, 3, 4]);
    });
  });

  describe("before", () => {
    it("disregards registering order", () => {
      const composer = new StepsComposer();
      composer.use(addStep(2));
      composer.before(addStep(1));

      assertSteps(composer, [1, 2]);
    });

    it("preserves order when used multiple times", () => {
      const composer = new StepsComposer();
      composer.use(addStep(3));

      composer.before(addStep(1));
      composer.before(addStep(2));

      assertSteps(composer, [1, 2, 3]);
    });
  });

  describe("after", () => {
    it("disregards registering order", async () => {
      const composer = new StepsComposer();
      let afterCtx: StepsContext = { steps: [] };
      composer.after((ctx, next) => {
        afterCtx = ctx;
        return next(ctx);
      });

      composer.use(addStep(1));

      const result = await composer.execute({ steps: [] });

      assertEquals(afterCtx, result);
    });
  });

  describe("fork", () => {
    it("executes all the middlewares", async () => {
      const composer = new Composer<undefined>();
      const fn = spy(() => true);

      composer.use((ctx, next) => fn() && next(ctx));
      composer.fork((ctx, next) => fn() && next(ctx));
      composer.use((ctx, next) => fn() && next(ctx));

      await composer.execute(undefined);

      assertSpyCalls(fn, 3);
    });

    it("runs middleware concurrently", async () => {
      const composer = new Composer<undefined>();
      const fn = spy(() => true);
      const startTime = Date.now();

      composer.use(delay((ctx, next) => fn() && next(ctx), 1));
      composer.fork((ctx, next) => fn() && next(ctx));

      await composer.execute(undefined);

      assertSpyCalls(fn, 2);
      assertAlmostEquals(Date.now() - startTime, 1, 10);
    });
  });

  describe("lazy", () => {
    it("executes the factory", async () => {
      const factory = spy((): MiddlewareFn<unknown> => (ctx, next) => next(ctx));

      const composer = new Composer<unknown>();

      composer.lazy(factory);

      await composer.execute({});

      assertSpyCalls(factory, 1);
    });

    it("executes the returned middleware", async () => {
      const fn = spy();

      const composer = new Composer<unknown>();

      composer.lazy(() => (ctx, next) => {
        fn(ctx);
        next({});
      });

      await composer.execute({});

      assertSpyCallArg(fn, 0, 0, {});
    });
  });
});
