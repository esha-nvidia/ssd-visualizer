import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  zipfDistribution,
  saguaroDownweight,
  residualMass,
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
                <title>{`Token ${i}${isCache ? ' (cache token)' : ''} | Probability: ${(p * 100).toFixed(1)}%`}</title>
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
          )
        })}
      </svg>
    </div>
  )
}

function LabeledConnector({
  label,
  subLabel,
  tooltip,
}: {
  label: string
  subLabel: string
  tooltip: string
}) {
  return (
    <Tooltip content={tooltip}>
      <div className="flex flex-col items-center justify-center gap-1 min-w-[7rem] shrink-0 cursor-help">
        <div className="text-[10px] font-medium text-text-dim text-center leading-tight">
          {label}
        </div>
        <div className="text-text-dim text-lg leading-none">→</div>
        <div className="text-[10px] text-text-dim/80 text-center leading-tight">
          {subLabel}
        </div>
      </div>
    </Tooltip>
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

    const residualGap = residualMass(rawTarget, draftDist)
    const alphaVal = acceptanceRate(rawTarget, draftDist)
    const hitRateVal = cacheHitRate(residualGap, cacheSet, Math.round(F) + 1, 6 + VOCAB_SIZE - Math.round(F))

    const maxP = Math.max(...rawTarget, ...draftDist, ...residualGap)

    return {
      target: rawTarget,
      draft: draftDist,
      residual: residualGap,
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
      tooltip="Section 4.2, Definition 14: Saguaro sampling downweights cache tokens in the draft distribution by C."
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

        <div className="overflow-x-auto pb-2 mb-5">
          <div className="flex items-center gap-4 min-w-max mx-auto px-1">
          <BarChart
            probs={target}
            label="Target p_target"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The target model's true distribution. This is what we want to sample from."
          />
          <LabeledConnector
            label="apply C"
            subLabel="+ renorm"
            tooltip="Saguaro downweights cache-token probabilities by C, then renormalizes to produce p_draft."
          />
          <BarChart
            probs={draft}
            label="Draft p_draft (Saguaro)"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The modified draft distribution after Saguaro downweighting. Cache tokens (purple) have lower probability."
          />
          <LabeledConnector
            label="compute Δ(t)"
            subLabel="from both"
            tooltip="The residual gap uses both charts: Δ(t) = max(p_target(t) - p_draft(t), 0)."
          />
          <BarChart
            probs={residual}
            label="Residual gap Δ(t)"
            cacheTokens={cacheTokens}
            highlightIndex={hoverIndex}
            onHover={setHoverIndex}
            maxProb={maxProb}
            tooltip="The raw positive gap max(p_target - p_draft, 0). When a token is rejected, this gap is renormalized into the bonus-token distribution."
          />
          </div>
        </div>

        <div className="text-xs text-text-dim text-center mb-5">
          The residual chart shows the unnormalized gap mass so changes in <M>{'C'}</M> stay visible.
          Bonus-token sampling renormalizes that gap only after a rejection happens.
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

          <Tooltip content="Estimated rejected-round bonus-token hit proxy. It only tracks how much residual mass lands on cache tokens and how much continuation fan-out they have; it is not the full Section 2 continuation hit model.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Bonus-token hit proxy</div>
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
          <ConceptCard title="What is the residual gap and why does it matter?" defaultOpen>
            <p>
              When a draft token is <M color="#ef4444">{'\\text{rejected}'}</M>, the key object is the positive gap between target and draft:
            </p>
            <MathBlock>{'\\Delta(t) = \\max\\bigl(p_{\\text{target}}(t) - p_{\\text{draft}}(t),\\; 0\\bigr)'}</MathBlock>
            <p>
              The chart shows this raw gap directly. The bonus token is sampled from its normalized version:
            </p>
            <MathBlock>{'r(t) = \\frac{\\Delta(t)}{Z}, \\qquad Z = \\sum_t \\Delta(t)'}</MathBlock>
            <p>
              Plotting <M>{'\\Delta(t)'}</M> makes the effect of <M>{'C'}</M> visible: lowering <M>{'C'}</M> changes both where the residual lives and how much residual mass there is. If that mass moves onto cache tokens, <M>{'t^*'}</M> becomes more predictable.
            </p>
          </ConceptCard>

          <ConceptCard title="What does C (downweighting constant) actually do?">
            <p>
              <M color="#3b82f6">{'C'}</M> scales the draft probability of the top-<M>{'F'}</M> cache tokens:
            </p>
            <MathBlock>{'p_{\\text{draft}}(t) = \\begin{cases} p_{\\text{original}}(t) \\times C & \\text{if } t \\in \\text{cache tokens} \\\\ p_{\\text{original}}(t) & \\text{otherwise} \\end{cases}'}</MathBlock>
            <p>
              then renormalizes.
            </p>
            <p>
              <M color="#22c55e">{'C = 1'}</M> gives standard SD: high acceptance, small residual gap. As <M>{'C \\to 0'}</M>, cache tokens are suppressed in the draft, the gap moves onto them, hit rate rises, and acceptance falls.
            </p>
          </ConceptCard>

          <ConceptCard title="The core tradeoff: acceptance rate vs cache hit rate">
            <p>
              <M color="#22c55e">{'\\alpha'}</M> (acceptance rate) <M>{'= \\sum_t \\min\\bigl(p_{\\text{target}}(t),\\, p_{\\text{draft}}(t)\\bigr)'}</M>
              — the probability a draft token passes verification.
            </p>
            <p>
              <M color="#8b5cf6">{'p_{\\text{hit}}'}</M> (cache hit rate) = estimated probability that a rejected token
              yields a cache-backed bonus continuation. In this panel it is shown as a bonus-token proxy, not the full Section 2 continuation-hit calculation over all <M>{'(\\text{pos}, t^*)'}</M> outcomes.
            </p>
            <p>
              Lowering <M>{'C'}</M> usually raises <M>{'p_{\\text{hit}}'}</M> but lowers <M>{'\\alpha'}</M>. The useful setting is the one that maximizes throughput:
            </p>
            <MathBlock>{'\\text{Throughput} \\propto \\frac{\\alpha \\cdot K + 1}{T_{\\text{verify}} + (1 - p_{\\text{hit}}) \\cdot T_{\\text{fallback}}}'}</MathBlock>
          </ConceptCard>

          <ConceptCard title="What are F (fan-out) and temperature?">
            <p>
              <M color="#8b5cf6">{'F'}</M> is the number of top tokens treated as cache tokens. Larger <M>{'F'}</M> gives more coverage but costs more budget.
            </p>
            <p>
              <M>{'T'}</M> controls entropy. Low <M>{'T'}</M> is easy to predict; high <M>{'T'}</M> spreads mass across many tokens, so Saguaro helps more.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
