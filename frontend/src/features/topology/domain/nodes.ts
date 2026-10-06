/** Dimensões e grade compartilhadas por desenho, seleção e edição. */
import type { MapNode, MapPoint } from '../../../types/topology'
export const GRID = 24,
  SNAP_STEP = GRID / 2,
  NODE_WIDTH = 216,
  NODE_HEIGHT = 96,
  CORNER_RADIUS = 10
export const uniqueId = () =>
  `map-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('')}`
export const clampCoordinate = (value: number) => Math.max(-200000, Math.min(200000, value))
export const snap = (value: number) => clampCoordinate(Math.round(value / SNAP_STEP) * SNAP_STEP)
export const snapBend = (value: number) =>
  clampCoordinate(Math.round(value / (GRID / 2)) * (GRID / 2))
export const snapPoint = (point: MapPoint): MapPoint => ({
  x: snapBend(point.x),
  y: snapBend(point.y),
})
export function nodeSize(node: MapNode) {
  if (node.kind === 'junction') return { width: 12, height: 12 }
  const defaultSize =
    node.shape === 'circle' || node.shape === 'diamond'
      ? { width: 144, height: 144 }
      : node.shape === 'cloud'
        ? { width: 216, height: 144 }
        : node.shape === 'ellipse'
          ? { width: 216, height: 120 }
          : node.shape === 'pill'
            ? { width: 216, height: 72 }
            : { width: NODE_WIDTH, height: NODE_HEIGHT }
  const width = node.width ?? defaultSize.width
  const extra = node.texts?.filter((t) => t.text) ?? []
  const multiline = [node.label, node.subtitle, node.caption].some((t) => t?.includes('\n'))
  const columns = Math.max(8, Math.floor((width - (node.shape === 'cloud' ? 60 : 36)) / 8))
  const lines = (text: string) =>
    text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0)
  const contentHeight =
    40 +
    lines(node.label) * 20 +
    lines(node.subtitle ?? 'Tópico de organização') * 17 +
    lines(node.caption ?? 'Tópico') * 16 +
    extra.reduce(
      (height, text) => height + lines(text.text) * (text.kind === 'title' ? 20 : 18) + 8,
      0,
    )
  const automaticHeight =
    extra.length || multiline
      ? Math.min(576, Math.max(defaultSize.height, Math.ceil(contentHeight / GRID) * GRID))
      : defaultSize.height
  return { width, height: node.height ?? automaticHeight }
}
