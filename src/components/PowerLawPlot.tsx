import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { powerLawMissRate } from '../lib/distributions'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Toggle } from './shared/Toggle'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

const CHART_WIDTH = 700
const CHART_HEIGHT = 320
const MARGIN = { top: 20, right: 30, bottom: 45, left: 55 }
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

const TEMPERATURES = [
  { T: 0, color: '#22c55e', label: 'T=0 (greedy)' },
  { T: 0.7, color: '#3b82f6', label: 'T=0.7' },
  { T: 1.0, color: '#f59e0b', label: 'T=1.0' },
]

const F_RANGE = Array.from({ length: 30 }, (_, i) => Math.pow(10, 0 + (i / 29) * 2))

export function PowerLawPlot() {
  const [exponent, setExponent] = useState(0.8)
  const [alphaBase, setAlphaBase] = useState(0.7)
  const [showPrimary, setShowPrimary] = useState(true)

  const xLog = (f: number) => (Math.log10(f) / 2) * PLOT_W
  const yLog = (rate: number) => {
    const minLog = -3
    const maxLog = 0
    const log = Math.log10(Math.max(rate, 1e-4))
    return PLOT_H - ((log - minLog) / (maxLog - minLog)) * PLOT_H
  }

  const lines = useMemo(() => {
    return TEMPERATURES.map(({ T, color, label }) => {
      const r = exponent * (1 + T * 0.5)
      const baseline = showPrimary ? (1 - alphaBase * (1 - T * 0.2)) : 1
      const points = F_RANGE.map(F => ({
        F,
        rate: Math.min(powerLawMissRate(F, r, baseline), 1),
        x: xLog(F),
        y: yLog(powerLawMissRate(F, r, baseline)),
      }))
      return { T, color, label, points, r }
    })
  }, [exponent, alphaBase, showPrimary])

  return (
    <SectionHeader
      number={5}
      title="Power-Law Cache Hit Scaling"
      subtitle="Log-log plot: cache miss rate decreases as a power law with fan-out"
      tooltip="Section 4.1.3: The rejection rate follows 1 - p_hit(F) ~ F^(-r)."
      referenceFigure="./reference-figures/fig3-power-law-cache-hits.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-44">
            <Slider label="Exponent r" value={exponent} onChange={setExponent} min={0.2} max={2} step={0.05}
              tooltip="Power-law exponent. Higher r = faster decrease in miss rate with fan-out." />
          </div>
          <div className="w-44">
            <Slider label="Acceptance rate" value={alphaBase} onChange={setAlphaBase} min={0.1} max={0.99}
              tooltip="Base acceptance rate. Affects the baseline miss rate." />
          </div>
          <Toggle
            label={showPrimary ? 'Primary speculator' : 'Backup speculator'}
            checked={showPrimary}
            onChange={setShowPrimary}
            tooltip="Toggle between primary (better draft, lower baseline) and backup speculator."
          />
        </div>

        <svg width={CHART_WIDTH} height={CHART_HEIGHT} className="w-full" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {[0.001, 0.01, 0.1, 1].map(rate => (
              <g key={rate}>
                <line x1={0} y1={yLog(rate)} x2={PLOT_W} y2={yLog(rate)}
                  stroke={COLORS.border} strokeWidth={0.5} strokeDasharray="4 4" />
                <text x={-8} y={yLog(rate)} textAnchor="end" dominantBaseline="middle"
                  fill={COLORS.textDim} fontSize={9} fontFamily="monospace">
                  {rate < 0.01 ? rate.toExponential(0) : rate}
                </text>
              </g>
            ))}

            {[1, 3, 10, 30, 100].map(f => (
              <g key={f}>
                <line x1={xLog(f)} y1={0} x2={xLog(f)} y2={PLOT_H}
                  stroke={COLORS.border} strokeWidth={0.5} strokeDasharray="4 4" />
                <text x={xLog(f)} y={PLOT_H + 16} textAnchor="middle"
                  fill={COLORS.textDim} fontSize={9} fontFamily="monospace">
                  {f}
                </text>
              </g>
            ))}

            <line x1={0} y1={0} x2={0} y2={PLOT_H} stroke={COLORS.border} strokeWidth={1.5} />
            <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke={COLORS.border} strokeWidth={1.5} />

            <text x={PLOT_W / 2} y={PLOT_H + 35} textAnchor="middle" fill={COLORS.textDim} fontSize={11}>
              Fan-out F (log scale)
            </text>
            <text x={-40} y={PLOT_H / 2} textAnchor="middle" fill={COLORS.textDim} fontSize={11}
              transform={`rotate(-90, -40, ${PLOT_H / 2})`}>
              {'Rejection rate 1\u2212p_hit (log)'}
            </text>

            {lines.map(({ color, label, points }) => (
              <g key={label}>
                <motion.path
                  d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${Math.max(0, Math.min(PLOT_H, p.y))}`).join(' ')}
                  fill="none" stroke={color} strokeWidth={2.5}
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }}
                />
                {points.filter((_, i) => i % 3 === 0).map((p, i) => (
                  <g key={i}>
                    <title>{`${label} | F = ${p.F.toFixed(1)} | Miss rate = ${p.rate.toFixed(4)}`}</title>
                    <circle
                      cx={p.x}
                      cy={Math.max(0, Math.min(PLOT_H, p.y))}
                      r={4}
                      fill={color}
                      opacity={0}
                      className="hover:opacity-100 transition-opacity cursor-crosshair"
                    />
                  </g>
                ))}
              </g>
            ))}
          </g>
        </svg>

        <div className="flex items-center justify-between mt-3 mb-4">
          <Legend
            items={TEMPERATURES.map(t => ({
              color: t.color,
              label: t.label,
              tooltip: t.T === 0
                ? 'Greedy decoding: most peaked, easiest for draft to match'
                : `Temperature ${t.T}: ${t.T > 0.7 ? 'high entropy, harder to predict' : 'moderate entropy'}`,
            }))}
          />
          <Tooltip content="The slope on the log-log plot.">
            <div className="text-xs text-text-dim">
              Slopes: {lines.map(l => `${l.label.split(' ')[0]}: r=${l.r.toFixed(2)}`).join(', ')}
            </div>
          </Tooltip>
        </div>

        <div className="space-y-2">
          <ConceptCard title="What does a power law mean here? (Section 4.1.3)" defaultOpen>
            <p>
              The cache miss rate follows a <strong>power law</strong> with fan-out <M>{'F'}</M>:
            </p>
            <MathBlock>{'1 - p_{\\text{hit}}(F) \\approx \\text{baseline} \\times F^{-r}'}</MathBlock>
            <p>
              On a log-log plot, this is a straight line with slope <M>{'-r'}</M>.
              The practical meaning: <em>doubling the fan-out always reduces misses by the same factor</em>,
              specifically <M>{'2^r'}</M>. A steeper slope (larger <M>{'r'}</M>) means each additional cache slot is more valuable.
            </p>
          </ConceptCard>

          <ConceptCard title="What is r (exponent) and what affects it?">
            <p>
              <M>{'r'}</M> is the power-law exponent — the slope on the log-log plot. It depends on:
            </p>
            <p>
              <strong>Draft model quality</strong>: a better draft model predicts the target more accurately,
              so the residual is more concentrated → each fan-out slot is more effective → higher <M>{'r'}</M>.
            </p>
            <p>
              <strong>Temperature</strong>: lower <M>{'T'}</M> → more peaked distribution → easier to predict → higher <M>{'r'}</M>.
              At <M>{'T=0'}</M> (greedy), the target always picks one token, so even small fan-out works.
            </p>
            <p>
              <strong>Primary vs backup</strong>: the primary speculator conditions on having already accepted <M>{'k'}</M> tokens,
              which constrains the residual. The backup has less info, so its <M>{'r'}</M> is typically smaller.
            </p>
          </ConceptCard>

          <ConceptCard title="Why does temperature affect the curves?">
            <p>
              <M color="#22c55e">{'T=0'}</M> (greedy): target puts all mass on one token.
              Even <M>{'F=1'}</M> can hit if that token is cached. The line drops steeply.
            </p>
            <p>
              <M color="#f59e0b">{'T=1.0'}</M>: probability spread over many tokens.
              Need much larger <M>{'F'}</M> to cover likely bonus tokens. Shallower slope.
            </p>
            <p>
              This is why Saguaro's sampling trick (Section 3) matters most at high temperature:
              by concentrating the residual onto cache tokens, Saguaro effectively makes the problem look
              more like low-temperature decoding from the cache's perspective.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
