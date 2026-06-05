import { renderToString } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { createStore } from '../createDropAction/store'
import { createDropAction } from '../main'

// Third test seam: the server snapshot is inert and document-free
// (ADR-0002, ADR-0011). Active reads `null` on the server, so it renders
// nothing and never touches document.body.
describe('SSR — inert server snapshot', () => {
  test('server rendering yields no active drag and no Overlay markup', () => {
    const DA = createDropAction()
    function Tree() {
      return (
        <>
          <DA.Item id="card" data={null}>
            card
          </DA.Item>
          <DA.Zone id="slot" onDrop={() => {}}>
            slot
          </DA.Zone>
          <DA.Active>
            {() => <span data-testid="overlay">overlay</span>}
          </DA.Active>
        </>
      )
    }

    const html = renderToString(<Tree />)
    expect(html).toContain('card')
    expect(html).toContain('slot')
    // The Overlay is inert server-side — its content never renders.
    expect(html).not.toContain('overlay')
  })

  test('getServerSnapshot returns a stable reference across calls', () => {
    // useSyncExternalStore compares snapshots with Object.is and throws if
    // a fresh value comes back each call. The inert snapshot must be one
    // shared reference.
    const store = createStore<void>()
    expect(
      Object.is(store.getServerSnapshot(), store.getServerSnapshot()),
    ).toBe(true)
  })
})
