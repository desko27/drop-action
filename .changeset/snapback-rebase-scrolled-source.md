---
"drop-action": patch
---

Snap-back (and any Return) now eases the Overlay back to where the source **currently** sits, not its drag-start position (ADR-0017). A drag that scrolled the page or list under the fixed Overlay used to snap the Item back to a stale frozen spot; the core now re-measures the source at release and re-bases the resolution onto it. The `useResolution()` contract is unchanged in shape and intent — `originRect + transform` is still the Overlay's release position and `originRect` still the home a Return eases to — only the frame is the source's live one. If the source has unmounted or collapsed to a zero-area rect by release, it falls back to the frozen origin.
