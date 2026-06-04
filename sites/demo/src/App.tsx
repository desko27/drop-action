import { createDropAction } from 'drop-action'
import { useState } from 'react'

type CardData = { label: string }

const DA = createDropAction<CardData>('demo')

// The slot reads useOver to highlight itself while the Active Item is the
// Over Zone — at most one Zone is Over at a time.
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

export function App() {
  const [dropped, setDropped] = useState(false)

  return (
    <main className="page">
      <h1>drop-action</h1>
      <p className="lead">Drag the card into the slot.</p>

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
      </div>

      <DA.Active>
        {({ data }) => <div className="card card--overlay">{data.label}</div>}
      </DA.Active>
    </main>
  )
}
