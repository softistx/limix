---
'@softistx/limix-janus': minor
---

The 1.0 surface of limix-janus. Breaking: `checkRulesAgainstModel` is now `checkModel` and `CheckIssue` is now `ModelIssue`, with no aliases. Added: `ModelIssue.kind` (`'unknown-type' | 'unknown-relation' | 'from-field'`) and the exported `ModelIssueKind` union; a new kind is a minor release.
