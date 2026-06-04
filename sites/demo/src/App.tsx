import { createDropAction } from 'drop-action'
import { createSnapBack } from 'drop-action/snap-back'
import { useState } from 'react'

type CardData = { label: string }

const DA = createDropAction<CardData>('demo')

// Snap-back is the opt-in subpath module: a Reject eases the Overlay back to
// the Item's origin rect; an Accept does not. <SnapBack> stands in for the
// core <Active>, rendering the Overlay and keeping a ghost through the bounce.
const { SnapBack } = createSnapBack(DA.useActive)

// The accepting slot reads useOver to highlight itself while the Active Item
// is the Over Zone — at most one Zone is Over at a time.
function Slot({ dropped }: { dropped: boolean }) {
  const over = DA.useOver('slot')
  const className = ['zone', dropped && 'zone--filled', over && 'zone--over']
    .filter(Boolean)
    .join(' ')

  return (
    <DA.Zone
      id="slot"
      onDrop={(_item, respond) => respond('accepted')}
      className={className}
    >
      {dropped ? '✅ Card dropped here' : 'Drop here'}
    </DA.Zone>
  )
}

// The rejecting slot awaits a beat, then returns without responding — a
// Reject. Snap-back eases the Overlay back to where the drag began.
function RejectSlot() {
  const over = DA.useOver('no-entry')
  const className = ['zone', over && 'zone--reject'].filter(Boolean).join(' ')

  return (
    <DA.Zone
      id="no-entry"
      onDrop={() => new Promise((r) => setTimeout(r, 150))}
      className={className}
    >
      🚫 Rejects (snaps back)
    </DA.Zone>
  )
}

export function App() {
  const [dropped, setDropped] = useState(false)

  return (
    <main className="page">
      <h1>drop-action</h1>
      <p className="lead">
        Drag the card into a slot. The left slot accepts; the right slot rejects
        and snaps the card back.
      </p>

      <div className="board">
        {dropped ? (
          <div className="card card--placeholder">Dropped ✓</div>
        ) : (
          // The source Item dims via data-dragging (isDragging) while the
          // Overlay travels.
          <DA.Item
            id="card"
            data={{ label: '📦 Card' }}
            onAccept={() => setDropped(true)}
            className="card"
          >
            📦 Card
          </DA.Item>
        )}

        <Slot dropped={dropped} />
        <RejectSlot />
      </div>

      <SnapBack>
        {({ data }) => <div className="card card--overlay">{data.label}</div>}
      </SnapBack>
    </main>
  )
}
