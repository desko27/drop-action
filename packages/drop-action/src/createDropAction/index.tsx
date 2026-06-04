import {
  type CSSProperties,
  type ElementType,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { rectIntersection } from './collision'
import { composeRefs } from './composeRefs'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { restrictToWindowEdges } from './modifiers'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  DragHandleProps,
  ItemHandleProps,
  UseItemOptions,
  ZoneDropHandler,
} from './types.public'

const HANDLE_STYLE: CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
}

type ItemProps<Data> = {
  id: string
  data: Data
  onAccept?: (item: DraggedItem<Data>) => void
  customDragHandle?: boolean
  as?: ElementType
  asChild?: boolean
  className?: string
  children?: ReactNode
}

type ZoneProps<Data> = {
  id: string
  onDrop: ZoneDropHandler<Data>
  as?: ElementType
  asChild?: boolean
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

// Merge the Drop Action's props onto a single existing child element via
// cloneElement, adding NO wrapper node (ADR-0008). The child's own ref,
// className and onPointerDown are preserved by composing with ours.
function mergeAsChild(
  children: ReactNode,
  ref: Ref<HTMLElement>,
  props: { className?: string } & Record<string, unknown>,
): ReactElement {
  const child = Children.only(children) as ReactElement<{
    ref?: Ref<HTMLElement>
    className?: string
    onPointerDown?: (event: ReactPointerEvent) => void
  }>
  if (!isValidElement(child)) {
    throw new Error('asChild expects a single React element child')
  }

  const childOnPointerDown = child.props.onPointerDown
  const ourOnPointerDown = props.onPointerDown as
    | ((event: ReactPointerEvent) => void)
    | undefined

  return cloneElement(child, {
    ...props,
    ref: composeRefs(child.props.ref, ref),
    className: [child.props.className, props.className]
      .filter(Boolean)
      .join(' '),
    // Both the child's existing handler and ours (if any) must fire.
    ...(ourOnPointerDown
      ? {
          onPointerDown: (event: ReactPointerEvent) => {
            childOnPointerDown?.(event)
            ourOnPointerDown(event)
          },
        }
      : {}),
  })
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
  // Default to keeping the Overlay inside the viewport (ADR-0007). The
  // pipeline drives both the Overlay transform and collision, so the
  // default never lets Over register where the Overlay cannot reach.
  const modifiers = options.modifiers ?? [restrictToWindowEdges]
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
    modifiers,
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

  // The Item is always what is measured and travels. `dragHandleProps` is
  // what the consumer spreads onto their element: by default it is a full
  // drag handle (trigger + button a11y); with `customDragHandle` the Item
  // is a container (`role: 'group'`) and the trigger moves to a
  // `useDragHandle(id)` element, which may live outside the Item subtree
  // (ADR-0009).
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

    // Accessibility defaults baked into the handle (ADR-0011). With a
    // custom handle the Item itself never triggers, so it carries no
    // onPointerDown and is a plain container.
    const dragHandleProps: ItemHandleProps = itemOptions.customDragHandle
      ? { role: 'group' }
      : {
          onPointerDown,
          role: 'button',
          tabIndex: 0,
          'aria-roledescription': 'draggable',
          style: HANDLE_STYLE,
        }

    return { ref, dragHandleProps, isDragging }
  }

  // A handle is just an element whose onPointerDown calls startDrag(id);
  // no registry, it references the engine + id directly (ADR-0009). Place
  // it anywhere — including outside the Item subtree — since startDrag
  // measures the Item by its registered node, not the handle.
  function useDragHandle(id: string): DragHandleProps {
    const onPointerDown = useCallback(
      (event: ReactPointerEvent) => engine.startDrag(id, event.nativeEvent),
      [id],
    )
    return {
      onPointerDown,
      role: 'button',
      tabIndex: 0,
      'aria-roledescription': 'draggable',
      style: HANDLE_STYLE,
    }
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

  // ----- Components (thin sugar over the hooks — ADR-0008) --------------
  // `as` picks the wrapper element/component (default 'div'); `asChild`
  // merges ref + props onto a single existing child instead, adding no
  // node.

  function Item({
    id,
    data,
    onAccept,
    customDragHandle,
    as: As = 'div',
    asChild,
    className,
    children,
  }: ItemProps<Data>) {
    const { ref, dragHandleProps, isDragging } = useItem(id, data, {
      onAccept,
      customDragHandle,
    })

    if (asChild) {
      return mergeAsChild(children, ref, {
        ...dragHandleProps,
        className,
        'data-dragging': isDragging || undefined,
      })
    }

    return (
      <As
        ref={ref}
        className={className}
        data-dragging={isDragging || undefined}
        {...dragHandleProps}
      >
        {children}
      </As>
    )
  }

  function Zone({
    id,
    onDrop,
    as: As = 'div',
    asChild,
    className,
    children,
  }: ZoneProps<Data>) {
    const { ref } = useZone(id, { onDrop })

    if (asChild) {
      return mergeAsChild(children, ref, { className })
    }

    return (
      <As ref={ref} className={className}>
        {children}
      </As>
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

  return {
    Item,
    Zone,
    Active,
    useItem,
    useZone,
    useDragHandle,
    useActive,
    useOver,
  }
}
