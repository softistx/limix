---
'@softistx/limix-graxia': minor
---

The 1.0 surface of limix-graxia. Breaking: `refusalError(refusal, mapRefusal?, at?, topLevel?)` is now `refusalError(refusal, { mapRefusal?, at?, topLevel? })`; the first parameter of `MapRefusal` is core's structural `Refusal` instead of `LimixRefusal` (a mapper written for `LimixRefusal` keeps compiling when it reads `code`, `status` and `params`); `LimixGraxiaOptions` and `guardSchema` take `<Ctx extends object = Empty>`, so a bare `LimixGraxiaOptions` means an empty context instead of any context.
