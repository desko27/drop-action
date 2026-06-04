import {
  createDropAction,
  type Modifier,
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  snapToGrid,
} from 'drop-action'
import { useMemo, useState } from 'react'

type CardData = { label: string }

type Axis = 'free' | 'vertical' | 'horizontal'

const AXIS_MODIFIER: Record<Axis, Modifier | null> = {
  free: null,
  vertical: restrictToVerticalAxis,
  horizontal: restrictToHorizontalAxis,
}

export function App() {
  const [dropped, setDropped] = useState(false)
  const [axis, setAxis] = useState<Axis>('free')
  const [snap, setSnap] = useState(false)

  // Modifiers are configured per Drop Action at creation, so recreate the
  // Drop Action whenever the selected modifiers change. The pipeline runs
  // left-to-right: keep the Overlay on-screen, then optionally pin an axis,
  // then optionally snap to a grid.
  const DA = useMemo(() => {
    const modifiers: Modifier[] = [restrictToWindowEdges]
    const axisModifier = AXIS_MODIFIER[axis]
    if (axisModifier) modifiers.push(axisModifier)
    if (snap) modifiers.push(snapToGrid(40))
    return createDropAction<CardData>('demo', { modifiers })
  }, [axis, snap])

  return (
    <main className="page">
      <h1>drop-action</h1>
      <p className="lead">Drag the card into the slot.</p>

      <div className="controls">
        <label>
          Axis{' '}
          <select
            value={axis}
            onChange={(e) => setAxis(e.target.value as Axis)}
          >
            <option value="free">Free</option>
            <option value="vertical">Vertical only</option>
            <option value="horizontal">Horizontal only</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => setSnap(e.target.checked)}
          />{' '}
          Snap to 40px grid
        </label>
      </div>

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
