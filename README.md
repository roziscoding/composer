# Composer

Standalone implementation of the "Chain of Command" pattern. Heavily inspired by
[grammY's Composer class](https://github.com/grammyjs/grammy/tree/main/src/composer.ts)

## Usage

### Getting started

You start by creating an instance of the `Composer` class, passing as a type param the type of your context. You then
register your middleware functions and call the `execute` function, passing the value of the context. The resulting
promise will contain the context as returned by the middleware tree.

> Important: you must **always** call `next`. If you don't, your middleware tree will stay stuck and will not finish
> execution. Also, the call to `next` should always be awaited or returned, so you don't run into concurrency problems.

```typescript
import { Composer } from "https://deno.land/x/composer/mod.ts";

type Context = {
  steps: number;
};

const composer = new Composer();
composer.use((ctx, next) => next({ ...ctx, steps: ctx.steps + 1 }));

composer.execute({ steps: 0 }).then(console.log); // { steps: 1 }
```

### Timeshift Methods

Composer offers two methods, which we call Timeshift Methods, that allow you to register middleware to be run either
`after` or `before` the regularly registered middleware. This allows you to ensure execution order and make your code
clearer.

#### Deferring execution

Sometimes you need a middleware function to perform tasks after all the other middleware has finished running. To do
that, you have two options: you can either `await next(ctx)` and perform your tasks after that; or you can use the
`after` method, like so:

```typescript
import { Composer } from 'https://deno.land/x/composer/mod.ts'

type Context = {
  start: number
  steps: number
}

const composer = new Composer<Context>()
composer.after((ctx, next) => { console.log(`took ${Date.now() - start} ms`}); return next(ctx) })
composer.use((ctx, next) => next({ ...ctx, start: Date.now() }))
composer.use((ctx, next) => next({ ...ctx, steps: ctx.steps + 1 }))

composer.execute({ steps: 0 }).then(console.log)
// took xxx ms
// { steps: 1 }
```

The `after` method registers the middleware function in a special way that makes sure that it **always** runs after all
the other middleware. As with regular middleware, middleware registered using `after` can modify the context by passing
the mutated context, or a mutated clone of it, to the `next` function.

#### Forwarding execution

Opposite to the `after` method, there is the `before` method for when you need to run things before any registered
middleware:

```typescript
import { Composer } from 'https://deno.land/x/composer/mod.ts'

type Context = {
  start: number
  steps: number
}

const composer = new Composer<Context>()
composer.use((ctx, next) => next({ ...ctx, start: Date.now() }))
composer.use((ctx, next) => next({ ...ctx, steps: ctx.steps + 1 }))
composer.use((ctx, next) => { console.log(`took ${Date.now() - start} ms`}); return next(ctx) })
composer.before((ctx, next) => next({ ...ctx, start: Date.now() }))

composer.execute({ steps: 0 }).then(console.log)
// took xxx ms
// { steps: 1 }
```

The `before` method works similarly to the `after` method in that it registers the middleware function in a special way
that makes sure it will **always** run before any other middleware registered regularly. As with any other middleware,
you can also modify the context by passing its new version to `next`, be it a new object or the mutated existing one.

#### Order matters

As you've seen with the examples, `before` middleware will always run at the beginning of the execution, and `after`
middleware will always run at the end of the execution, no matter if you call them before or after `use`. However, when
you call timeshift functions multiple times, they will be executed in the order they were registered. For example:

```typescript
type Context = {
  steps: number[];
};

const composer = new Composer<Steps>();

composer.before((ctx, next) => next({ ...ctx, steps: ctx.steps.concat([1]) }));
composer.before((ctx, next) => next({ ...ctx, steps: ctx.steps.concat([2]) }));
composer.after((ctx, next) => next({ ...ctx, steps: ctx.steps.concat([3]) }));
composer.after((ctx, next) => next({ ...ctx, steps: ctx.steps.concat([4]) }));

composer.execute({ steps: [] }).then(console.log); // [1, 2, 3, 4]
```
