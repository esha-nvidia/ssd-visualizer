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
  bonusGuess: string
  status: 'building' | 'ready' | 'hit' | 'miss'
}

interface SequenceToken {
  word: string
  kind: 'prompt' | 'accepted' | 'bonus'
}

type StepType =
  | 'idle'
  | 'spec-send'
  | 'parallel-work'
  | 'verify-result'
  | 'cache-check'
  | 'fallback-draft'
  | 'next-round'

const STEP_LABELS: Record<StepType, string> = {
  'idle': 'Waiting to start',
  'spec-send': 'Speculator sends draft tokens to verifier',
  'parallel-work': 'Verifier checks tokens while speculator builds cache',
  'verify-result': 'Verifier returns accepted count and bonus token',
  'cache-check': 'Check speculation cache for matching entry',
  'fallback-draft': 'Fallback drafts the next round after a cache miss',
  'next-round': 'Starting next round',
}

const PROMPT_WORDS = ['The', 'cat', 'sat', 'on', 'the']

// Each round: the draft model proposes 4 words, and the target model may reject some.
// The bonus token is what the target model would have said instead.
const ROUND_DATA = [
  {
    draft: ['warm', 'soft', 'velvet', 'couch'],
    bonus: 'cushion',
    // What the speculator guesses t* might be, for each possible k
    cacheGuesses: ['cushion', 'rug', 'blanket'],
  },
  {
    draft: ['beside', 'the', 'crackling', 'fire'],
    bonus: 'warm',
    cacheGuesses: ['warm', 'old', 'bright'],
  },
  {
    draft: ['fireplace', 'while', 'snow', 'fell'],
    bonus: 'drifted',
    cacheGuesses: ['drifted', 'piled', 'melted'],
  },
  {
    draft: ['gently', 'outside', 'the', 'window'],
    bonus: 'frosty',
    cacheGuesses: ['frosty', 'foggy', 'dark'],
  },
]

function cacheHitForRound(round: number, pHit: number): boolean {
  return (round * 7 + 3) % 10 < pHit * 10
}

function stepsForRound(cacheHit: boolean): StepType[] {
  return cacheHit
    ? ['idle', 'spec-send', 'parallel-work', 'verify-result', 'cache-check', 'next-round']
    : ['idle', 'spec-send', 'parallel-work', 'verify-result', 'cache-check', 'fallback-draft', 'next-round']
}

function getStepDescription(stepType: StepType, round: number, accepted: number, K: number, bonus: string, cacheHit: boolean): string {
  const rd = ROUND_DATA[round]
  const draftPreview = rd.draft.map(w => `"${w}"`).join(', ')
  switch (stepType) {
    case 'idle':
      return `The speculator (draft model) is about to guess the next ${K} words: ${draftPreview}`
    case 'spec-send':
      return `The draft model proposes: ${draftPreview}. These are sent to the large target model for verification.`
    case 'parallel-work':
      return `KEY INSIGHT: While the verifier checks those ${K} words, the speculator doesn't sit idle — it pre-computes speculations for each possible outcome, guessing what t* might be: ${rd.cacheGuesses.map(w => `"${w}"`).join(', ')}`
    case 'verify-result':
      return `The verifier accepted ${accepted} of ${K} words${accepted > 0 ? ` (${rd.draft.slice(0, accepted).map(w => `"${w}"`).join(', ')})` : ''}${accepted < K ? `. Rejected "${rd.draft[accepted]}" — the target model preferred something different.` : '.'} Bonus token t* = "${bonus}".`
    case 'cache-check':
      return cacheHit
        ? `Cache HIT! The speculator had pre-computed a speculation for pos=${accepted} accepted, t*="${bonus}". Next round starts instantly with zero idle time.`
        : `Cache MISS. The verifier's bonus token t*="${bonus}" is still committed, but SSD has no matching next-round draft cached for pos=${accepted}.`
    case 'fallback-draft':
      return `Fallback speculator regenerates the next draft from the updated prefix ending in "${bonus}". The miss affects the next draft, not the already-committed bonus token.`
    case 'next-round':
      return `Sequence updated. ${accepted + 1} new words added to the output this round.${cacheHit ? ' The next round was already cached.' : ' The next round now continues from the fallback draft.'}`
  }
}

function acceptedForRound(round: number, alpha: number, K: number): number {
  return Math.max(0, Math.min(K, Math.floor(alpha * K + (round % 2 === 0 ? 0.5 : -0.3))))
}

export function AlgorithmTimeline() {
  const [alpha, setAlpha] = useState(0.7)
  const [pHit, setPHit] = useState(0.8)
  const K = 4
  const [speed, setSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)

  const TOTAL_ROUNDS = 4

  const rd = ROUND_DATA[currentRound]
  const accepted = acceptedForRound(currentRound, alpha, K)
  const cacheHit = cacheHitForRound(currentRound, pHit)
  const roundSteps = stepsForRound(cacheHit)
  const stepType = roundSteps[currentStep]
  const totalSteps = roundSteps.length
  // The bonus token is always in cacheGuesses[0] by design, so a "hit" means we guessed right
  const bonusInCache = rd.cacheGuesses.includes(rd.bonus)

  const tokens: TokenState[] = rd.draft.map((word, i) => {
    let status: TokenState['status'] = 'pending'
    if (currentStep >= 1) status = 'sent'
    if (currentStep >= 3) status = i < accepted ? 'accepted' : 'rejected'
    return { id: `r${currentRound}-t${i}`, label: word, status }
  })

  const cacheEntries: CacheEntry[] = rd.cacheGuesses.map((guess) => {
    let status: CacheEntry['status'] = 'building'
    if (currentStep >= 2) status = 'ready'
    if (currentStep >= 4) {
      // A specific entry is a HIT if: overall cache hit occurred AND this guess matches the bonus
      status = (cacheHit && bonusInCache && guess === rd.bonus) ? 'hit' : 'miss'
    }
    return {
      key: `t*="${guess}"`,
      bonusGuess: guess,
      status,
    }
  })

  const committedRounds = currentStep >= totalSteps - 1 ? currentRound + 1 : currentRound
  const sequenceTokens: SequenceToken[] = [
    ...PROMPT_WORDS.map(word => ({ word, kind: 'prompt' as const })),
    ...ROUND_DATA.slice(0, committedRounds).flatMap((roundData, round) => {
      const acceptedCount = acceptedForRound(round, alpha, K)
      return [
        ...roundData.draft.slice(0, acceptedCount).map(word => ({ word, kind: 'accepted' as const })),
        { word: roundData.bonus, kind: 'bonus' as const },
      ]
    }),
  ]

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= totalSteps - 1) {
        if (currentRound >= TOTAL_ROUNDS - 1) {
          setIsPlaying(false)
          return prev
        }
        setCurrentRound(r => r + 1)
        return 0
      }
      return prev + 1
    })
  }, [currentRound, totalSteps])

  const stepBack = useCallback(() => {
    setCurrentStep(prev => {
      if (prev <= 0) {
        if (currentRound > 0) {
          const previousRoundSteps = stepsForRound(cacheHitForRound(currentRound - 1, pHit))
          setCurrentRound(r => r - 1)
          return previousRoundSteps.length - 1
        }
        return 0
      }
      return prev - 1
    })
  }, [currentRound, pHit])

  const reset = useCallback(() => {
    setIsPlaying(false)
    setCurrentRound(0)
    setCurrentStep(0)
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
      subtitle="Verifier and speculator running in parallel"
      tooltip="Algorithm 1: while the verifier checks the current draft, the speculator pre-computes likely next outcomes."
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
            currentStep={currentStep}
            totalSteps={totalSteps}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentRound}-${stepType}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 p-3 rounded-lg bg-surface-3 border border-border"
          >
            <div className="text-sm font-medium text-verify mb-1">
              Round {currentRound + 1} &mdash; {STEP_LABELS[stepType]}
            </div>
            <div className="text-xs text-text-dim">{getStepDescription(stepType, currentRound, accepted, K, rd.bonus, cacheHit)}</div>
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
                        t.status === 'accepted' ? `"${t.label}" ✓ accepted — the target model agrees with this word` :
                        t.status === 'rejected' ? `"${t.label}" ✗ rejected — the target model would have chosen differently. All words after this are discarded.` :
                        `"${t.label}" — being verified against the target model`
                      }
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{
                          scale: 1,
                          backgroundColor: tokenColor(t.status),
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="relative h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white cursor-default px-2.5 min-w-[2.5rem]"
                      >
                        {t.label}
                        {t.status === 'accepted' && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1.5 -right-1 text-[10px] bg-accept rounded-full w-4 h-4 flex items-center justify-center border border-white/30">
                            ✓
                          </motion.span>
                        )}
                        {t.status === 'rejected' && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1.5 -right-1 text-[10px] bg-reject rounded-full w-4 h-4 flex items-center justify-center border border-white/30">
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
                <Tooltip content={`Verification result: ${accepted} of ${K} words accepted. Bonus token t* = "${rd.bonus}" sampled from the residual distribution.`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ml-auto px-2 py-1 rounded bg-verify/20 text-verify text-xs font-mono"
                  >
                    v = (pos={accepted}, "{rd.bonus}")
                  </motion.div>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex justify-center my-1">
            <AnimatePresence>
              {currentStep === 1 && (
                <Tooltip content={`Draft model proposes: ${rd.draft.map(w => `"${w}"`).join(', ')}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-draft text-sm font-mono"
                  >
                    ↑ "{rd.draft.join(' ')}"
                  </motion.div>
                </Tooltip>
              )}
              {currentStep === 3 && (
                <Tooltip content={`Verifier accepted ${accepted} words (pos=${accepted}), bonus token t* = "${rd.bonus}"`}>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-verify text-sm font-mono"
                  >
                    ↓ v = (pos={accepted}, "{rd.bonus}")
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
              {(stepType === 'spec-send' || stepType === 'parallel-work') && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Drafting + building speculation cache...
                </motion.div>
              )}
              {stepType === 'fallback-draft' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-reject">
                  Cache miss: fallback is generating a fresh draft from &quot;{rd.bonus}&quot;.
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
                          <div className="font-medium">Cache slot: if t* = "{entry.bonusGuess}"</div>
                          <div className="text-text-dim mt-1">
                            {entry.status === 'building' && `Pre-computing: "what comes after '${entry.bonusGuess}'?"...`}
                            {entry.status === 'ready' && `Ready. If the bonus token is "${entry.bonusGuess}", this speculation can be used.`}
                            {entry.status === 'hit' && `MATCH! The bonus token was indeed "${entry.bonusGuess}". Next round starts instantly.`}
                            {entry.status === 'miss' && `No match — the bonus token was "${rd.bonus}", not "${entry.bonusGuess}". "${rd.bonus}" still stays in the output; SSD just falls back for the next draft.`}
                          </div>
                        </div>
                      }
                    >
                      <motion.div
                        animate={{ backgroundColor: cacheColor(entry.status) }}
                        className="h-9 rounded-md flex items-center justify-center text-[10px] font-mono text-white cursor-default border border-white/10 px-2 min-w-[4rem]"
                      >
                        {entry.status === 'hit' ? `HIT ✓` : entry.status === 'miss' ? 'miss' : `t*="${entry.bonusGuess}"`}
                      </motion.div>
                    </Tooltip>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <span className="text-xs text-text-dim mr-2">Generated text:</span>
            <div className="mt-1.5 p-2.5 rounded-lg bg-surface/80 border border-border/50 min-h-[2.5rem] flex flex-wrap items-center gap-1">
              {sequenceTokens.map((token, i) => {
                const className = token.kind === 'prompt'
                  ? 'text-text-dim'
                  : token.kind === 'bonus'
                    ? 'text-verify font-semibold underline decoration-verify/40 underline-offset-2'
                    : 'text-accept font-medium'

                const tooltip = token.kind === 'prompt'
                  ? 'Prompt token'
                  : token.kind === 'bonus'
                    ? 'Verifier bonus token t* — committed whether the cache hits or misses'
                    : 'Accepted draft token'

                return (
                  <Tooltip key={`${i}-${token.word}-${token.kind}`} content={tooltip}>
                    <motion.span
                      initial={token.kind !== 'prompt' ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`text-sm font-mono ${className}`}
                    >
                      {token.word}
                    </motion.span>
                  </Tooltip>
                )
              })}
            </div>
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
              <M color="#f59e0b">{'\\textbf{SD}'}</M> uses a small draft model to propose <M>{'K'}</M> tokens, then a large verifier to check them in one pass.
            </p>
            <p>
              <M color="#3b82f6">{'\\textbf{SSD}'}</M> follows the paper's key idea: while the verifier works, the speculator predicts likely verification outcomes and fills a <M color="#8b5cf6">{'\\text{speculation cache}'}</M> for the next round.
            </p>
          </ConceptCard>

          <ConceptCard title="What are v = (pos, t*), acceptance rate (α), and the bonus token?">
            <p>
              After verification, the verifier returns <M color="#3b82f6">{'v = (\\text{pos}, t^*)'}</M>:
            </p>
            <MathBlock>{'\\text{pos} = \\text{number of consecutive draft tokens accepted} \\quad (0 \\leq \\text{pos} \\leq K)'}</MathBlock>
            <MathBlock>{'t^* = \\text{the "bonus token" — sampled from the adjusted target distribution}'}</MathBlock>
            <p>
              <M>{'\\alpha'}</M> controls how often draft tokens survive verification. After the first rejection, later draft tokens are discarded.
            </p>
            <p>
              The bonus token <M>{'t^*'}</M> is always added. If SSD already cached the realized <M>{'(\\text{pos}, t^*)'}</M>, the next round starts immediately.
            </p>
          </ConceptCard>

          <ConceptCard title="Why does the speculation cache eliminate idle time?">
            <p>
              In SD, once the verifier returns <M>{'(\\text{pos}, t^*)'}</M>, the draft model has to start again from scratch. That leaves the verifier <M color="#ef4444">{'\\text{idle}'}</M>.
            </p>
            <p>
              In SSD, those next-round drafts were built <em>during</em> verification. A <M color="#8b5cf6">{'\\text{cache hit}'}</M> removes the gap; a <M color="#6b7280">{'\\text{miss}'}</M> falls back to a new draft.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
