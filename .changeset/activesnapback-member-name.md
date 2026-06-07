---
"drop-action": minor
---

Rename the snap-back Extension's namespace members so they sit next to their core counterparts in dot-notation: `SnapBack` → `ActiveSnapBack` and `useSnapBack` → `useActiveSnapBack` (ADR-0026). They are drop-in replacements for `Active` / `useActive` (`useActiveSnapBack` returns a superset of what `useActive` does), so the `Active` prefix surfaces them right beside what they replace in `DA.` autocomplete instead of hiding elsewhere in the list — no more reaching for `Active` and silently dropping the snap-back you injected.

The Extension factory (`snapBack()`), its exported types (`SnapBackOptions`, `SnapBackReads`, `SnapBackState`), the `data-snapping` marker and the glossary term "Snap-back" are unchanged — the prefix is purely a dot-notation discoverability device, and only the two channel members live on the namespace.

**Breaking (no alias):** migrate `DnD.SnapBack` → `DnD.ActiveSnapBack`, `DnD.useSnapBack` → `DnD.useActiveSnapBack`, and `const { SnapBack } = snapBack()(DnD)` → `const { ActiveSnapBack } = snapBack()(DnD)`.
