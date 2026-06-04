import type { ActivationConstraint, PointerKind } from './types.public'

// The pointer-type-aware default (ADR-0012). Mouse and pen activate on a
// small distance so a drag feels near-instant; touch waits out a short
// delay within a tolerance so a quick swipe scrolls the list while a
// press-and-hold drags.
export const DEFAULT_ACTIVATION_CONSTRAINT: Required<ActivationConstraint> = {
  mouse: { distance: 4 },
  pen: { distance: 4 },
  touch: { delay: 250, tolerance: 5 },
}

// Fold a partial, consumer-supplied constraint onto the default so every
// pointer kind always has a concrete rule the engine can drive.
export const resolveActivationConstraint = (
  constraint: ActivationConstraint = {},
): Required<ActivationConstraint> => ({
  mouse: constraint.mouse ?? DEFAULT_ACTIVATION_CONSTRAINT.mouse,
  pen: constraint.pen ?? DEFAULT_ACTIVATION_CONSTRAINT.pen,
  touch: constraint.touch ?? DEFAULT_ACTIVATION_CONSTRAINT.touch,
})

// Map a raw PointerEvent.pointerType string onto the three kinds we model.
// Anything we don't recognise (e.g. an empty string) is treated as a mouse,
// the least surprising near-instant gesture.
export const pointerKindOf = (pointerType: string): PointerKind =>
  pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse'

export type ActivationDecision = 'activate' | 'pending' | 'cancel'

export type EvaluateActivationArgs = {
  kind: PointerKind
  // Movement since the press, in CSS pixels.
  dx: number
  dy: number
  // Time since the press, in milliseconds.
  elapsed: number
  constraint: Required<ActivationConstraint>
}

// The pure activation evaluator the engine drives on every move (and once
// when the touch delay timer fires). It owns the whole gesture model so it
// can be unit-tested without a DOM:
//
// - distance gestures (mouse/pen): cross the distance → 'activate', else
//   stay 'pending'. There is no way to cancel a distance gesture by moving;
//   only pointerup (handled by the engine) ends it as a click.
// - delay gestures (touch): moving beyond the tolerance before the delay
//   elapses → 'cancel' (let the browser scroll); once the delay has elapsed
//   while still within tolerance → 'activate'; otherwise 'pending'.
export const evaluateActivation = ({
  kind,
  dx,
  dy,
  elapsed,
  constraint,
}: EvaluateActivationArgs): ActivationDecision => {
  const distance = Math.hypot(dx, dy)
  const rule = constraint[kind]

  if ('delay' in rule) {
    if (distance > rule.tolerance) return 'cancel'
    return elapsed >= rule.delay ? 'activate' : 'pending'
  }

  return distance >= rule.distance ? 'activate' : 'pending'
}
