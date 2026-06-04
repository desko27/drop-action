import { createDropAction } from 'drop-action'
import { useState } from 'react'

type CardData = { label: string }

const DA = createDropAction<CardData>('demo')

// A second Drop Action for the scrollable touch list. The default
// activation constraint is already pointer-type-aware (mouse/pen drag on a
// small move; touch waits out a hold), so a quick swipe scrolls the list
// while a press-and-hold drags an item. No extra config needed.
type Task = { id: string; label: string }
const LIST = createDropAction<Task>('list')

const TASKS: Task[] = Array.from({ length: 12 }, (_, i) => ({
  id: `task-${i + 1}`,
  label: `Task ${i + 1}`,
}))

export function App() {
  const [dropped, setDropped] = useState(false)
  const [grabbed, setGrabbed] = useState<string | null>(null)

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

      <section className="section">
        <h2>Scrollable touch list</h2>
        <p className="lead">
          On a touch screen a quick swipe scrolls the list; a press-and-hold
          (~250&nbsp;ms) grabs an item and drags it onto the tray. With a mouse,
          a small drag starts immediately. Same primitives, pointer-type-aware
          activation constraint.
        </p>

        <div className="list-layout">
          <div className="list">
            {TASKS.map((task) => (
              <LIST.Item
                key={task.id}
                id={task.id}
                data={task}
                className="list-item"
              >
                <span className="list-item__grip" aria-hidden>
                  ⠿
                </span>
                {task.label}
              </LIST.Item>
            ))}
          </div>

          <LIST.Zone
            id="tray"
            onDrop={(item, respond) => {
              setGrabbed(item.data.label)
              respond('accepted')
            }}
            className="tray"
          >
            {grabbed
              ? `Last dropped: ${grabbed}`
              : 'Hold an item, drop it here'}
          </LIST.Zone>
        </div>
      </section>

      <LIST.Active>
        {({ data }) => (
          <div className="list-item list-item--overlay">{data.label}</div>
        )}
      </LIST.Active>
    </main>
  )
}
