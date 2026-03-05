import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { geometricFanout, uniformFanout } from '../lib/distributions'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Toggle } from './shared/Toggle'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

const NODE_SIZE = 28
const LEVEL_HEIGHT = 70
const MIN_SPACING = 36

export function SpeculationCache() {
  const [alpha, setAlpha] = useState(0.7)
  const [budget, setBudget] = useState(12)
  const [K, setK] = useState(4)
  const [useGeometric, setUseGeometric] = useState(true)
  const [highlightK, setHighlightK] = useState<number | null>(null)

  const fanout = useMemo(() => {
    return useGeometric
      ? geometricFanout(K, budget, alpha)
      : uniformFanout(K, budget)
  }, [K, budget, alpha, useGeometric])

  const hitRate = useMemo(() => {
    let hit = 0
    for (let k = 0; k < K; k++) {
      const pAccepted = Math.pow(alpha, k) * (1 - alpha)
      hit += pAccepted * Math.min(fanout[k] / 10, 1)
    }
    return Math.min(hit * 3, 0.99)
  }, [K, alpha, fanout])

  const tree = useMemo(() => {
    const buildLevel = (depth: number, parentX: number) => {
      if (depth >= K) return []
      const f = fanout[depth]
      const totalWidth = f * MIN_SPACING
      const startX = parentX - totalWidth / 2 + MIN_SPACING / 2
      return Array.from({ length: f }, (_, i) => ({
        x: startX + i * MIN_SPACING,
        y: (depth + 1) * LEVEL_HEIGHT,
        depth,
        fanoutCount: f,
      }))
    }
    return { fanout, levels: Array.from({ length: K }, (_, d) => buildLevel(d, 400)) }
  }, [K, fanout])

  const svgWidth = 800
  const svgHeight = (K + 1) * LEVEL_HEIGHT + 40

  return (
    <SectionHeader
      number={2}
      title="Speculation Cache & Verification Outcome Prediction"
      subtitle="How Saguaro decides which verification outcomes to pre-speculate for"
      tooltip="Section 4.1: The speculator builds a cache of pre-computed speculations for predicted verification outcomes (k, t*). Geometric fan-out (Theorem 12) allocates more branches to likely outcomes."
      referenceFigure="./reference-figures/fig2-cache-schematic.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-44">
            <Slider label="Acceptance rate" value={alpha} onChange={setAlpha} min={0.1} max={0.99}
              tooltip="Higher acceptance rate shifts the geometric distribution toward earlier positions." />
          </div>
          <div className="w-44">
            <Slider label="Cache budget B" value={budget} onChange={v => setBudget(Math.round(v))} min={4} max={24} step={1}
              formatValue={v => String(Math.round(v))}
              tooltip="Total number of pre-computed speculations across all positions." />
          </div>
          <div className="w-44">
            <Slider label="Lookahead K" value={K} onChange={v => setK(Math.round(v))} min={2} max={6} step={1}
              formatValue={v => String(Math.round(v))}
              tooltip="Number of tokens the draft model speculates ahead." />
          </div>
          <Toggle
            label={useGeometric ? 'Geometric' : 'Uniform'}
            checked={useGeometric}
            onChange={setUseGeometric}
            tooltip="Geometric fan-out (Theorem 12) allocates branches proportional to P(accepted >= k). Uniform splits equally."
          />
        </div>

        <div className="mb-4 p-3 rounded-lg bg-surface-3 border border-border">
          <div className="text-xs text-text-dim mb-2 font-medium">Fan-out allocation per position</div>
          <div className="flex gap-2 items-end h-16">
            {fanout.map((f, i) => (
              <Tooltip
                key={i}
                content={
                  <div>
                    <div className="font-medium">Position k={i}</div>
                    <div>Fan-out F<sub>{i}</sub> = {f}</div>
                    <div className="text-text-dim">
                      {useGeometric
                        ? `P(accepted >= ${i}) = ${Math.pow(alpha, i).toFixed(3)}`
                        : 'Uniform: equal allocation'}
                    </div>
                  </div>
                }
              >
                <motion.div
                  className="flex-1 rounded-t-md cursor-default flex items-end justify-center"
                  style={{ backgroundColor: highlightK === i ? COLORS.cacheHit : COLORS.verify }}
                  animate={{ height: `${(f / Math.max(...fanout)) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  onMouseEnter={() => setHighlightK(i)}
                  onMouseLeave={() => setHighlightK(null)}
                >
                  <span className="text-white text-xs font-bold pb-1">{f}</span>
                </motion.div>
              </Tooltip>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            {fanout.map((_, i) => (
              <div key={i} className="flex-1 text-center text-[10px] text-text-dim font-mono">k={i}</div>
            ))}
          </div>
        </div>

        <svg width={svgWidth} height={svgHeight} className="w-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <g>
            <title>Current speculation s^T = (s_1, ..., s_K). The tree branches represent pre-computed speculations for different verification outcomes.</title>
            <circle cx={svgWidth / 2} cy={20} r={NODE_SIZE / 2} fill={COLORS.draft} />
            <text x={svgWidth / 2} y={24} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">s^T</text>
          </g>

          {tree.levels.map((nodes, depth) => (
            <g key={depth}>
              {nodes.map((node, i) => {
                const parentX = svgWidth / 2
                const isHighlighted = highlightK === depth
                return (
                  <g key={`${depth}-${i}`}>
                    <motion.line
                      x1={parentX}
                      y1={depth === 0 ? 20 + NODE_SIZE / 2 : node.y - LEVEL_HEIGHT + NODE_SIZE / 2}
                      x2={node.x}
                      y2={node.y - NODE_SIZE / 2}
                      stroke={isHighlighted ? COLORS.cacheHit : COLORS.border}
                      strokeWidth={isHighlighted ? 2 : 1}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.6 }}
                      transition={{ duration: 0.3, delay: depth * 0.1 + i * 0.02 }}
                    />
                    <g>
                      <title>{`Cache slot for outcome at position ${depth}, branch ${i + 1}/${node.fanoutCount}`}</title>
                      <motion.circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_SIZE / 2 - 2}
                        fill={isHighlighted ? COLORS.cacheHit : COLORS.surface3}
                        stroke={isHighlighted ? COLORS.cacheHit : COLORS.border}
                        strokeWidth={1.5}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: depth * 0.1 + i * 0.02 }}
                      />
                    </g>
                  </g>
                )
              })}
              <text
                x={20}
                y={(depth + 1) * LEVEL_HEIGHT}
                fill={COLORS.textDim}
                fontSize={10}
                dominantBaseline="middle"
                fontWeight={highlightK === depth ? 'bold' : 'normal'}
              >
                k={depth}
              </text>
            </g>
          ))}
        </svg>

        <div className="flex items-center justify-between mt-3 mb-4">
          <Legend
            items={[
              { color: COLORS.draft, label: 'Root (current speculation)', tooltip: 'The K draft tokens sent to the verifier' },
              { color: COLORS.surface3, label: 'Cache slot', tooltip: 'Pre-computed speculation for a specific verification outcome' },
              { color: COLORS.cacheHit, label: 'Highlighted position', tooltip: 'Hover over fan-out bars to highlight tree level' },
            ]}
          />
          <Tooltip content="Estimated probability that the cache contains a matching pre-computed speculation">
            <div className="text-sm">
              <span className="text-text-dim">Predicted hit rate: </span>
              <span className="text-verify font-bold font-mono">{(hitRate * 100).toFixed(1)}%</span>
            </div>
          </Tooltip>
        </div>

        <div className="space-y-2">
          <ConceptCard title="Key terms: K, B, F_k, and the verification outcome (k, t*)" defaultOpen>
            <p>
              <M>{'K'}</M> = <strong>speculation lookahead</strong> — the number of tokens the draft model generates ahead.
              Longer <M>{'K'}</M> means more potential speedup per round, but harder to predict.
            </p>
            <p>
              <M>{'B'}</M> = <strong>cache budget</strong> — total number of pre-computed speculations stored.
              Each slot costs compute, so <M>{'B'}</M> is limited by how much parallel work fits during verification.
            </p>
            <p>
              <M>{'F_k'}</M> = <strong>fan-out at position <M>{'k'}</M></strong> — how many bonus-token guesses are cached
              for the case where exactly <M>{'k'}</M> tokens are accepted. The budget constraint:
            </p>
            <MathBlock>{'B = \\sum_{k=0}^{K-1} F_k'}</MathBlock>
            <p>
              The verification outcome <M color="#3b82f6">{'(k, t^*)'}</M> is what the verifier returns:
              <M>{'k'}</M> consecutive tokens accepted, plus bonus token <M>{'t^*'}</M>. The cache needs to have
              guessed both <M>{'k'}</M> <em>and</em> <M>{'t^*'}</M> correctly for a hit.
            </p>
          </ConceptCard>

          <ConceptCard title="Geometric vs uniform fan-out — why shape matters (Theorem 12)">
            <p>
              <M color="#f59e0b">{'\\text{Uniform}'}</M> splits the budget equally: each position gets <M>{'B/K'}</M> slots.
              This wastes budget on unlikely outcomes.
            </p>
            <p>
              <M color="#8b5cf6">{'\\text{Geometric}'}</M> (Theorem 12) allocates proportional to
              the probability of each acceptance length. Since acceptance is approximately geometric:
            </p>
            <MathBlock>{'P(\\text{accepted} = k) \\approx \\alpha^k \\cdot (1 - \\alpha) \\quad \\Rightarrow \\quad F_k \\propto \\alpha^k'}</MathBlock>
            <p>
              When <M color="#22c55e">{'\\alpha'}</M> is high, geometric puts more budget
              at large <M>{'k'}</M> (you'll usually accept many tokens). When <M>{'\\alpha'}</M> is low, it focuses on small <M>{'k'}</M>.
              Toggle between the two above and watch the tree reshape.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
