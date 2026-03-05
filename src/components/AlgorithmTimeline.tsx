import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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

interface RoundModel {
  id: number
  prefix: string[]
  draft: string[]
  accepted: number
  bonus: string
  cacheHit: boolean
  cacheGuesses: string[]
  committed: string[]
}

type StepType =
  | 'idle'
  | 'spec-send'
  | 'parallel-work'
  | 'verify-result'
  | 'cache-check'
  | 'next-round'

const STEP_LABELS: Record<StepType, string> = {
  'idle': 'Ready to draft',
  'spec-send': 'Draft sent to verifier',
  'parallel-work': 'Verify + cache build overlap',
  'verify-result': 'Verifier returns v = (pos, t*)',
  'cache-check': 'Check the speculation cache',
  'next-round': 'Advance the prefix',
}

const K = 4
const TOTAL_ROUNDS = 4
const CACHE_SLOTS = 3
const ROUND_STEPS: StepType[] = ['idle', 'spec-send', 'parallel-work', 'verify-result', 'cache-check', 'next-round']
const PROMPT_WORDS = ['The', 'cat', 'sat', 'on', 'the']
const TARGET_STREAM = [
  'warm', 'soft', 'velvet', 'cushion', 'beside',
  'the', 'crackling', 'fire', 'while', 'snow',
  'drifted', 'gently', 'outside', 'the', 'window',
  'tonight', 'under', 'quiet', 'moonlight', 'near',
  'sleeping', 'pines', 'and', 'silver', 'mist',
]

const ACCEPT_THRESHOLDS = [
  [0.18, 0.43, 0.69, 0.9],
  [0.12, 0.38, 0.63, 0.87],
  [0.24, 0.49, 0.71, 0.92],
  [0.16, 0.35, 0.58, 0.84],
] as const

const CACHE_THRESHOLDS = [0.2, 0.45, 0.7, 0.85] as const

const FALLBACK_WORDS = [
  'sofa', 'linen', 'embers', 'shadow', 'nearby', 'glow', 'still',
  'quietly', 'door', 'morning', 'cedars', 'breeze', 'lamplight',
]

const DISTRACTORS: Record<string, string[]> = {
  warm: ['cool', 'cozy', 'dim'],
  soft: ['firm', 'plain', 'rough'],
  velvet: ['linen', 'cotton', 'woven'],
  cushion: ['pillow', 'blanket', 'rug', 'sofa'],
  beside: ['beyond', 'under', 'near'],
  the: ['a', 'that', 'this'],
  crackling: ['glowing', 'silent', 'fading'],
  fire: ['hearth', 'embers', 'smoke'],
  while: ['after', 'as', 'when'],
  snow: ['rain', 'mist', 'leaves'],
  drifted: ['settled', 'melted', 'swirled'],
  gently: ['slowly', 'softly', 'quietly'],
  outside: ['nearby', 'indoors', 'beyond'],
  window: ['door', 'hall', 'garden'],
  tonight: ['morning', 'dawn', 'sunrise'],
  under: ['across', 'above', 'inside'],
  quiet: ['restless', 'hidden', 'distant'],
  moonlight: ['starlight', 'sunlight', 'shadow'],
  near: ['beyond', 'above', 'within'],
  sleeping: ['silent', 'waking', 'shaded'],
  pines: ['cedars', 'maples', 'branches'],
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items
  const normalized = ((offset % items.length) + items.length) % items.length
  return items.slice(normalized).concat(items.slice(0, normalized))
}

function acceptedCountForRound(alpha: number, round: number): number {
  let accepted = 0
  while (accepted < K && alpha >= ACCEPT_THRESHOLDS[round][accepted]) {
    accepted++
  }
  return accepted
}

function cacheHitForRound(round: number, pHit: number): boolean {
  return pHit >= CACHE_THRESHOLDS[round]
}

function uniqueAlternatives(word: string, seed: number): string[] {
  const base = DISTRACTORS[word] ?? FALLBACK_WORDS.filter(candidate => candidate !== word)
  const rotated = rotate(base, seed)
  const seen = new Set<string>()
  const unique = rotated.filter(candidate => {
    if (candidate === word || seen.has(candidate)) return false
    seen.add(candidate)
    return true
  })
  return unique.length > 0 ? unique : FALLBACK_WORDS.filter(candidate => candidate !== word)
}

function buildDraft(targetTokens: string[], accepted: number, round: number): string[] {
  return targetTokens.map((token, index) => (
    index < accepted ? token : uniqueAlternatives(token, round * K + index)[0]
  ))
}

function buildCacheGuesses(bonus: string, round: number, cacheHit: boolean): string[] {
  const guesses = uniqueAlternatives(bonus, round + 1).slice(0, CACHE_SLOTS)
  while (guesses.length < CACHE_SLOTS) {
    guesses.push(FALLBACK_WORDS[(round + guesses.length) % FALLBACK_WORDS.length])
  }
  if (cacheHit) {
    guesses[(round + 1) % CACHE_SLOTS] = bonus
  }
  return guesses
}

function roundToSequenceTokens(round: RoundModel): SequenceToken[] {
  return [
    ...round.draft.slice(0, round.accepted).map(word => ({ word, kind: 'accepted' as const })),
    { word: round.bonus, kind: 'bonus' as const },
  ]
}

function simulateRounds(alpha: number, pHit: number): RoundModel[] {
  let prefix = [...PROMPT_WORDS]
  let cursor = 0

  return Array.from({ length: TOTAL_ROUNDS }, (_, round) => {
    const accepted = acceptedCountForRound(alpha, round)
    const cacheHit = cacheHitForRound(round, pHit)
    const targetWindow = TARGET_STREAM.slice(cursor, cursor + K + 1)
    const bonus = targetWindow[accepted]
    const draft = buildDraft(targetWindow.slice(0, K), accepted, round)
    const cacheGuesses = buildCacheGuesses(bonus, round, cacheHit)
    const committed = [...draft.slice(0, accepted), bonus]

    const model: RoundModel = {
      id: round,
      prefix: [...prefix],
      draft,
      accepted,
      bonus,
      cacheHit,
      cacheGuesses,
      committed,
    }

    prefix = [...prefix, ...committed]
    cursor += accepted + 1
    return model
  })
}

function getStepDescription(stepType: StepType, round: RoundModel, nextRound?: RoundModel): string {
  const acceptedWords = round.draft.slice(0, round.accepted)
  switch (stepType) {
    case 'idle':
      return `Current prefix: "${round.prefix.join(' ')}". The speculator is about to draft the next ${K} tokens.`
    case 'spec-send':
      return `Draft sent: "${round.draft.join(' ')}". The verifier will check tokens from left to right until the first rejection.`
    case 'parallel-work':
      return `While the verifier works, SSD precomputes cache entries for candidate bonus tokens: ${round.cacheGuesses.map(word => `"${word}"`).join(', ')}.`
    case 'verify-result':
      return round.accepted === K
        ? `All ${K} draft tokens were accepted. The verifier also emits bonus token t* = "${round.bonus}".`
        : `Accepted ${round.accepted}/${K} draft tokens${acceptedWords.length > 0 ? ` (${acceptedWords.map(word => `"${word}"`).join(', ')})` : ''}. Rejected "${round.draft[round.accepted]}", then emitted bonus token t* = "${round.bonus}".`
    case 'cache-check':
      return round.cacheHit
        ? `Cache HIT for (pos=${round.accepted}, t*="${round.bonus}"). The next draft was already prepared during verification.`
        : `Cache MISS for (pos=${round.accepted}, t*="${round.bonus}"). The committed text is still correct, but the next draft must be rebuilt from the updated prefix.`
    case 'next-round':
      if (!nextRound) {
        return `Final round committed. The output now ends in "${round.bonus}".`
      }
      return round.cacheHit
        ? `Committed ${round.accepted + 1} new tokens. Cached next draft is ready: "${nextRound.draft.join(' ')}".`
        : `Committed ${round.accepted + 1} new tokens. Fallback rebuilt the next draft: "${nextRound.draft.join(' ')}".`
  }
}

export function AlgorithmTimeline() {
  const [alpha, setAlpha] = useState(0.7)
  const [pHit, setPHit] = useState(0.8)
  const [speed, setSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)

  const rounds = useMemo(() => simulateRounds(alpha, pHit), [alpha, pHit])
  const round = rounds[currentRound]
  const nextRound = rounds[currentRound + 1]
  const stepType = ROUND_STEPS[currentStep]
  const totalSteps = ROUND_STEPS.length

  const tokens: TokenState[] = round.draft.map((word, index) => {
    let status: TokenState['status'] = 'pending'
    if (currentStep >= 1) status = 'sent'
    if (currentStep >= 3) status = index < round.accepted ? 'accepted' : 'rejected'
    return { id: `r${currentRound}-t${index}`, label: word, status }
  })

  const cacheEntries: CacheEntry[] = round.cacheGuesses.map(guess => {
    let status: CacheEntry['status'] = 'building'
    if (currentStep >= 3) status = 'ready'
    if (currentStep >= 4) {
      status = round.cacheHit
        ? (guess === round.bonus ? 'hit' : 'ready')
        : 'miss'
    }
    return { key: `t*="${guess}"`, bonusGuess: guess, status }
  })

  const sequenceTokens: SequenceToken[] = [
    ...PROMPT_WORDS.map(word => ({ word, kind: 'prompt' as const })),
    ...rounds.slice(0, currentRound).flatMap(roundToSequenceTokens),
    ...(currentStep >= 3 ? roundToSequenceTokens(round) : []),
  ]

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= totalSteps - 1) {
        if (currentRound >= TOTAL_ROUNDS - 1) {
          setIsPlaying(false)
          return prev
        }
        setCurrentRound(roundIndex => roundIndex + 1)
        return 0
      }
      return prev + 1
    })
  }, [currentRound, totalSteps])

  const stepBack = useCallback(() => {
    setCurrentStep(prev => {
      if (prev <= 0) {
        if (currentRound > 0) {
          setCurrentRound(roundIndex => roundIndex - 1)
          return totalSteps - 1
        }
        return 0
      }
      return prev - 1
    })
  }, [currentRound, totalSteps])

  const reset = useCallback(() => {
    setIsPlaying(false)
    setCurrentRound(0)
    setCurrentStep(0)
  }, [])

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(advance, 1500 / speed)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [advance, isPlaying, speed])

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
      subtitle="A deterministic round-by-round view of Algorithm 1"
      tooltip="Algorithm 1: draft, verify, cache the likely next outcomes, then either continue immediately on a hit or rebuild on a miss."
      referenceFigure="./reference-figures/fig1-sd-vs-ssd-overview.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="w-44">
            <Slider
              label="Acceptance rate"
              value={alpha}
              onChange={value => { setAlpha(value); reset() }}
              min={0.1}
              max={1}
              tooltip="Per-token acceptance probability proxy. Raising alpha can only add accepted draft tokens in each fixed round."
            />
          </div>
          <div className="w-44">
            <Slider
              label="Cache hit rate"
              value={pHit}
              onChange={value => { setPHit(value); reset() }}
              min={0}
              max={1}
              tooltip="Per-round cache-hit probability proxy. Raising p_hit can only turn fixed miss rounds into hits."
            />
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

        <div className="mb-4 text-xs text-text-dim">
          Deterministic demo: each round uses fixed thresholds, so changing <M>{'\\alpha'}</M> or <M>{'p_{\\text{hit}}'}</M> updates the same rounds monotonically instead of reshuffling the story.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-surface-3 border border-border">
            <div className="text-xs text-text-dim mb-1">Round</div>
            <div className="text-sm font-mono font-bold text-text">{currentRound + 1} / {TOTAL_ROUNDS}</div>
          </div>
          <div className="p-3 rounded-lg bg-surface-3 border border-border">
            <div className="text-xs text-text-dim mb-1">Verifier output</div>
            <div className="text-sm font-mono font-bold text-verify">pos = {round.accepted}</div>
          </div>
          <div className="p-3 rounded-lg bg-surface-3 border border-border">
            <div className="text-xs text-text-dim mb-1">Bonus token</div>
            <div className="text-sm font-mono font-bold text-verify">t* = "{round.bonus}"</div>
          </div>
          <div className="p-3 rounded-lg bg-surface-3 border border-border">
            <div className="text-xs text-text-dim mb-1">Cache outcome</div>
            <div className={`text-sm font-mono font-bold ${round.cacheHit ? 'text-cache-hit' : 'text-reject'}`}>
              {round.cacheHit ? 'HIT' : 'MISS'}
            </div>
          </div>
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
              Round {currentRound + 1} — {STEP_LABELS[stepType]}
            </div>
            <div className="text-xs text-text-dim">
              {getStepDescription(stepType, round, nextRound)}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="relative">
          <div className="mb-2">
            <Tooltip content="The large target model verifies the draft left-to-right and emits v = (pos, t*).">
              <div className="text-xs font-bold text-verify mb-2 inline-block">VERIFIER</div>
            </Tooltip>
            <div className="flex items-center gap-2 h-14 bg-surface-3/50 rounded-lg px-3 border border-border/50">
              {currentStep >= 1 && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1"
                >
                  {tokens.map(token => (
                    <Tooltip
                      key={token.id}
                      content={
                        token.status === 'accepted'
                          ? `"${token.label}" was accepted by the verifier.`
                          : token.status === 'rejected'
                            ? `"${token.label}" is not on the accepted prefix and gets discarded.`
                            : `"${token.label}" is still being checked by the verifier.`
                      }
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, backgroundColor: tokenColor(token.status) }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="relative h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white cursor-default px-2.5 min-w-[2.5rem]"
                      >
                        {token.label}
                        {token.status === 'accepted' && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-1 text-[10px] bg-accept rounded-full w-4 h-4 flex items-center justify-center border border-white/30"
                          >
                            ✓
                          </motion.span>
                        )}
                        {token.status === 'rejected' && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-1 text-[10px] bg-reject rounded-full w-4 h-4 flex items-center justify-center border border-white/30"
                          >
                            ✗
                          </motion.span>
                        )}
                      </motion.div>
                    </Tooltip>
                  ))}
                </motion.div>
              )}
              {stepType === 'parallel-work' && (
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
                <Tooltip content={`Verifier output for this round: pos=${round.accepted}, t*="${round.bonus}"`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="ml-auto px-2 py-1 rounded bg-verify/20 text-verify text-xs font-mono"
                  >
                    v = (pos={round.accepted}, "{round.bonus}")
                  </motion.div>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex justify-center my-1">
            <AnimatePresence>
              {stepType === 'spec-send' && (
                <Tooltip content={`Draft proposal: ${round.draft.map(word => `"${word}"`).join(', ')}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-draft text-sm font-mono"
                  >
                    ↑ "{round.draft.join(' ')}"
                  </motion.div>
                </Tooltip>
              )}
              {stepType === 'verify-result' && (
                <Tooltip content={`Verifier returned pos=${round.accepted} and t*="${round.bonus}"`}>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-verify text-sm font-mono"
                  >
                    ↓ v = (pos={round.accepted}, "{round.bonus}")
                  </motion.div>
                </Tooltip>
              )}
            </AnimatePresence>
          </div>

          <div>
            <Tooltip content="The speculator drafts candidate tokens and fills the speculation cache while verification is in flight.">
              <div className="text-xs font-bold text-draft mb-2 inline-block">SPECULATOR</div>
            </Tooltip>
            <div className="flex items-center gap-3 h-14 bg-surface-3/50 rounded-lg px-3 border border-border/50">
              {stepType === 'idle' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Waiting to draft from the current prefix.
                </motion.div>
              )}
              {stepType === 'spec-send' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  The draft has been sent. SSD will now spend the overlap window on cache entries.
                </motion.div>
              )}
              {stepType === 'parallel-work' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Building cache entries for candidate bonus tokens while verification runs in parallel.
                </motion.div>
              )}
              {stepType === 'verify-result' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  Cache entries are ready. SSD now checks whether the realized bonus token was covered.
                </motion.div>
              )}
              {stepType === 'cache-check' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-xs ${round.cacheHit ? 'text-cache-hit' : 'text-reject'}`}
                >
                  {round.cacheHit
                    ? 'Matching cache entry found. The next draft is already prepared.'
                    : 'No matching cache entry. SSD falls back to a fresh next-round draft.'}
                </motion.div>
              )}
              {stepType === 'next-round' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-text-dim">
                  {nextRound
                    ? `${round.cacheHit ? 'Cached' : 'Fallback'} next draft: "${nextRound.draft.join(' ')}"`
                    : 'No next round remains.'}
                </motion.div>
              )}

              {currentStep >= 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-1.5 ml-auto"
                >
                  {cacheEntries.map(entry => (
                    <Tooltip
                      key={entry.key}
                      content={
                        <div>
                          <div className="font-medium">Cache branch for t* = "{entry.bonusGuess}"</div>
                          <div className="text-text-dim mt-1">
                            {entry.status === 'building' && 'Still being computed during the overlap window.'}
                            {entry.status === 'ready' && 'This branch is available if the verifier returns this bonus token.'}
                            {entry.status === 'hit' && 'This branch matches the realized bonus token, so SSD can continue immediately.'}
                            {entry.status === 'miss' && `The realized bonus token was "${round.bonus}", so this branch does not help.`}
                          </div>
                        </div>
                      }
                    >
                      <motion.div
                        animate={{ backgroundColor: cacheColor(entry.status) }}
                        className="h-9 rounded-md flex items-center justify-center text-[10px] font-mono text-white cursor-default border border-white/10 px-2 min-w-[4rem]"
                      >
                        {entry.status === 'hit' ? 'HIT ✓' : entry.status === 'miss' ? 'MISS' : `t*="${entry.bonusGuess}"`}
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
              {sequenceTokens.map((token, index) => {
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
                  <Tooltip key={`${index}-${token.word}-${token.kind}`} content={tooltip}>
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
              { color: COLORS.draft, label: 'Draft / Sent', tooltip: 'Token proposed by the speculator and sent to the verifier' },
              { color: COLORS.accept, label: 'Accepted', tooltip: 'Token remained on the committed prefix' },
              { color: COLORS.reject, label: 'Rejected', tooltip: 'Token was not part of the committed prefix' },
              { color: COLORS.cacheHit, label: 'Cache hit', tooltip: 'The realized (pos, t*) branch was cached' },
              { color: COLORS.cacheMiss, label: 'Cache miss', tooltip: 'The realized (pos, t*) branch was not cached' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <ConceptCard title="Key terms: SD, SSD, Verifier, Speculator" defaultOpen>
            <p>
              <M color="#f59e0b">{'\\textbf{SD}'}</M> drafts <M>{'K'}</M> tokens, then waits for verification. <M color="#3b82f6">{'\\textbf{SSD}'}</M> uses that verification window to precompute likely next branches.
            </p>
            <p>
              This panel is deterministic on purpose: each round has fixed thresholds, so the sliders change the same rounds monotonically instead of reshuffling the example.
            </p>
          </ConceptCard>

          <ConceptCard title="What are v = (pos, t*), acceptance rate (α), and the bonus token?">
            <p>
              After verification, the verifier returns <M color="#3b82f6">{'v = (\\text{pos}, t^*)'}</M>.
            </p>
            <MathBlock>{'\\text{pos} = \\text{number of consecutive draft tokens accepted} \\quad (0 \\leq \\text{pos} \\leq K)'}</MathBlock>
            <MathBlock>{'t^* = \\text{bonus token committed by the verifier after the accepted prefix}'}</MathBlock>
            <p>
              Changing <M>{'\\alpha'}</M> only changes how far the accepted prefix extends in each round. The bonus token <M>{'t^*'}</M> is always committed once the verifier returns.
            </p>
          </ConceptCard>

          <ConceptCard title="What does a cache hit change?">
            <p>
              A cache hit does <em>not</em> change the current round's committed text. It only changes whether the <em>next</em> draft is already ready.
            </p>
            <p>
              That is why the generated text is identical on hit and miss once <M>{'v = (\\text{pos}, t^*)'}</M> is known, while the speculator lane changes from <M color="#8b5cf6">{'\\text{cached next draft}'}</M> to <M color="#6b7280">{'\\text{fallback rebuild}'}</M>.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
