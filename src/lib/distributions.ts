/** Generate a softmax-like distribution over `n` tokens with given temperature */
export function softmaxDistribution(logits: number[], temperature: number): number[] {
  const t = Math.max(temperature, 0.01)
  const scaled = logits.map(l => l / t)
  const maxVal = Math.max(...scaled)
  const exps = scaled.map(s => Math.exp(s - maxVal))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

/** Generate a zipf-like distribution over n tokens */
export function zipfDistribution(n: number, s: number = 1.0): number[] {
  const raw = Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, s))
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map(r => r / sum)
}

/** Apply Saguaro downweighting: multiply cache token probs by C, renormalize */
export function saguaroDownweight(
  probs: number[],
  cacheTokenIndices: Set<number>,
  C: number
): number[] {
  const weighted = probs.map((p, i) => cacheTokenIndices.has(i) ? p * C : p)
  const sum = weighted.reduce((a, b) => a + b, 0)
  return weighted.map(w => w / sum)
}

/** Positive gap between target and draft before residual normalization. */
export function residualMass(target: number[], draft: number[]): number[] {
  return target.map((t, i) => Math.max(t - draft[i], 0))
}

/** Compute residual distribution r(t) proportional to max(p_target - p_draft, 0) */
export function residualDistribution(target: number[], draft: number[]): number[] {
  const raw = residualMass(target, draft)
  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum === 0) return target.map(() => 1 / target.length)
  return raw.map(r => r / sum)
}

/** Compute acceptance rate alpha = sum(min(p_target, p_draft)) */
export function acceptanceRate(target: number[], draft: number[]): number {
  return target.reduce((acc, t, i) => acc + Math.min(t, draft[i]), 0)
}

/** Compute cache hit probability.
    The bonus token must land on a cache token AND that specific token's
    continuation must be one of the pre-cached speculations.
    We use the raw residual mass here, so the estimate changes both when
    the residual shifts toward cache tokens and when total rejection mass grows. */
export function cacheHitRate(
  residualMass: number[],
  cacheTokenIndices: Set<number>,
  fanoutPerToken: number = 3,
  effectiveBranching: number = 8,
): number {
  // P(hit) = sum over cache tokens of: P(reject and bonus = t) * P(cached continuation | t)
  // P(cached continuation | t) = min(fanoutPerToken / effectiveBranching, 1)
  const coverage = Math.min(fanoutPerToken / effectiveBranching, 1)
  const pBonusIsCache = residualMass.reduce(
    (acc, r, i) => cacheTokenIndices.has(i) ? acc + r : acc, 0
  )
  return pBonusIsCache * coverage
}

/** Theorem 12 fan-out allocation across the K+1 accepted-count outcomes. */
export function geometricFanout(
  K: number,
  budget: number,
  alpha: number,
  rho: number = 1,
): number[] {
  // Theorem 12: fan-out spans the K+1 accepted-count outcomes and
  // follows a capped geometric series under a power-law hit model.
  const tail = Math.max(1 - alpha, 1e-6)
  const weights = Array.from({ length: K + 1 }, (_, k) => (
    k === K
      ? Math.pow(alpha, K / (1 + rho)) * Math.pow(tail, -1 / (1 + rho))
      : Math.pow(alpha, k / (1 + rho))
  ))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(w => (w / totalWeight) * budget)
  // Round to integers, ensure sum = budget
  const floored = raw.map(r => Math.floor(r))
  const remainder = budget - floored.reduce((a, b) => a + b, 0)
  const fracs = raw.map((r, i) => ({ frac: r - floored[i], i }))
  fracs.sort((a, b) => b.frac - a.frac)
  for (let j = 0; j < remainder; j++) {
    floored[fracs[j].i]++
  }
  return floored
}

/** Uniform fan-out allocation */
export function uniformFanout(K: number, budget: number): number[] {
  const positions = K + 1
  const base = Math.floor(budget / positions)
  const remainder = budget % positions
  return Array.from({ length: positions }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** Power-law cache miss rate: 1 - p_hit(F) ~ F^(-r) */
export function powerLawMissRate(F: number, r: number, baseline: number = 1): number {
  return baseline * Math.pow(F, -r)
}
