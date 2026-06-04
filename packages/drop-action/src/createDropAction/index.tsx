import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { rectIntersection } from './collision'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  ZoneDropHandler,
} from './types.public'

const HANDLE_STYLE: CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
}

type UseItemOptions<Data> = {
  onAccept?: (item: DraggedItem<Data>) => void
}

type ItemProps<Data> = {
  id: string
  data: Data
  onAccept?: (item: DraggedItem<Data>) => void
  className?: string
  children?: ReactNode
}

type ZoneProps<Data> = {
  id: string
  onDrop: ZoneDropHandler<Data>
  className?: string
  children?: ReactNode
}

type ActiveProps<Data> = {
  children: (item: DraggedItem<Data>) => ReactNode
  className?: string
  // Overrides the portal target (Shadow DOM, a dialog). Defaults to
  // `document.body` (ADR-0010).
  container?: Element | DocumentFragment
}

// The factory: returns a namespace of peer components + hooks for one
// self-contained Drop Action (ADR-0005). `id` names the channel; the
// store is closure-scoped, so only this Drop Action's Items and Zones see
// each other.
export function createDropAction<Data = unknown>(
  _id: string,
  options: CreateDropActionOptions = {},
) {
  const measure = options.measure ?? defaultMeasure
  // Default collision detection is `rectIntersection` (ADR-0006); a custom
  // detector or another built-in can be supplied per Drop Action.
  const collisionDetection = options.collisionDetection ?? rectIntersection
  const store = createStore<Data>()

  // Item ids and Zone ids occupy separate id spaces — two maps — so an
  // Item and a Zone may safely share an id (ADR-0005). These registries
  // are mutable and non-reactive: registering a node triggers no render.
  const items = new Map<string, ItemRegistration<Data>>()
  const zones = new Map<string, ZoneRegistration<Data>>()

  const engine = createEngine<Data>({
    items,
    zones,
    measure,
    collisionDetection,
    setState: store.setState,
    reset: store.reset,
  })

  const useDropActionState = () =>
    useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    )

  // ----- Hooks (the primitive; components below are sugar — ADR-0008) ----

  function useActive(): ActiveSnapshot<Data> | null {
    return useDropActionState().active
  }

  // The Active { id, data } while `zoneId` is the Over Zone, else null. At
  // most one Zone is Over at a time (CONTEXT.md — Over), so this is truthy
  // for exactly one Zone during a drag.
  function useOver(zoneId: string): DraggedItem<Data> | null {
    const { active, over } = useDropActionState()
    if (!active || over !== zoneId) return null
    return { id: active.id, data: active.data }
  }

  function useItem(
    id: string,
    data: Data,
    itemOptions: UseItemOptions<Data> = {},
  ) {
    // Keep the registry pointed at the latest data/handler without
    // re-registering the node on every render.
    const dataRef = useRef(data)
    dataRef.current = data
    const onAcceptRef = useRef(itemOptions.onAccept)
    onAcceptRef.current = itemOptions.onAccept

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) items.set(id, { node, dataRef, onAcceptRef })
        else items.delete(id)
      },
      [id],
    )

    const onPointerDown = useCallback(
      (event: ReactPointerEvent) => engine.startDrag(id, event.nativeEvent),
      [id],
    )

    const isDragging = useDropActionState().active?.id === id

    // Accessibility defaults baked into the handle (ADR-0011).
    const dragHandleProps = {
      onPointerDown,
      role: 'button',
      tabIndex: 0,
      'aria-roledescription': 'draggable',
      style: HANDLE_STYLE,
    } as const

    return { ref, dragHandleProps, isDragging }
  }

  function useZone(id: string, zoneOptions: { onDrop: ZoneDropHandler<Data> }) {
    const onDropRef = useRef(zoneOptions.onDrop)
    onDropRef.current = zoneOptions.onDrop

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) zones.set(id, { node, onDropRef })
        else zones.delete(id)
      },
      [id],
    )

    return { ref }
  }

  // ----- Components (thin sugar that render a wrapper element) ----------

  function Item({ id, data, onAccept, className, children }: ItemProps<Data>) {
    const { ref, dragHandleProps, isDragging } = useItem(id, data, { onAccept })
    return (
      <div
        ref={ref}
        className={className}
        data-dragging={isDragging || undefined}
        {...dragHandleProps}
      >
        {children}
      </div>
    )
  }

  function Zone({ id, onDrop, className, children }: ZoneProps<Data>) {
    const { ref } = useZone(id, { onDrop })
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  }

  // The Overlay: portalled to document.body, position: fixed, moved with a
  // translate3d that starts over the Item's origin rect and follows the
  // pointer (ADR-0010). On the server `useActive` is inert (null), so this
  // returns before any document access — SSR-safe.
  function Active({ children, className, container }: ActiveProps<Data>) {
    const active = useActive()
    if (!active) return null

    const x = active.originRect.left + active.transform.x
    const y = active.originRect.top + active.transform.y

    return createPortal(
      <div
        className={className}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          transform: `translate3d(${x}px, ${y}px, 0)`,
          pointerEvents: 'none',
        }}
      >
        {children({ id: active.id, data: active.data })}
      </div>,
      container ?? document.body,
    )
  }

  return { Item, Zone, Active, useItem, useZone, useActive, useOver }
}
