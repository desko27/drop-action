---
"drop-action": minor
---

Add pluggable modifiers: a composable `(args) => Transform` pipeline applied
left-to-right whose result drives both the Overlay transform and the
post-modifier rect collision tests against (ADR-0007). Configurable via the
`modifiers` option on `createDropAction`, defaulting to `[restrictToWindowEdges]`.
Ships tree-shakeable built-ins `restrictToWindowEdges`, `restrictToVerticalAxis`,
`restrictToHorizontalAxis`, and `snapToGrid(size)`, plus the `Modifier`,
`ModifierArgs`, and `Transform` types.
