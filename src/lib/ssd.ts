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
}

type RNG = () => number

/** Simulate SSD rounds for the timeline visualization */
export function simulateSSD(params: {
  rounds: number
  K: number // speculation length
  alpha: number // acceptance rate
  pHit: number // cache hit rate
  draftLatency: number // relative draft time (0-1, fraction of verify time)
  verifyLatency: number // verify time in abstract units
  fallbackLatency?: number // relative fallback draft time; defaults to draftLatency
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
    acceptanceRng = params.rng ?? Math.random,
    hitRng = params.rng ?? Math.random,
  } = params
  const results: Round[] = []
  let time = 0

  for (let i = 0; i < rounds; i++) {
    const accepted = sampleAccepted(K, alpha, acceptanceRng)
    const cacheHit = hitRng() < pHit
    const draftTime = draftLatency * verifyLatency
    const fallbackTime = fallbackLatency * verifyLatency
    const cacheDelay = cacheHit ? 0 : fallbackTime

    const verifyStart = time
    const verifyEnd = verifyStart + verifyLatency
    // Speculator runs in parallel with verifier
    const draftStart = verifyStart
    const draftEnd = draftStart + draftTime

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
  acceptanceRng?: RNG
  rng?: RNG
}): Round[] {
  const {
    rounds,
    K,
    alpha,
    draftLatency,
    verifyLatency,
    acceptanceRng = params.rng ?? Math.random,
  } = params
  const results: Round[] = []
  let time = 0

  for (let i = 0; i < rounds; i++) {
    const accepted = sampleAccepted(K, alpha, acceptanceRng)
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
export function throughput(rounds: Round[]): number {
  if (rounds.length === 0) return 0
  const totalTime = Math.max(...rounds.map(r => Math.max(r.verifyEnd, r.draftEnd)))
  const totalTokens = rounds.reduce((acc, r) => acc + r.accepted + 1, 0)
  return totalTokens / totalTime
}
