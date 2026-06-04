import { createDropAction } from 'drop-action'
import { useState } from 'react'

type CardData = { label: string }

const DA = createDropAction<CardData>('demo')

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
          <DA.Item
            id="card"
            data={{ label: '📦 Card' }}
            onAccept={() => setDropped(true)}
            className="card"
          >
            📦 Card
          </DA.Item>
        )}

        <DA.Zone
          id="slot"
          onDrop={(_item, respond) => respond('accepted')}
          className={dropped ? 'zone zone--filled' : 'zone'}
        >
          {dropped ? '✅ Card dropped here' : 'Drop here'}
        </DA.Zone>
      </div>

      <DA.Active>
        {({ data }) => <div className="card card--overlay">{data.label}</div>}
      </DA.Active>
    </main>
  )
}
