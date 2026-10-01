import type { FragranceNote } from '../types'

export const scentDimensions = ['fresh', 'sweet', 'floral', 'green', 'warm', 'woody', 'clean', 'creamy', 'aquatic'] as const
export type ScentDimension = typeof scentDimensions[number]

export interface RankedDimension {
  dimension: ScentDimension
  label: string
  score: number
  dots: 1 | 2 | 3 | 4 | 5
}

const weights = { top: 0.25, middle: 0.35, base: 0.4 } as const

export function calculateScentProfile(top: FragranceNote, middle: FragranceNote, base: FragranceNote): RankedDimension[] {
  return scentDimensions
    .map(dimension => {
      const score = top.profile[dimension] * weights.top + middle.profile[dimension] * weights.middle + base.profile[dimension] * weights.base
      return { dimension, label: capitalize(dimension), score, dots: scoreToDots(score) }
    })
    .sort((a, b) => b.score - a.score || scentDimensions.indexOf(a.dimension) - scentDimensions.indexOf(b.dimension))
    .slice(0, 5)
}

export function scoreToDots(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score <= 2) return 1
  if (score <= 4) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
