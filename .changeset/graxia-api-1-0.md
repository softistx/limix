---
'@softistx/limix-graxia': minor
---

The 1.0 surface of limix-graxia. Breaking: `refusalError(refusal, mapRefusal?, at?, topLevel?)` is now `refusalError(refusal, { mapRefusal?, at?, topLevel? })`; the first parameter of `MapRefusal` is core's structural `Refusal` instead of `LimixRefusal` (an unannotated mapper keeps compiling; one that annotates its parameter `LimixRefusal` changes it to `Refusal`, or narrows with `isLimixRefusal`); `LimixGraxiaOptions` and `guardSchema` take `<Ctx extends object = Empty>`, so a bare `LimixGraxiaOptions` means an empty context instead of any context. Added: the `RefusalErrorOptions` type.
