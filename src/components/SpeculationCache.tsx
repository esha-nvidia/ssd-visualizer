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

function acceptanceOutcomeProbability(alpha: number, pos: number, K: number): number {
  return pos === K ? Math.pow(alpha, K) : Math.pow(alpha, pos) * (1 - alpha)
}

function cacheCoverage(fanout: number, rho: number): number {
  if (fanout <= 0) return 0
  // Definition 11 is 1 - p_hit(F) = 1 / F^rho. We use a shifted version so
  // the small-F regime stays visible while preserving the same power-law shape.
  return 1 - Math.pow(fanout + 1, -rho)
}

export function SpeculationCache() {
  const [alpha, setAlpha] = useState(0.7)
  const [budget, setBudget] = useState(12)
  const [K, setK] = useState(4)
  const [rho, setRho] = useState(0.8)
  const [useGeometric, setUseGeometric] = useState(true)
  const [highlightK, setHighlightK] = useState<number | null>(null)

  const fanout = useMemo(() => {
    return useGeometric
      ? geometricFanout(K, budget, alpha, rho)
      : uniformFanout(K, budget)
  }, [K, budget, alpha, rho, useGeometric])

  const hitRate = useMemo(() => {
    const cachedOutcomeHit = fanout.reduce((hit, fanoutAtPos, pos) => (
      hit + acceptanceOutcomeProbability(alpha, pos, K) * cacheCoverage(fanoutAtPos, rho)
    ), 0)
    return Math.min(cachedOutcomeHit, 0.99)
  }, [K, alpha, fanout, rho])

  const tree = useMemo(() => {
    const buildLevel = (depth: number, parentX: number) => {
      if (depth > K) return []
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
    return { fanout, levels: Array.from({ length: K + 1 }, (_, d) => buildLevel(d, 400)) }
  }, [K, fanout])

  const svgWidth = 800
  const svgHeight = (K + 2) * LEVEL_HEIGHT + 40

  return (
    <SectionHeader
      number={2}
      title="Speculation Cache & Verification Outcome Prediction"
      subtitle="How SSD allocates cache over the K+1 verification outcomes"
      tooltip="Section 4.1, Theorem 12: fan-out spans pos = 0..K and depends on both acceptance rate alpha and power-law exponent rho."
      referenceFigure="./reference-figures/fig2-cache-schematic.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-44">
            <Slider label="Acceptance rate" value={alpha} onChange={setAlpha} min={0.1} max={0.99}
              tooltip="Higher alpha shifts both outcome mass and fan-out toward larger pos. At high alpha, the all-accepted pos = K branch can dominate." />
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
          <div className="w-44">
            <Slider label="Power-law exponent ρ" value={rho} onChange={setRho} min={0.3} max={1.8} step={0.05}
              tooltip="How quickly hit rate improves as fan-out grows. Larger rho makes extra branches more valuable." />
          </div>
          <Toggle
            label={useGeometric ? 'Geometric' : 'Uniform'}
            checked={useGeometric}
            onChange={setUseGeometric}
            tooltip="Theorem 12's geometric allocation depends on alpha and rho. Uniform splits the budget evenly across pos = 0..K."
          />
        </div>

        <svg width={svgWidth} height={svgHeight} className="w-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          {/* Fan-out label */}
          <text x={46} y={14} textAnchor="middle" fill={COLORS.textDim} fontSize={9} fontWeight="medium">
            Fan-out
          </text>

          {/* Root node */}
          <g>
            <title>Current speculation s^T = (s_1, ..., s_K). The tree branches represent pre-computed speculations for different verification outcomes.</title>
            <circle cx={svgWidth / 2} cy={20} r={NODE_SIZE / 2} fill={COLORS.draft} />
            <text x={svgWidth / 2} y={24} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">s^T</text>
          </g>

          {tree.levels.map((nodes, depth) => {
            const isHighlighted = highlightK === depth
            const f = fanout[depth]
            const maxF = Math.max(...fanout)
            const barMaxW = 60
            const barW = (f / maxF) * barMaxW
            const barY = (depth + 1) * LEVEL_HEIGHT - 8
            const barH = 16

            return (
              <g key={depth}>
                {/* Fan-out bar aligned with tree level */}
                <g
                  onMouseEnter={() => setHighlightK(depth)}
                  onMouseLeave={() => setHighlightK(null)}
                  style={{ cursor: 'default' }}
                >
                  <title>{
                    depth === K
                      ? `Accepted count pos=${depth} (all draft tokens accepted) | Fan-out F_pos = ${f}${useGeometric ? ` | Theorem 12 tail term with alpha=${alpha.toFixed(2)}, rho=${rho.toFixed(2)}` : ' | Uniform allocation'}`
                      : `Accepted count pos=${depth} | Fan-out F_pos = ${f}${useGeometric ? ` | Weight ∝ alpha^(${depth}/(1+rho))` : ' | Uniform allocation'}`
                  }</title>
                  <motion.rect
                    x={16}
                    y={barY}
                    height={barH}
                    rx={3}
                    fill={isHighlighted ? COLORS.cacheHit : COLORS.verify}
                    initial={{ width: 0 }}
                    animate={{ width: barW }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                  <text
                    x={16 + barW / 2}
                    y={barY + barH / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={9}
                    fontWeight="bold"
                  >
                    {f > 0 ? f : ''}
                  </text>
                  {/* k= label to the right of the bar */}
                  <text
                    x={16 + barMaxW + 8}
                    y={barY + barH / 2 + 1}
                    fill={isHighlighted ? COLORS.cacheHit : COLORS.textDim}
                    fontSize={10}
                    dominantBaseline="middle"
                    fontWeight={isHighlighted ? 'bold' : 'normal'}
                  >
                    {depth === K ? `pos=${depth} (all)` : `pos=${depth}`}
                  </text>
                </g>

                {/* Tree nodes and edges */}
                {nodes.map((node, i) => {
                  const parentX = svgWidth / 2
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
                        <title>{`Cache slot: ${depth} tokens accepted, branch ${i + 1}/${node.fanoutCount}`}</title>
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
              </g>
            )
          })}
        </svg>

        <div className="flex items-center justify-between mt-3 mb-4">
          <Legend
            items={[
              { color: COLORS.draft, label: 'Root (current speculation)', tooltip: 'The K draft tokens sent to the verifier' },
              { color: COLORS.surface3, label: 'Cache slot', tooltip: 'Pre-computed speculation for a specific verification outcome' },
              { color: COLORS.verify, label: 'Fan-out bar', tooltip: 'Hover to highlight: shows how many cache slots are allocated at each accepted count pos' },
            ]}
          />
          <Tooltip content="Predicted continuation-hit probability under the panel's power-law proxy. It sums over pos = 0..K and asks whether the realized (pos, t*) outcome is covered, including the all-accepted pos = K case.">
            <div className="text-sm">
              <span className="text-text-dim">Predicted hit rate: </span>
              <span className="text-verify font-bold font-mono">{(hitRate * 100).toFixed(1)}%</span>
            </div>
          </Tooltip>
        </div>

        <div className="space-y-2">
          <ConceptCard title="Key terms: K, B, F_pos, and the verification outcome (pos, t*)" defaultOpen>
            <p>
              <M>{'K'}</M> is the lookahead: how many draft tokens are proposed per round. <M>{'B'}</M> is the total cache budget.
            </p>
            <p>
              <M>{'F_{\\text{pos}}'}</M> is the number of cache slots allocated to outcomes with acceptance count <M>{'\\text{pos}'}</M>. The budget constraint is:
            </p>
            <MathBlock>{'B = \\sum_{\\text{pos}=0}^{K} F_{\\text{pos}}'}</MathBlock>
            <p>
              The verifier returns <M color="#3b82f6">{'(\\text{pos}, t^*)'}</M> with <M>{'\\text{pos} \\in \\{0,\\dots,K\\}'}</M>. A cache hit requires both the accepted count and the bonus token to match a cached branch.
            </p>
          </ConceptCard>

          <ConceptCard title="Geometric vs uniform fan-out — why shape matters (Theorem 12)">
            <p>
              <M color="#f59e0b">{'\\text{Uniform}'}</M> splits the budget evenly. <M color="#8b5cf6">{'\\text{Geometric}'}</M> follows Theorem 12, which depends on both acceptance rate and the power-law exponent.
            </p>
            <MathBlock>{'F_{\\text{pos}} \\propto \\alpha^{\\text{pos}/(1+\\rho)} \\;\\; (\\text{pos} < K), \\qquad F_K \\propto \\alpha^{K/(1+\\rho)} (1-\\alpha)^{-1/(1+\\rho)}'}</MathBlock>
            <p>
              For <M>{'\\text{pos} < K'}</M>, the exact accepted-count probabilities still decay geometrically. But as <M>{'\\alpha'}</M> rises, the <M>{'\\text{pos}=K'}</M> all-accepted branch grows quickly and can become one of the most valuable outcomes, so the allocation shifts right.
            </p>
            <p>
              The predicted hit rate here uses the paper's outcome probabilities together with a power-law-style coverage proxy, so it tracks whether the realized <M>{'(\\text{pos}, t^*)'}</M> path is actually covered.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
