import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  zipfDistribution,
  saguaroDownweight,
  residualDistribution,
  acceptanceRate,
  cacheHitRate,
} from '../lib/distributions'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

const VOCAB_SIZE = 12
const BAR_WIDTH = 36
const BAR_GAP = 4
const MAX_BAR_HEIGHT = 160
const CHART_WIDTH = VOCAB_SIZE * (BAR_WIDTH + BAR_GAP)

function BarChart({
  probs,
  label,
  cacheTokens,
  highlightIndex,
  onHover,
  maxProb,
  tooltip,
}: {
  probs: number[]
  label: string
  cacheTokens: Set<number>
  highlightIndex: number | null
  onHover: (i: number | null) => void
  maxProb: number
  tooltip: string
}) {
  return (
    <div className="flex flex-col items-center">
      <Tooltip content={tooltip}>
        <div className="text-xs font-medium text-text-dim mb-2 cursor-help">{label}</div>
      </Tooltip>
      <svg
        width={CHART_WIDTH}
        height={MAX_BAR_HEIGHT + 30}
        className="overflow-visible"
      >
        {probs.map((p, i) => {
          const x = i * (BAR_WIDTH + BAR_GAP)
          const h = (p / maxProb) * MAX_BAR_HEIGHT
          const isCache = cacheTokens.has(i)
          const isHovered = highlightIndex === i

          return (
            <g key={i} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
              <Tooltip
                content={
                  <div>
                    <div className="font-medium">Token {i} {isCache ? '(cache token)' : ''}</div>
                    <div>Probability: {(p * 100).toFixed(1)}%</div>
                  </div>
                }
              >
                <g>
                  <motion.rect
                    x={x}
                    y={MAX_BAR_HEIGHT - h}
                    width={BAR_WIDTH}
                    animate={{ height: h }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    rx={3}
                    fill={isCache ? COLORS.cacheHit : COLORS.verify}
                    opacity={isHovered ? 1 : 0.8}
                    stroke={isHovered ? 'white' : 'none'}
                    strokeWidth={2}
                  />
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={MAX_BAR_HEIGHT + 14}
                    textAnchor="middle"
                    fill={COLORS.textDim}
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    t{i}
                  </text>
                  {isCache && (
                    <rect
                      x={x}
                      y={MAX_BAR_HEIGHT + 20}
                      width={BAR_WIDTH}
                      height={3}
                      rx={1}
                      fill={COLORS.cacheHit}
                    />
                  )}
                </g>
              </Tooltip>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function SaguaroSampling() {
  const [C, setC] = useState(0.5)
  const [F, setF] = useState(3)
  const [temperature, setTemperature] = useState(1.0)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const { target, draft, residual, alpha, hitRate, cacheTokens, maxProb } = useMemo(() => {
    const rawTarget = zipfDistribution(VOCAB_SIZE, 1.0 / Math.max(temperature, 0.1))
    const cacheSet = new Set(Array.from({ length: Math.round(F) }, (_, i) => i))

    const draftDist = saguaroDownweight(rawTarget, cacheSet, C)

    const residualDist = residualDistribution(rawTarget, draftDist)
    const alphaVal = acceptanceRate(rawTarget, draftDist)
    const hitRateVal = cacheHitRate(residualDist, cacheSet, Math.round(F) + 1, 6 + VOCAB_SIZE - Math.round(F))

    const maxP = Math.max(...rawTarget, ...draftDist, ...residualDist)

    return {
      target: rawTarget,
      draft: draftDist,
      residual: residualDist,
      alpha: alphaVal,
      hitRate: hitRateVal,
      cacheTokens: cacheSet,
      maxProb: maxP,
    }
  }, [C, F, temperature])

  return (
    <SectionHeader
      number={3}
      title="Saguaro Sampling"
      subtitle="Manipulating the draft distribution to control the residual"
      tooltip="Section 4.2, Definition 14: Saguaro sampling downweights cache tokens in the draft distribution by constant C."
      referenceFigure="./reference-figures/fig5-saguaro-sampling.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-52">
            <Slider label="C (downweight)" value={C} onChange={setC} min={0.01} max={1} step={0.01}
              tooltip="Saguaro downweighting constant. C=1 means no modification. Lower C = more cache hits but fewer accepted tokens." />
          </div>
          <div className="w-44">
            <Slider label="F (cache tokens)" value={F} onChange={v => setF(Math.round(v))} min={1} max={6} step={1}
              formatValue={v => String(Math.round(v))}
              tooltip="Number of top-F tokens designated as cache tokens." />
          </div>
          <div className="w-44">
            <Slider label="Temperature" value={temperature} onChange={setTemperature} min={0.1} max={2} step={0.05}
              tooltip="Target distribution temperature. Lower = more peaked. Higher = more uniform." />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 mb-5">
          <BarChart
            probs={target}
            label="Target p_target"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The target model's true distribution. This is what we want to sample from."
          />
          <div className="flex items-center text-text-dim text-lg">→</div>
          <BarChart
            probs={draft}
            label="Draft p_draft (Saguaro)"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The modified draft distribution after Saguaro downweighting. Cache tokens (purple) have lower probability."
          />
          <div className="flex items-center text-text-dim text-lg">→</div>
          <BarChart
            probs={residual}
            label="Residual r(t)"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The residual distribution. When a token is rejected, the bonus token is sampled from here."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Tooltip content="Probability of accepting a draft token. Decreases as C decreases.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Acceptance rate (α)</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: COLORS.accept }}
                    animate={{ width: `${alpha * 100}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </div>
                <span className="text-sm font-mono font-bold text-accept w-14 text-right">
                  {(alpha * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </Tooltip>

          <Tooltip content="Probability that the bonus token lands on a cache token with a matching pre-computed speculation.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Cache hit rate</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: COLORS.cacheHit }}
                    animate={{ width: `${hitRate * 100}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </div>
                <span className="text-sm font-mono font-bold text-cache-hit w-14 text-right">
                  {(hitRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </Tooltip>
        </div>

        <div className="mt-3 mb-4">
          <Legend
            items={[
              { color: COLORS.verify, label: 'Non-cache token', tooltip: 'Tokens not in the cache — their draft probability is unchanged' },
              { color: COLORS.cacheHit, label: 'Cache token (top-F)', tooltip: 'Tokens whose speculations are pre-computed in the cache' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <ConceptCard title="What is the residual distribution and why does it matter?" defaultOpen>
            <p>
              In speculative decoding, when a draft token is <M color="#ef4444">{'\\text{rejected}'}</M>,
              a bonus token <M>{'t^*'}</M> is sampled from the <strong>residual distribution</strong>:
            </p>
            <MathBlock>{'r(t) = \\frac{\\max\\bigl(p_{\\text{target}}(t) - p_{\\text{draft}}(t),\\; 0\\bigr)}{Z}'}</MathBlock>
            <p>
              where <M>{'Z = \\sum_t \\max(p_{\\text{target}}(t) - p_{\\text{draft}}(t), 0)'}</M> normalizes the distribution.
            </p>
            <p>
              Intuitively, the residual captures <em>"what the target model wants that the draft model didn't provide enough of."</em>
              Wherever <M>{'p_{\\text{target}}'}</M> has more probability mass than <M>{'p_{\\text{draft}}'}</M>, the residual picks up that gap.
            </p>
            <p>
              This matters because <M>{'t^*'}</M> determines which cache entry to look up. If we can
              make <M>{'t^*'}</M> <em>predictable</em> (likely to be one of a small set of tokens), we can pre-cache
              speculations for those tokens and get cache hits.
            </p>
          </ConceptCard>

          <ConceptCard title="What does C (downweighting constant) actually do?">
            <p>
              <M color="#3b82f6">{'C'}</M> is the Saguaro downweighting constant (Definition 14).
              It multiplies the draft probability of the top-<M>{'F'}</M> cache tokens:
            </p>
            <MathBlock>{'p_{\\text{draft}}(t) = \\begin{cases} p_{\\text{original}}(t) \\times C & \\text{if } t \\in \\text{cache tokens} \\\\ p_{\\text{original}}(t) & \\text{otherwise} \\end{cases}'}</MathBlock>
            <p>
              then renormalize so all probabilities sum to 1.
            </p>
            <p>
              <M color="#22c55e">{'C = 1'}</M>: No modification — standard SD.
              Acceptance rate is high, but the residual is spread out. Bonus tokens could be anything, making cache hits unlikely.
            </p>
            <p>
              <M color="#f59e0b">{'C \\to 0'}</M>: Cache tokens become very unlikely in the draft. Since the target
              still gives them high probability, the gap <M>{'p_{\\text{target}} - p_{\\text{draft}}'}</M> grows large for cache tokens.
              The residual concentrates on them, making bonus tokens predictable — high cache hit rate.
              But acceptance rate drops because the draft diverges from the target.
            </p>
            <p>
              Try dragging <M>{'C'}</M> from 1 to 0 above and watch the purple bars (cache tokens) shrink in the draft
              chart while growing in the residual chart.
            </p>
          </ConceptCard>

          <ConceptCard title="The core tradeoff: acceptance rate vs cache hit rate">
            <p>
              <M color="#22c55e">{'\\alpha'}</M> (acceptance rate) <M>{'= \\sum_t \\min\\bigl(p_{\\text{target}}(t),\\, p_{\\text{draft}}(t)\\bigr)'}</M>
              — the probability a draft token passes verification.
            </p>
            <p>
              <M color="#8b5cf6">{'p_{\\text{hit}}'}</M> (cache hit rate) = probability the bonus token lands on a cached speculation.
            </p>
            <p>
              These are in <strong>tension</strong>: lowering <M>{'C'}</M> increases <M>{'p_{\\text{hit}}'}</M> but decreases <M>{'\\alpha'}</M>.
              The optimal <M>{'C'}</M> maximizes overall throughput:
            </p>
            <MathBlock>{'\\text{Throughput} \\propto \\frac{\\alpha \\cdot K + 1}{T_{\\text{verify}} + (1 - p_{\\text{hit}}) \\cdot T_{\\text{fallback}}}'}</MathBlock>
          </ConceptCard>

          <ConceptCard title="What are F (fan-out) and temperature?">
            <p>
              <M color="#8b5cf6">{'F'}</M> = number of top tokens designated as "cache tokens."
              The speculation cache pre-computes draft continuations for these <M>{'F'}</M> tokens.
              Larger <M>{'F'}</M> means more coverage but requires more compute budget.
            </p>
            <p>
              <M>{'T'}</M> (temperature) controls the entropy of the target distribution.
              Low temperature (<M>{'T \\to 0'}</M>) means the target is very peaked — one token dominates, making prediction easy.
              High temperature (<M>{'T \\to 2'}</M>) makes the distribution more uniform — many tokens
              are equally likely, making it harder for any fixed cache to hit.
              Saguaro's improvement is most dramatic at higher temperatures.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
