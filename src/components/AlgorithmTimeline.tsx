import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { AnimationControls } from './shared/AnimationControls'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

interface TokenState {
  id: string
  label: string
  status: 'pending' | 'sent' | 'accepted' | 'rejected'
}

interface CacheEntry {
  key: string
  tokens: string[]
  status: 'building' | 'ready' | 'hit' | 'miss'
}

type StepType =
  | 'idle'
  | 'spec-send'
  | 'parallel-work'
  | 'verify-result'
  | 'cache-check'
  | 'next-round'

const STEP_LABELS: Record<StepType, string> = {
  'idle': 'Waiting to start',
  'spec-send': 'Speculator sends draft tokens to verifier',
  'parallel-work': 'Verifier checks tokens while speculator builds cache',
  'verify-result': 'Verifier returns accepted count and bonus token',
  'cache-check': 'Check speculation cache for matching entry',
  'next-round': 'Starting next round',
}

const STEP_DESCRIPTIONS: Record<StepType, string> = {
  'idle': 'The SSD loop is about to begin. The speculator will send draft tokens to the verifier.',
  'spec-send': 'The draft model generates K candidate tokens and sends them to the verifier for checking. This is the same as standard SD.',
  'parallel-work': 'KEY INSIGHT: While the verifier checks tokens, the speculator predicts which tokens will be accepted and pre-computes speculations for each possible outcome. This parallelism is what makes SSD faster.',
  'verify-result': 'The verifier returns v = (k, t*): how many tokens were accepted (k) and the bonus token (t*). In standard SD, the speculator would now need to draft new tokens from scratch.',
  'cache-check': 'SSD checks the speculation cache for a pre-computed speculation matching (k, t*). On a HIT, the next round starts immediately with zero idle time. On a MISS, a fallback speculator must generate new tokens.',
  'next-round': 'The round is complete. Accepted tokens are added to the sequence.',
}

export function AlgorithmTimeline() {
  const [alpha, setAlpha] = useState(0.7)
  const [pHit, setPHit] = useState(0.8)
  const [K] = useState(4)
  const [speed, setSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)

  const TOTAL_ROUNDS = 4
  const STEPS_PER_ROUND = 6

  const totalSteps = TOTAL_ROUNDS * STEPS_PER_ROUND
  const globalStep = currentRound * STEPS_PER_ROUND + currentStep
  const stepType: StepType = (['idle', 'spec-send', 'parallel-work', 'verify-result', 'cache-check', 'next-round'] as const)[currentStep]

  const accepted = Math.min(K, Math.floor(alpha * K + (currentRound % 2 === 0 ? 0.5 : -0.3)))
  const cacheHit = (currentRound * 7 + 3) % 10 < pHit * 10

  const tokens: TokenState[] = Array.from({ length: K }, (_, i) => {
    let status: TokenState['status'] = 'pending'
    if (currentStep >= 1) status = 'sent'
    if (currentStep >= 3) status = i < accepted ? 'accepted' : 'rejected'
    return { id: `r${currentRound}-t${i}`, label: `s${i + 1}`, status }
  })

  const cacheEntries: CacheEntry[] = Array.from({ length: Math.min(3, K) }, (_, i) => {
    let status: CacheEntry['status'] = 'building'
    if (currentStep >= 2) status = 'ready'
    if (currentStep >= 4) {
      status = (cacheHit && i === accepted % 3) ? 'hit' : 'miss'
    }
    return {
      key: `k=${i}, t*=...`,
      tokens: [`c${i}a`, `c${i}b`],
      status,
    }
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= STEPS_PER_ROUND - 1) {
        setCurrentRound(r => {
          if (r >= TOTAL_ROUNDS - 1) {
            setIsPlaying(false)
            return r
          }
          return r + 1
        })
        setTotalTokens(t => t + accepted + 1)
        return 0
      }
      return prev + 1
    })
  }, [accepted])

  const stepBack = useCallback(() => {
    setCurrentStep(prev => {
      if (prev <= 0) {
        if (currentRound > 0) {
          setCurrentRound(r => r - 1)
          return STEPS_PER_ROUND - 1
        }
        return 0
      }
      return prev - 1
    })
  }, [currentRound])

  const reset = useCallback(() => {
    setIsPlaying(false)
    setCurrentRound(0)
    setCurrentStep(0)
    setTotalTokens(0)
  }, [])

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(advance, 1500 / speed)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isPlaying, speed, advance])

  const tokenColor = (status: TokenState['status']) => {
    switch (status) {
      case 'pending': return COLORS.idle
      case 'sent': return COLORS.draft
      case 'accepted': return COLORS.accept
      case 'rejected': return COLORS.reject
    }
  }

  const cacheColor = (status: CacheEntry['status']) => {
    switch (status) {
      case 'building': return COLORS.idle
      case 'ready': return COLORS.draft
      case 'hit': return COLORS.cacheHit
      case 'miss': return COLORS.cacheMiss
    }
  }

  return (
    <SectionHeader
      number={1}
      title="The SSD Main Loop"
      subtitle="Verifier and speculator running in parallel with a speculation cache"
      tooltip="Algorithm 1 from the paper. The key insight: while the verifier checks tokens, the speculator pre-computes speculations for predicted verification outcomes."
      referenceFigure="./reference-figures/fig1-sd-vs-ssd-overview.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <div className="w-44">
            <Slider label="Acceptance rate" value={alpha} onChange={v => { setAlpha(v); reset() }} min={0.1} max={1}
              tooltip="Probability each draft token passes verification. Higher = more tokens accepted per round." />
          </div>
          <div className="w-44">
            <Slider label="Cache hit rate" value={pHit} onChange={v => { setPHit(v); reset() }} min={0} max={1}
              tooltip="Probability the speculation cache contains a matching pre-computed speculation." />
          </div>
          <AnimationControls
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onStepForward={advance}
            onStepBack={stepBack}
            onReset={reset}
            speed={speed}
            onSpeedChange={setSpeed}
            currentStep={globalStep}
            totalSteps={totalSteps}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={stepType}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 p-3 rounded-lg bg-surface-3 border border-border"
          >
            <div className="text-sm font-medium text-verify mb-1">
              Round {currentRound + 1} &mdash; {STEP_LABELS[stepType]}
            </div>
            <div className="text-xs text-text-dim">{STEP_DESCRIPTIONS[stepType]}</div>
          </motion.div>
        </AnimatePresence>

        <div className="relative">
          <div className="mb-2">
            <Tooltip content="The target (large) model that verifies draft tokens for correctness">
              <div className="text-xs font-bold text-verify mb-2 inline-block">VERIFIER</div>
            </Tooltip>
            <div className="flex items-center gap-2 h-14 bg-surface-3/50 rounded-lg px-3 border border-border/50">
              {currentStep >= 1 && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1"
                >
                  {tokens.map(t => (
                    <Tooltip
                      key={t.id}
                      content={
                        t.status === 'accepted' ? `Token "${t.label}" accepted - matches target distribution` :
                        t.status === 'rejected' ? `Token "${t.label}" rejected - diverges from target` :
                        `Token "${t.label}" being verified`
                      }
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{
                          scale: 1,
                          backgroundColor: tokenColor(t.status),
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white cursor-default"
                      >
                        {t.label}
                        {t.status === 'accepted' && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute text-[8px]" style={{ marginTop: -16 }}>
                            ✓
                          </motion.span>
                        )}
                        {t.status === 'rejected' && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute text-[8px]" style={{ marginTop: -16 }}>
                            ✗
                          </motion.span>
                        )}
                      </motion.div>
                    </Tooltip>
                  ))}
                </motion.div>
              )}
              {currentStep >= 2 && currentStep < 4 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: 120 }}
                  className="h-6 rounded-full bg-verify/30 overflow-hidden ml-auto"
                >
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.2 / speed }}
                    className="h-full bg-verify/60 rounded-full"
                  />
                </motion.div>
              )}
              {currentStep >= 3 && (
                <Tooltip content={`Verification result: ${accepted} of ${K} tokens accepted. Bonus token t* sampled from adjusted distribution.`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ml-auto px-2 py-1 rounded bg-verify/20 text-verify text-xs font-mono"
                  >
                    v = ({accepted}, t*)
                  </motion.div>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex justify-center my-1">
            <AnimatePresence>
              {currentStep === 1 && (
                <Tooltip content="Draft tokens sent from speculator to verifier for checking">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-draft text-lg"
                  >
                    ↑ draft tokens
                  </motion.div>
                </Tooltip>
              )}
              {currentStep === 3 && (
                <Tooltip content="Verification outcome: how many accepted (k) and the bonus token (t*)">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-verify text-lg"
                  >
                    ↓ v = (k, t*)
                  </motion.div>
                </Tooltip>
              )}
            </AnimatePresence>
          </div>

          <div>
            <Tooltip content="The draft (small) model that generates candidate tokens quickly">
              <div className="text-xs font-bold text-draft mb-2 inline-block">SPECULATOR</div>
            </Tooltip>
            <div className="flex items-center gap-3 h-14 bg-surface-3/50 rounded-lg px-3 border border-border/50">
              {currentStep === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Preparing draft tokens...
                </motion.div>
              )}
              {currentStep >= 1 && currentStep < 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Drafting + building speculation cache...
                </motion.div>
              )}

              {currentStep >= 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-1.5 ml-auto"
                >
                  {cacheEntries.map((entry, i) => (
                    <Tooltip
                      key={i}
                      content={
                        <div>
                          <div className="font-medium">Cache entry: {entry.key}</div>
                          <div className="text-text-dim mt-1">
                            {entry.status === 'building' && 'Pre-computing speculation for this outcome...'}
                            {entry.status === 'ready' && 'Speculation ready. Waiting for verification result.'}
                            {entry.status === 'hit' && 'MATCH! This speculation can be used immediately.'}
                            {entry.status === 'miss' && 'No match. This pre-computation was wasted (but cheap).'}
                          </div>
                        </div>
                      }
                    >
                      <motion.div
                        animate={{ backgroundColor: cacheColor(entry.status) }}
                        className="w-16 h-9 rounded-md flex items-center justify-center text-[10px] font-mono text-white cursor-default border border-white/10"
                      >
                        {entry.status === 'hit' ? 'HIT' : entry.status === 'miss' ? 'miss' : entry.key.slice(0, 5)}
                      </motion.div>
                    </Tooltip>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1.5">
            <span className="text-xs text-text-dim mr-2">Sequence:</span>
            {Array.from({ length: totalTokens }, (_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-5 h-5 rounded bg-accept/80 border border-accept/40"
              />
            ))}
            {totalTokens === 0 && <span className="text-xs text-text-dim italic">empty</span>}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <Legend
            items={[
              { color: COLORS.draft, label: 'Draft / Sent', tooltip: 'Token generated by draft model, sent for verification' },
              { color: COLORS.accept, label: 'Accepted', tooltip: 'Token passed verification - it matches the target model distribution' },
              { color: COLORS.reject, label: 'Rejected', tooltip: 'Token failed verification - later tokens are discarded' },
              { color: COLORS.cacheHit, label: 'Cache hit', tooltip: 'Pre-computed speculation matched the actual outcome' },
              { color: COLORS.cacheMiss, label: 'Cache miss', tooltip: 'No matching pre-computed speculation' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <ConceptCard title="Key terms: SD, SSD, Verifier, Speculator" defaultOpen>
            <p>
              <M color="#f59e0b">{'\\textbf{Speculative Decoding (SD)}'}</M> speeds up LLM inference.
              Instead of generating one token at a time with the large <M color="#3b82f6">{'\\text{target model}'}</M> (the "verifier"),
              a smaller, faster <M color="#f59e0b">{'\\text{draft model}'}</M> (the "speculator") generates{' '}
              <M>{'K'}</M> candidate tokens in bulk.
              The verifier checks all <M>{'K'}</M> tokens in a single forward pass — accepting matches, rejecting the rest.
            </p>
            <p>
              <M color="#3b82f6">{'\\textbf{SSD}'}</M> adds a second layer:
              while the verifier is busy checking, the speculator doesn't sit idle.
              It <em>predicts</em> what the verifier will say and pre-builds the next set of draft tokens
              for each possible outcome, storing them in a <M color="#8b5cf6">{'\\text{speculation cache}'}</M>.
            </p>
          </ConceptCard>

          <ConceptCard title="What are v = (k, t*), acceptance rate (α), and the bonus token?">
            <p>
              After verification, the verifier returns <M color="#3b82f6">{'v^T = (k, t^*)'}</M> where:
            </p>
            <MathBlock>{'k = \\text{number of consecutive draft tokens accepted} \\quad (0 \\leq k \\leq K)'}</MathBlock>
            <MathBlock>{'t^* = \\text{the "bonus token" — sampled from the adjusted target distribution}'}</MathBlock>
            <p>
              The <M color="#22c55e">{'\\text{acceptance rate } \\alpha'}</M> controls how many tokens pass on average.
              Each token is accepted if it's consistent with the target model's distribution. Once a token is rejected,
              all subsequent tokens are discarded (they were conditioned on the wrong prefix).
            </p>
            <p>
              The bonus token <M>{'t^*'}</M> is always generated — even if all <M>{'K'}</M> tokens are rejected,
              you still get one new token. It's sampled from the <em>residual</em> distribution (the gap between target and draft).
              In SSD, if the cache has a pre-computed speculation for the specific <M>{'(k, t^*)'}</M>,
              the next round starts instantly.
            </p>
          </ConceptCard>

          <ConceptCard title="Why does the speculation cache eliminate idle time?">
            <p>
              In standard SD, after the verifier returns <M>{'(k, t^*)'}</M>, the speculator must generate <M>{'K'}</M> new
              draft tokens from scratch. During this drafting time, the verifier sits{' '}
              <M color="#ef4444">{'\\text{idle}'}</M>.
            </p>
            <p>
              In SSD, the speculator has already pre-computed draft tokens for several possible <M>{'(k, t^*)'}</M> outcomes
              <em> while the verifier was running</em>. If one matches — a{' '}
              <M color="#8b5cf6">{'\\text{cache hit}'}</M> — the next round begins with{' '}
              <M color="#22c55e">{'\\text{zero idle time}'}</M>.
            </p>
            <p>
              On a <M color="#6b7280">{'\\text{cache miss}'}</M>, a fallback speculator generates new tokens
              (see Section 4 for how Saguaro optimizes this).
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
