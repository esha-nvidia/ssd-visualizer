export interface Round {
  id: number
  draftTokens: string[]
  accepted: number
  bonusToken: string
  cacheHit: boolean
  verifyStart: number
  verifyEnd: number
  draftStart: number
  draftEnd: number
  fallbackStart?: number
  fallbackEnd?: number
}

type RNG = () => number

export function expectedAcceptedTokens(K: number, alpha: number): number {
  let total = 0
  for (let i = 1; i <= K; i++) total += alpha ** i
  return total
}

export function acceptedCountFromQuantile(K: number, alpha: number, quantile: number): number {
  const q = Math.min(Math.max(quantile, 0), 1 - Number.EPSILON)
  let cumulative = 0

  for (let accepted = 0; accepted < K; accepted++) {
    cumulative += alpha ** accepted * (1 - alpha)
    if (q < cumulative) return accepted
  }

  return K
}

/** Simulate SSD rounds for the timeline visualization */
export function simulateSSD(params: {
  rounds: number
  K: number // speculation length
  alpha: number // acceptance rate
  pHit: number // cache hit rate
  draftLatency: number // relative draft time (0-1, fraction of verify time)
  verifyLatency: number // verify time in abstract units
  fallbackLatency?: number // relative fallback draft time; defaults to draftLatency
  acceptedCounts?: number[]
  hitPlan?: boolean[]
  acceptanceRng?: RNG
  hitRng?: RNG
  rng?: RNG
}): Round[] {
  const {
    rounds,
    K,
    alpha,
    pHit,
    draftLatency,
    verifyLatency,
    fallbackLatency = draftLatency,
    acceptedCounts,
    hitPlan,
    acceptanceRng = params.rng ?? Math.random,
    hitRng = params.rng ?? Math.random,
  } = params
  const results: Round[] = []
  let time = 0

  for (let i = 0; i < rounds; i++) {
    const accepted = acceptedCounts?.[i] ?? sampleAccepted(K, alpha, acceptanceRng)
    const cacheHit = hitPlan?.[i] ?? (hitRng() < pHit)
    const draftTime = draftLatency * verifyLatency
    const fallbackTime = fallbackLatency * verifyLatency
    const cacheDelay = cacheHit ? 0 : fallbackTime

    const verifyStart = time
    const verifyEnd = verifyStart + verifyLatency
    // Speculator runs in parallel with verifier
    const draftStart = verifyStart
    const draftEnd = draftStart + draftTime
    const fallbackStart = cacheHit ? undefined : verifyEnd
    const fallbackEnd = cacheHit ? undefined : verifyEnd + fallbackTime

    const tokens = Array.from({ length: K }, (_, j) => `t${i * K + j}`)
    const bonusToken = `b${i}`

    results.push({
      id: i,
      draftTokens: tokens,
      accepted,
      bonusToken,
      cacheHit,
      verifyStart,
      verifyEnd,
      draftStart,
      draftEnd,
      fallbackStart,
      fallbackEnd,
    })

    // Next round starts after verify completes + cache delay
    time = verifyEnd + cacheDelay
  }

  return results
}

/** Simulate standard SD rounds (sequential) */
export function simulateSD(params: {
  rounds: number
  K: number
  alpha: number
  draftLatency: number
  verifyLatency: number
  acceptedCounts?: number[]
  acceptanceRng?: RNG
  rng?: RNG
}): Round[] {
  const {
    rounds,
    K,
    alpha,
    draftLatency,
    verifyLatency,
    acceptedCounts,
    acceptanceRng = params.rng ?? Math.random,
  } = params
  const results: Round[] = []
  let time = 0

  for (let i = 0; i < rounds; i++) {
    const accepted = acceptedCounts?.[i] ?? sampleAccepted(K, alpha, acceptanceRng)
    const draftTime = draftLatency * verifyLatency

    const draftStart = time
    const draftEnd = draftStart + draftTime
    const verifyStart = draftEnd
    const verifyEnd = verifyStart + verifyLatency

    const tokens = Array.from({ length: K }, (_, j) => `t${i * K + j}`)

    results.push({
      id: i,
      draftTokens: tokens,
      accepted,
      bonusToken: `b${i}`,
      cacheHit: false,
      verifyStart,
      verifyEnd,
      draftStart,
      draftEnd,
    })

    time = verifyEnd
  }

  return results
}

function sampleAccepted(K: number, alpha: number, rng: RNG): number {
  // Each token accepted with probability alpha, return count of consecutive accepts
  for (let i = 0; i < K; i++) {
    if (rng() > alpha) return i
  }
  return K
}

/** Calculate tokens generated per unit time */
export function throughput(rounds: Round[], initialDelay: number = 0): number {
  if (rounds.length === 0) return 0
  const totalTime = initialDelay + Math.max(
    ...rounds.map(r => Math.max(r.verifyEnd, r.draftEnd, r.fallbackEnd ?? 0))
  )
  const totalTokens = rounds.reduce((acc, r) => acc + r.accepted + 1, 0)
  return totalTokens / totalTime
}
