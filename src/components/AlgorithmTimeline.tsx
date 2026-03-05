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
        : `Cache MISS. No pre-computed speculation matched pos=${accepted} accepted, t*="${bonus}". The fallback speculator must generate new draft tokens.`
    case 'next-round':
      return `Sequence updated. ${accepted + 1} new words added to the output this round.`
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
  const STEPS_PER_ROUND = 6

  const totalSteps = TOTAL_ROUNDS * STEPS_PER_ROUND
  const globalStep = currentRound * STEPS_PER_ROUND + currentStep
  const stepType: StepType = (['idle', 'spec-send', 'parallel-work', 'verify-result', 'cache-check', 'next-round'] as const)[currentStep]

  const rd = ROUND_DATA[currentRound]
  const accepted = acceptedForRound(currentRound, alpha, K)
  // Cache hit if pHit is high enough (deterministic per round so it's reproducible)
  const cacheHit = (currentRound * 7 + 3) % 10 < pHit * 10
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

  const committedRounds = currentStep >= STEPS_PER_ROUND - 1 ? currentRound + 1 : currentRound
  const sequenceWords = [
    ...PROMPT_WORDS,
    ...ROUND_DATA.slice(0, committedRounds).flatMap((roundData, round) => (
      [...roundData.draft.slice(0, acceptedForRound(round, alpha, K)), roundData.bonus]
    )),
  ]

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= STEPS_PER_ROUND - 1) {
        if (currentRound >= TOTAL_ROUNDS - 1) {
          setIsPlaying(false)
          return prev
        }
        setCurrentRound(r => r + 1)
        return 0
      }
      return prev + 1
    })
  }, [currentRound])

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
            currentStep={globalStep}
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
                          <div className="font-medium">Cache slot: if t* = "{entry.bonusGuess}"</div>
                          <div className="text-text-dim mt-1">
                            {entry.status === 'building' && `Pre-computing: "what comes after '${entry.bonusGuess}'?"...`}
                            {entry.status === 'ready' && `Ready. If the bonus token is "${entry.bonusGuess}", this speculation can be used.`}
                            {entry.status === 'hit' && `MATCH! The bonus token was indeed "${entry.bonusGuess}". Next round starts instantly.`}
                            {entry.status === 'miss' && `No match — the bonus token was "${rd.bonus}", not "${entry.bonusGuess}".`}
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
              {sequenceWords.map((word, i) => (
                <motion.span
                  key={`${i}-${word}`}
                  initial={i >= PROMPT_WORDS.length ? { scale: 0, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-sm font-mono ${i < PROMPT_WORDS.length ? 'text-text-dim' : 'text-accept font-medium'}`}
                >
                  {word}
                </motion.span>
              ))}
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
