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

### An unknown condition in `compilePolicy` options

**When:** `compilePolicy(rules, { conditions: { other: ... } })` fails with
`Object literal may only specify known properties`.
**Why:** `other` is not named by `when` in the rules file you generated from.
**Fix:** add the condition to the rules file and regenerate, or fix the name.

## The CLI

### `<rules>: rest['<key>'] applies to no operation of <openapi> (no <METHOD> route matches <path>)`

**When:** `generate` prints it (a warning) or `generate --check` exits 1 with
`<n> stale rule(s)`.
**Why:** no operation of the OpenAPI spec reaches that rule: a typo, a route that
was removed or renamed, a `global.basePath` written into the key, or a wildcard
pattern no operation falls under.
**Fix:** correct the key, remove the rule, or add the operation to the spec. A
route the spec deliberately leaves out (undocumented, or served by another
spec): add it to the spec, or pass every spec with a repeated `--openapi`; the
rule is judged against the operations you give.

```yaml
rest:
  "GET /notes":      # was "GET /notez": it reaches no operation
    authenticated: true
```

### `<rules>: rest['<path>'].<METHOD> is shadowed by <METHOD> <path> above it: it never applies`

**When:** the same run, for a rule an earlier rule always takes first.
**Why:** rules are first-match in document order, and the earlier pattern
(`/notes/:id`) matches every path of the later one (`/notes/new`).
**Fix:** move the specific rule above the general one.

```yaml
rest:
  "GET /notes/new":   # first
    public: true
  "GET /notes/:id":
    authenticated: true
```

### `<rules>: graphql['<Type.field>'] names no type of <schema>`

**When:** the same run, for a GraphQL rule whose type is not in the SDL.
**Why:** a typo (`Nope.*`), a type that was renamed or removed, or an SDL file
missing from the `--graphql` flags (give every file).
**Fix:** correct the type, remove the rule, or pass the file that declares it.

### `<rules>: graphql['<Type.field>'] names no field of <Type> in <schema>`

**When:** the same run, for a rule whose type exists but has no such field.
**Fix:** correct the field or remove the rule. A `Type.*` rule on a type of the
schema is never reported.

### `<n> stale rule(s): fix or remove them, or add the operation to the spec`

**When:** the last line of `generate --check` when any of the four messages
above was printed (exit 1).
**Fix:** act on each line above it. Without `--check` the same lines are
warnings and the exit code stays 0. REST rules are judged only with `--openapi`
and GraphQL rules only with `--graphql`: leave an input out to leave its rules
unjudged.

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
