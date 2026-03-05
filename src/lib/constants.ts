export const COLORS = {
  verify: '#3b82f6',
  verifyLight: '#93c5fd',
  draft: '#f59e0b',
  draftLight: '#fcd34d',
  accept: '#22c55e',
  reject: '#ef4444',
  cacheHit: '#8b5cf6',
  cacheMiss: '#6b7280',
  idle: '#374151',
  surface: '#1e1e2e',
  surface2: '#2a2a3e',
  surface3: '#363652',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  border: '#475569',
} as const

export const ANIMATION = {
  tokenDuration: 0.3,
  arrowDuration: 0.5,
  springConfig: { type: 'spring' as const, stiffness: 300, damping: 30 },
} as const
