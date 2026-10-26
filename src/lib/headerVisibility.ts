export interface HeaderVisibilityState {
  hidden: boolean
  lastScrollY: number
}

export function nextHeaderVisibility(state: HeaderVisibilityState, scrollY: number, threshold = 96, tolerance = 10): HeaderVisibilityState {
  const y = Math.max(0, scrollY)
  if (y <= 0) return { hidden: false, lastScrollY: 0 }
  const delta = y - state.lastScrollY
  if (Math.abs(delta) < tolerance) return state
  if (delta > 0 && y > threshold) return { hidden: true, lastScrollY: y }
  if (delta < 0) return { hidden: false, lastScrollY: y }
  return { ...state, lastScrollY: y }
}
