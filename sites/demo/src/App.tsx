import {
  type CollisionDetection,
  closestCenter,
  createDropAction,
  pointerWithin,
  rectIntersection,
} from 'drop-action'
import { useMemo, useState } from 'react'

type CardData = { label: string }

const DETECTORS: Record<string, CollisionDetection> = {
  rectIntersection,
  pointerWithin,
  closestCenter,
}

type DetectorName = keyof typeof DETECTORS

const ZONES = ['To do', 'Doing', 'Done']

export function App() {
  const [detector, setDetector] = useState<DetectorName>('rectIntersection')
  const [landedIn, setLandedIn] = useState<string | null>(null)

  // collisionDetection is fixed per Drop Action at creation, so re-create the
  // Drop Action when the chosen detector changes to make the swap take effect.
  const DA = useMemo(
    () =>
      createDropAction<CardData>('demo', {
        collisionDetection: DETECTORS[detector],
      }),
    [detector],
  )

  return (
    <main className="page">
      <h1>drop-action</h1>
      <p className="lead">
        Drag the card onto a column. Swap the collision detector to change how
        the winning column is chosen.
      </p>

      <label className="control">
        Collision detection:{' '}
        <select
          value={detector}
          onChange={(e) => {
            setDetector(e.target.value as DetectorName)
            setLandedIn(null)
          }}
        >
          {Object.keys(DETECTORS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <div className="board">
        <DA.Item id="card" data={{ label: '📦 Card' }} className="card">
          📦 Card
        </DA.Item>

        <div className="columns">
          {ZONES.map((zone) => (
            <DA.Zone
              key={zone}
              id={zone}
              onDrop={(_item, respond) => {
                setLandedIn(zone)
                respond('accepted')
              }}
              className={landedIn === zone ? 'zone zone--filled' : 'zone'}
            >
              {zone}
            </DA.Zone>
          ))}
        </div>
      </div>

      {landedIn && <p className="lead">Last drop landed in: {landedIn}</p>}

      <DA.Active>
        {({ data }) => <div className="card card--overlay">{data.label}</div>}
      </DA.Active>
    </main>
  )
}
