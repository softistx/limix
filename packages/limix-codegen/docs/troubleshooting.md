# Troubleshooting `@softistx/limix-codegen`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies.

- [In your editor](#in-your-editor): what the compiler says once the file is registered
- [The CLI](#the-cli): what `limix-codegen` prints
- [The plugin](#the-plugin): what graphql-codegen reports

## In your editor

### `Object literal may only specify known properties, and ''/notez'' does not exist in type 'CheckedRestInput<LimixRest>'`

**When:** a key of `definePolicy`'s `rest` or `graphql` is not an operation of
the API. A flat key (`'GET /notez'`, `'Query.you'`) is refused the same way,
under `CheckedRestInput` or `CheckedGraphqlInput`.
**Why:** the registered list does not hold it. Also true of a key written with
the `global.basePath` (`/api/notes`): keys are written without it.
**Fix:** correct the path, the method or the field; if the API gained it,
run `limix-codegen generate` again and commit the file.

### Nothing is refused

**When:** a wrong path compiles.
**Why:** the generated file is not in the program (check your tsconfig
`include`), its input was not given (no `--openapi` leaves REST unchecked), the
key holds `*` or `{` (accepted unchecked), or the rules are not an inline object
literal given to `definePolicy`: a variable, a spread or an escaped `\*` key is
not checked.
**Fix:** include `src/generated`, and pass every input in the script.

### `Type '"x"' is not assignable to type '"admin" | "editor"'` in `roles`, `permissions` or `when`

**When:** a rule names a role, a permission or a condition nobody declared.
**Why:** `Register` declares `role` and `permission` (your `declare module`
block), and `when` is narrowed to the keys of the `conditions` you pass to
`definePolicy` (or to `Register.condition`). The name is a typo, or new.
**Fix:** correct the name, or add it to the declaration. A literal written
`as const` is also refused once names are declared (its lists are readonly):
write the body inline.

### `Subsequent property declarations must have the same type` on `role`

**When:** after upgrading from 0.3, `Register` reports a duplicate `role`,
`permission` or `condition`.
**Why:** the file 0.3 generated still declares those keys, and so does your
hand-written block, with a different type.
**Fix:** run `limix-codegen generate` again (0.4 no longer writes them), then
keep your declaration. Regenerate **before** adding the block.

### An unknown condition in `compilePolicy` options

**When:** `compilePolicy(rules, { conditions: { other: ... } })` fails with
`Object literal may only specify known properties`.
**Why:** `Register.condition` is declared by hand and `other` is not in it.
**Fix:** add the name to the declaration, or drop the declaration and let
`definePolicy(rules, { conditions })` infer the names from the object.

## The CLI

### `<out> is out of date: run limix-codegen generate with the same flags and commit it` and `<out> is missing: ...`

**When:** `generate --check` exits 1.
**Why:** an input changed, or the file was never committed. It checks only the
file: coverage judges the rules.
**Fix:** run the same command without `--check` and commit the result.

### `--out <file> is also an input: it would be overwritten`

**When:** `--out` resolves to a `--graphql` or `--openapi` path (exit 2).
**Fix:** write the types to their own file.

### `--check` fails right after `generate`

**Why:** a formatter rewrote the generated file (a different quote style or
indentation), so the bytes differ from the output.
**Fix:** exclude `src/generated` from the formatter and the linter.

### `Unknown option '--rules'`

**When:** a 0.3 script still passes `--rules` to `generate` or `init` (exit 2, with
the command's usage).
**Why:** 0.4 never reads a policy.
**Fix:** drop the flag (see [Upgrading from 0.3](codegen.md#upgrading-from-03)).

### `<policy>: the policy is TypeScript, use a .ts file`

**When:** `init --out` names a file that is not `.ts` (exit 2).
**Fix:** `init` writes a `definePolicy` call: pick a `.ts` path, default `src/policy.ts`.

### `--graphql needs @softistx/limix-graxia and graphql: bun add -d @softistx/limix-graxia graphql`

**When:** `--graphql` is used and one of the two optional peers is missing.
**Fix:**

```sh
bun add -d @softistx/limix-graxia graphql
```

### `<file>: path item <path> is a $ref: bundle the spec first (one file, path items inline)`

**When:** a path item of the OpenAPI document is `{ $ref: ... }`.
**Why:** the converter reads one file and does not follow references.
**Fix:** bundle the spec into one file with its path items inline.

### `unbalanced { in path <path>`

**When:** an OpenAPI path has a `{` with no `}` (or a lone `}`).
**Fix:** correct the path in the spec.

### `adjacent parameters in <path>: limix needs literal text between two captures`

**When:** an OpenAPI path holds `{a}{b}` with nothing between the two.
**Fix:** a limix pattern cannot split two captures; spell the route with text
between them in the spec, or write its rule by hand.

### `<file>: path <path> cannot be a limix pattern: <reason>`

**When:** the converted path does not compile as a path pattern.
**Fix:** correct the path in the spec; the reason is the compiler's.

### `<file>: use .yaml, .yml or .json` and `<file>: not an OpenAPI document: `paths` must be an object`

**Why:** the extension decides how a file is read, and an OpenAPI or Swagger 2
document must hold a `paths` object.
**Fix:** rename the file, or pass the document, not a fragment of it.

## The plugin

### `the limix graphql-codegen plugin runs on Bun: start it with bun --bun graphql-codegen`

**When:** graphql-codegen runs on Node.
**Fix:** `bun --bun graphql-codegen` (needed only when `openapi` is given).

### `two copies of graphql: ...`

**When:** the schema graphql-codegen hands over is not an instance of the
`graphql` this package loads.
**Why:** two versions of `graphql` are installed.
**Fix:** keep one copy (`bun pm ls graphql`, then dedupe it in the lockfile).

### `<file>: <GraphQL syntax error>`

**When:** `--graphql` names a file that does not parse; the message starts with
the file.
**Fix:** correct the SDL.
