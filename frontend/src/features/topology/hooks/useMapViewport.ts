import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Graph, Viewport } from '../../../types/topology'
import { fitNodes } from '../domain'
import { wheelNavigation, isPanWheel } from '../../../utils/map-navigation'
interface Props {
  graph: Graph | null
  tv: boolean
  visibleIds: string[]
  canvas: RefObject<HTMLDivElement | null>
  gesture: RefObject<unknown>
}
/** A câmera é local à tela: snapshots ICMP nunca devem reposicioná-la durante edição. */
export function useMapViewport({ graph, tv, visibleIds, canvas, gesture }: Props) {
  const [view, setView] = useState<Viewport>({ x: 50, y: 50, zoom: 0.8 })
  const [wheelPanning, setWheelPanning] = useState(false)
  const didFit = useRef(false)
  const lastFitKey = useRef('')
  const visibleSet = new Set(visibleIds)
  const nodes = graph?.nodes.filter((n) => !n.hostId || visibleSet.has(n.hostId)) ?? []
  const visibleKey = [...visibleIds].sort().join('|')
  const fit = () => {
    if (canvas.current)
      setView(fitNodes(nodes, canvas.current.clientWidth, canvas.current.clientHeight))
  }
  useEffect(() => {
    if (!tv) return
    const update = () => {
      if (canvas.current && graph)
        setView(
          fitNodes(
            graph.nodes.filter((n) => !n.hostId || visibleSet.has(n.hostId)),
            canvas.current.clientWidth,
            canvas.current.clientHeight,
          ),
        )
    }
    const frame = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    document.addEventListener('fullscreenchange', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      document.removeEventListener('fullscreenchange', update)
    }
    // Refit on entering TV mode; regular map editing should retain the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tv])
  // Fit once on opening; later monitoring snapshots never disturb a user's camera.
  useEffect(() => {
    if (!graph || !canvas.current) return
    if (!didFit.current || (tv && lastFitKey.current !== visibleKey)) {
      const displayed = graph.nodes.filter(
        (n) => !n.hostId || visibleKey.split('|').includes(n.hostId),
      )
      setView(fitNodes(displayed, canvas.current.clientWidth, canvas.current.clientHeight))
      didFit.current = true
      lastFitKey.current = visibleKey
    }
  }, [graph, tv, visibleKey, canvas])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let idle: ReturnType<typeof setTimeout> | undefined
    const wheel = (event: WheelEvent) => {
      const target = event.target as Element
      if (target.closest('aside,button,input,select,textarea')) return
      const text = target.closest('[data-map-text]')
      if (text && text.scrollHeight > text.clientHeight) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (gesture.current) return
      clearTimeout(idle)
      setWheelPanning(isPanWheel(event))
      idle = setTimeout(() => setWheelPanning(false), 160)
      setView(
        (v) =>
          wheelNavigation(
            v,
            event,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            element.clientHeight,
          ).view,
      )
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      clearTimeout(idle)
      element.removeEventListener('wheel', wheel)
    }
  }, [canvas, gesture])

  return {
    view,
    setView,
    wheelPanning,
    setWheelPanning,
    fit,
    resetFit: () => {
      didFit.current = false
    },
  }
}
