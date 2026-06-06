import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ACTIVATION_CONSTRAINT,
  defaultShouldStart,
  evaluateActivation,
  pointerKindOf,
  resolveActivationConstraint,
} from '../createDropAction/activation'

// First test seam (ADR-0012): the activation constraint is data plus a pure
// evaluator, verified in isolation from any DOM, timer, or engine state.
describe('evaluateActivation', () => {
  const constraint = DEFAULT_ACTIVATION_CONSTRAINT

  describe('distance gestures (mouse / pen)', () => {
    test('mouse stays pending below the distance threshold', () => {
      expect(
        evaluateActivation({
          kind: 'mouse',
          dx: 2,
          dy: 2,
          elapsed: 0,
          constraint,
        }),
      ).toBe('pending')
    })

    test('mouse activates once the distance threshold is crossed', () => {
      // 8px straight down meets the default 8px threshold.
      expect(
        evaluateActivation({
          kind: 'mouse',
          dx: 0,
          dy: 8,
          elapsed: 0,
          constraint,
        }),
      ).toBe('activate')
    })

    test('distance is euclidean, not per-axis', () => {
      // 6px on each axis is under the 8px threshold, but the ~8.49px
      // diagonal crosses it.
      expect(
        evaluateActivation({
          kind: 'mouse',
          dx: 6,
          dy: 6,
          elapsed: 0,
          constraint,
        }),
      ).toBe('activate')
    })

    test('pen uses the same distance model as mouse', () => {
      expect(
        evaluateActivation({
          kind: 'pen',
          dx: 1,
          dy: 0,
          elapsed: 0,
          constraint,
        }),
      ).toBe('pending')
      expect(
        evaluateActivation({
          kind: 'pen',
          dx: 10,
          dy: 0,
          elapsed: 0,
          constraint,
        }),
      ).toBe('activate')
    })

    test('elapsed time never activates a distance gesture on its own', () => {
      expect(
        evaluateActivation({
          kind: 'mouse',
          dx: 0,
          dy: 0,
          elapsed: 10_000,
          constraint,
        }),
      ).toBe('pending')
    })
  })

  describe('delay gestures (touch)', () => {
    test('held in place but before the delay → pending', () => {
      expect(
        evaluateActivation({
          kind: 'touch',
          dx: 0,
          dy: 0,
          elapsed: 100,
          constraint,
        }),
      ).toBe('pending')
    })

    test('held within tolerance past the delay → activate', () => {
      expect(
        evaluateActivation({
          kind: 'touch',
          dx: 3,
          dy: 0,
          elapsed: 300,
          constraint,
        }),
      ).toBe('activate')
    })

    test('moved beyond tolerance before the delay → cancel (a scroll)', () => {
      expect(
        evaluateActivation({
          kind: 'touch',
          dx: 0,
          dy: 20,
          elapsed: 50,
          constraint,
        }),
      ).toBe('cancel')
    })

    test('within tolerance and still before the delay → pending', () => {
      expect(
        evaluateActivation({
          kind: 'touch',
          dx: 5,
          dy: 0,
          elapsed: 50,
          constraint,
        }),
      ).toBe('pending')
    })
  })
})

describe('resolveActivationConstraint', () => {
  test('returns the pointer-type-aware default when given nothing', () => {
    expect(resolveActivationConstraint()).toEqual(DEFAULT_ACTIVATION_CONSTRAINT)
  })

  test('overrides only the supplied pointer kinds, keeping defaults elsewhere', () => {
    const resolved = resolveActivationConstraint({ mouse: { distance: 12 } })
    expect(resolved.mouse).toEqual({ distance: 12 })
    expect(resolved.pen).toEqual(DEFAULT_ACTIVATION_CONSTRAINT.pen)
    expect(resolved.touch).toEqual(DEFAULT_ACTIVATION_CONSTRAINT.touch)
  })
})

describe('pointerKindOf', () => {
  test('passes through touch and pen', () => {
    expect(pointerKindOf('touch')).toBe('touch')
    expect(pointerKindOf('pen')).toBe('pen')
  })

  test('maps mouse and anything unrecognised to mouse', () => {
    expect(pointerKindOf('mouse')).toBe('mouse')
    expect(pointerKindOf('')).toBe('mouse')
    expect(pointerKindOf('stylus')).toBe('mouse')
  })
})

// The Activation guard's default origin veto (ADR-0016), a pure predicate over
// a PointerEvent — verified without an engine. `true` lets the press through.
describe('defaultShouldStart', () => {
  const press = (target: EventTarget | null, button = 0) =>
    ({ button, target }) as unknown as PointerEvent

  test('allows a primary-button press on a non-interactive origin', () => {
    expect(defaultShouldStart(press(document.createElement('div')))).toBe(true)
  })

  test('vetoes a non-primary (right / middle) button', () => {
    expect(defaultShouldStart(press(document.createElement('div'), 2))).toBe(
      false,
    )
  })

  test('treats a missing button as the primary one (synthetic events)', () => {
    expect(
      defaultShouldStart({
        target: document.createElement('div'),
      } as unknown as PointerEvent),
    ).toBe(true)
  })

  test.each([
    'input',
    'textarea',
    'select',
  ])('vetoes a press originating on <%s>', (tag) => {
    expect(defaultShouldStart(press(document.createElement(tag)))).toBe(false)
  })

  test('vetoes a press on a child of contenteditable', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const span = document.createElement('span')
    editable.append(span)
    expect(defaultShouldStart(press(span))).toBe(false)
  })

  test('does NOT veto a <button> — a drag handle is often a button', () => {
    expect(defaultShouldStart(press(document.createElement('button')))).toBe(
      true,
    )
  })
})
