# Troubleshooting `@softistx/limix-codegen`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies.

- [In your editor](#in-your-editor): what the compiler says once the file is registered
- [The CLI](#the-cli): what `limix-codegen` prints
- [The plugin](#the-plugin): what graphql-codegen reports

## In your editor

### `Object literal may only specify known properties, and ''/notez'' does not exist in type 'CheckedRest<LimixRest>'`

**When:** a key of `definePolicy`'s `rest` or `graphql` is not an operation of
the API.
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

### An unknown condition in `compilePolicy` options

**When:** `compilePolicy(rules, { conditions: { other: ... } })` fails with
`Object literal may only specify known properties`.
**Why:** `other` is not named by `when` in the rules file you generated from.
**Fix:** add the condition to the rules file and regenerate, or fix the name.

## The CLI

### `<out> is out of date: run limix-codegen generate with the same flags and commit it` and `<out> is missing: ...`

**When:** `generate --check` exits 1.
**Why:** an input changed, or the file was never committed.
**Fix:** run the same command without `--check` and commit the result.

### `--out <file> is also an input: it would be overwritten`

**When:** `--out` resolves to a `--graphql`, `--openapi` or `--rules` path (exit 2).
**Fix:** write the types to their own file.

### `--check` fails right after `generate`

**Why:** a formatter rewrote the generated file (a different quote style or
indentation), so the bytes differ from the output.
**Fix:** exclude `src/generated` from the formatter and the linter.

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

**When:** the converted path does not compile as a rules-file pattern.
**Fix:** correct the path in the spec; the reason is the compiler's.

### `<file>: use .yaml, .yml or .json` and `<file>: not an OpenAPI document: `paths` must be an object`

**Why:** the extension decides how a file is read, and an OpenAPI or Swagger 2
document must hold a `paths` object.
**Fix:** rename the file, or pass the document, not a fragment of it.

## The plugin

### `the limix graphql-codegen plugin runs on Bun: start it with bun --bun graphql-codegen`

**When:** graphql-codegen runs on Node.
**Fix:** `bun --bun graphql-codegen` (needed only when `rules` or `openapi` is given).

### `two copies of graphql: ...`

**When:** the schema graphql-codegen hands over is not an instance of the
`graphql` this package loads.
**Why:** two versions of `graphql` are installed.
**Fix:** keep one copy (`bun pm ls graphql`, then dedupe it in the lockfile).

### `<file>: <GraphQL syntax error>`

**When:** `--graphql` names a file that does not parse; the message starts with
the file.
**Fix:** correct the SDL.
