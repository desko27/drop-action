---
"drop-action": patch
---

Raise the default mouse/pen activation distance from 4px to 8px (ADR-0012). A press now has to travel 8px before it turns into a drag, giving a larger margin so a slightly shaky click is less likely to start a drag by accident. Touch is unchanged (250ms delay, 5px tolerance).

Behaviour change: drags that previously began after a 4–7px mouse or pen move now stay a click. Pass `createDropAction({ activationConstraint: { mouse: { distance: 4 }, pen: { distance: 4 } } })` to restore the old threshold.
