import type { Viewport } from '../types/topology'
import { zoomAt } from './topology'
export interface WheelInput {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}
export const isPanWheel = (event: WheelInput) =>
  !event.ctrlKey && !event.metaKey && event.deltaMode === 0
/** Browsers expose touchpad scrolling as wheel events, not a finger count. */
export function wheelNavigation(
  view: Viewport,
  event: WheelInput,
  point: { x: number; y: number },
  pageHeight: number,
): { view: Viewport; action: 'pan' | 'zoom' } {
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1
  const dx = event.deltaX * scale,
    dy = event.deltaY * scale
  // Pinch gestures are usually delivered with ctrlKey; Ctrl+wheel also zooms.
  // Pixel scrolling pans, covering precision touchpads and smooth scroll devices.
  const pan = isPanWheel(event)
  if (pan)
    return {
      action: 'pan',
      view: {
        ...view,
        x: view.x - (event.shiftKey && !dx ? dy : dx),
        y: view.y - (event.shiftKey && !dx ? 0 : dy),
      },
    }
  return { action: 'zoom', view: zoomAt(view, view.zoom * Math.exp(-dy * 0.0015), point) }
}
