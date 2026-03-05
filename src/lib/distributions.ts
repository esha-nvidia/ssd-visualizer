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

/** Compute residual distribution r(t) proportional to max(p_target - p_draft, 0) */
export function residualDistribution(target: number[], draft: number[]): number[] {
  const raw = target.map((t, i) => Math.max(t - draft[i], 0))
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
    We model this as: for each cache token, coverage = F_per_token / effective_vocab,
    representing how much of the token's continuation space is cached.
    This gives a more gradual and realistic curve than a binary in/out model. */
export function cacheHitRate(
  residual: number[],
  cacheTokenIndices: Set<number>,
  fanoutPerToken: number = 3,
  effectiveBranching: number = 8,
): number {
  // P(hit) = sum over cache tokens of: P(bonus = t) * P(cached continuation | t)
  // P(cached continuation | t) = min(fanoutPerToken / effectiveBranching, 1)
  const coverage = Math.min(fanoutPerToken / effectiveBranching, 1)
  const pBonusIsCache = residual.reduce(
    (acc, r, i) => cacheTokenIndices.has(i) ? acc + r : acc, 0
  )
  return pBonusIsCache * coverage
}

/** Geometric fan-out allocation: F_k proportional to P(accepted >= k) */
export function geometricFanout(
  K: number,
  budget: number,
  alpha: number
): number[] {
  // P(accepted >= k) = alpha^k for geometric acceptance
  const weights = Array.from({ length: K }, (_, k) => Math.pow(alpha, k))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(w => (w / totalWeight) * budget)
  // Round to integers, ensure sum = budget
  const floored = raw.map(r => Math.floor(r))
  let remainder = budget - floored.reduce((a, b) => a + b, 0)
  const fracs = raw.map((r, i) => ({ frac: r - floored[i], i }))
  fracs.sort((a, b) => b.frac - a.frac)
  for (let j = 0; j < remainder; j++) {
    floored[fracs[j].i]++
  }
  return floored.map(f => Math.max(f, 1))
}

/** Uniform fan-out allocation */
export function uniformFanout(K: number, budget: number): number[] {
  const base = Math.floor(budget / K)
  const remainder = budget % K
  return Array.from({ length: K }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** Power-law cache miss rate: 1 - p_hit(F) ~ F^(-r) */
export function powerLawMissRate(F: number, r: number, baseline: number = 1): number {
  return baseline * Math.pow(F, -r)
}
