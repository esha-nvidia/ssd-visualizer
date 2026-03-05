import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { simulateSD, simulateSSD, throughput } from '../lib/ssd'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Legend } from './shared/Legend'
import { Tooltip } from './shared/Tooltip'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

const ROUNDS = 6
const K = 4
const BAR_HEIGHT = 32
const ROW_GAP = 16
const MARGIN = { top: 40, right: 40, bottom: 30, left: 80 }

export function SideBySideTimeline() {
  const [alpha, setAlpha] = useState(0.7)
  const [pHit, setPHit] = useState(0.8)
  const [draftLatency, setDraftLatency] = useState(0.3)
  const [seed, setSeed] = useState(0)

  const regenerate = useCallback(() => setSeed(s => s + 1), [])

  const { sdRounds, ssdRounds, sdThroughput, ssdThroughput, speedup, maxTime } = useMemo(() => {
    const origRandom = Math.random
    let s = seed * 9301 + 49297
    Math.random = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }

    const sd = simulateSD({ rounds: ROUNDS, K, alpha, draftLatency, verifyLatency: 1 })
    Math.random = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    const ssd = simulateSSD({ rounds: ROUNDS, K, alpha, pHit, draftLatency, verifyLatency: 1 })
    Math.random = origRandom

    const sdT = throughput(sd)
    const ssdT = throughput(ssd)
    const mt = Math.max(
      ...sd.map(r => Math.max(r.verifyEnd, r.draftEnd)),
      ...ssd.map(r => Math.max(r.verifyEnd, r.draftEnd))
    )
    return { sdRounds: sd, ssdRounds: ssd, sdThroughput: sdT, ssdThroughput: ssdT, speedup: ssdT / sdT, maxTime: mt }
  }, [alpha, pHit, draftLatency, seed])

  const width = 800
  const chartHeight = 2 * (BAR_HEIGHT * 2 + ROW_GAP) + 60
  const totalHeight = MARGIN.top + chartHeight + MARGIN.bottom

  const xScale = (t: number) => MARGIN.left + (t / maxTime) * (width - MARGIN.left - MARGIN.right)

  return (
    <SectionHeader
      number={6}
      title="SD vs SSD Side-by-Side Timeline"
      subtitle="Gantt chart comparing sequential SD with overlapping SSD"
      tooltip="Standard SD drafts then verifies sequentially. SSD overlaps them."
      referenceFigure="./reference-figures/fig7-end-to-end.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
          <div className="w-48">
            <Slider label="Acceptance rate" value={alpha} onChange={setAlpha} min={0.1} max={1}
              tooltip="Probability each draft token is accepted by the verifier" />
          </div>
          <div className="w-48">
            <Slider label="Cache hit rate" value={pHit} onChange={setPHit} min={0} max={1}
              tooltip="Probability the speculation cache contains the correct pre-computed speculation (SSD only)" />
          </div>
          <div className="w-48">
            <Slider label="Draft/Verify ratio" value={draftLatency} onChange={setDraftLatency} min={0.1} max={0.8}
              tooltip="Ratio of draft model latency to verify model latency" />
          </div>
          <button
            onClick={regenerate}
            className="px-3 py-1 text-xs rounded-lg bg-surface-3 text-text-dim hover:text-text border border-border transition-colors self-end"
          >
            Re-roll
          </button>
        </div>

        <svg width={width} height={totalHeight} className="w-full" viewBox={`0 0 ${width} ${totalHeight}`}>
          {/* SD section */}
          <text x={MARGIN.left - 8} y={MARGIN.top - 6} textAnchor="end" fill={COLORS.textDim} fontSize={12} dominantBaseline="middle" fontWeight="bold">
            SD
          </text>
          <text x={MARGIN.left - 8} y={MARGIN.top + BAR_HEIGHT / 2} textAnchor="end" fill={COLORS.draftLight} fontSize={9} dominantBaseline="middle">
            Draft
          </text>
          <text x={MARGIN.left - 8} y={MARGIN.top + BAR_HEIGHT + 4 + BAR_HEIGHT / 2} textAnchor="end" fill={COLORS.verifyLight} fontSize={9} dominantBaseline="middle">
            Verify
          </text>

          {sdRounds.map((r, i) => {
            const draftW = xScale(r.draftEnd) - xScale(r.draftStart)
            const verifyW = xScale(r.verifyEnd) - xScale(r.verifyStart)
            return (
              <g key={`sd-${i}`}>
                <Tooltip content={`Round ${i + 1}: Draft ${K} tokens (${(r.draftEnd - r.draftStart).toFixed(2)} time units)`}>
                  <motion.rect
                    initial={{ width: 0 }}
                    animate={{ width: draftW }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    x={xScale(r.draftStart)} y={MARGIN.top} height={BAR_HEIGHT} rx={4}
                    fill={COLORS.draft} opacity={0.9}
                  />
                </Tooltip>
                <Tooltip content={`Round ${i + 1}: Verify - accepted ${r.accepted}/${K} tokens`}>
                  <motion.rect
                    initial={{ width: 0 }}
                    animate={{ width: verifyW }}
                    transition={{ duration: 0.5, delay: i * 0.15 + 0.1 }}
                    x={xScale(r.verifyStart)} y={MARGIN.top + BAR_HEIGHT + 4} height={BAR_HEIGHT} rx={4}
                    fill={COLORS.verify} opacity={0.9}
                  />
                </Tooltip>
                {verifyW > 20 && (
                  <text
                    x={xScale(r.verifyStart) + verifyW / 2}
                    y={MARGIN.top + BAR_HEIGHT + 4 + BAR_HEIGHT / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize={10} fontWeight="bold"
                  >
                    {r.accepted}/{K}
                  </text>
                )}
              </g>
            )
          })}

          {/* SSD section */}
          {(() => {
            const ssdY = MARGIN.top + BAR_HEIGHT * 2 + ROW_GAP + 40
            return (
              <>
                <text x={MARGIN.left - 8} y={ssdY - 6} textAnchor="end" fill={COLORS.textDim} fontSize={12} dominantBaseline="middle" fontWeight="bold">
                  SSD
                </text>
                <text x={MARGIN.left - 8} y={ssdY + BAR_HEIGHT / 2} textAnchor="end" fill={COLORS.draftLight} fontSize={9} dominantBaseline="middle">
                  Draft
                </text>
                <text x={MARGIN.left - 8} y={ssdY + BAR_HEIGHT + 4 + BAR_HEIGHT / 2} textAnchor="end" fill={COLORS.verifyLight} fontSize={9} dominantBaseline="middle">
                  Verify
                </text>

                {ssdRounds.map((r, i) => {
                  const verifyW = xScale(r.verifyEnd) - xScale(r.verifyStart)
                  const draftW = xScale(r.draftEnd) - xScale(r.draftStart)
                  return (
                    <g key={`ssd-${i}`}>
                      <Tooltip content={`Round ${i + 1}: Draft (parallel) + cache speculation`}>
                        <motion.rect
                          initial={{ width: 0 }}
                          animate={{ width: draftW }}
                          transition={{ duration: 0.5, delay: i * 0.15 }}
                          x={xScale(r.draftStart)} y={ssdY} height={BAR_HEIGHT} rx={4}
                          fill={COLORS.draft} opacity={0.9}
                        />
                      </Tooltip>
                      <Tooltip content={`Round ${i + 1}: Verify - ${r.accepted}/${K} accepted, cache ${r.cacheHit ? 'HIT' : 'MISS'}`}>
                        <motion.rect
                          initial={{ width: 0 }}
                          animate={{ width: verifyW }}
                          transition={{ duration: 0.5, delay: i * 0.15 + 0.05 }}
                          x={xScale(r.verifyStart)} y={ssdY + BAR_HEIGHT + 4} height={BAR_HEIGHT} rx={4}
                          fill={COLORS.verify} opacity={0.9}
                        />
                      </Tooltip>
                      {/* Cache hit/miss label to the right of verify block */}
                      <Tooltip content={r.cacheHit
                        ? 'Cache HIT — next round starts immediately, zero idle time'
                        : 'Cache MISS — fallback speculator must generate new tokens (small delay)'
                      }>
                        <g>
                          <rect
                            x={xScale(r.verifyEnd) + 3}
                            y={ssdY + BAR_HEIGHT + 4 + (BAR_HEIGHT - 16) / 2}
                            width={30}
                            height={16}
                            rx={4}
                            fill={r.cacheHit ? COLORS.cacheHit : COLORS.cacheMiss}
                          />
                          <text
                            x={xScale(r.verifyEnd) + 18}
                            y={ssdY + BAR_HEIGHT + 4 + BAR_HEIGHT / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fill="white" fontSize={7} fontWeight="bold"
                          >
                            {r.cacheHit ? 'HIT' : 'MISS'}
                          </text>
                        </g>
                      </Tooltip>
                      {verifyW > 20 && (
                        <text
                          x={xScale(r.verifyStart) + verifyW / 2}
                          y={ssdY + BAR_HEIGHT + 4 + BAR_HEIGHT / 2}
                          textAnchor="middle" dominantBaseline="middle"
                          fill="white" fontSize={10} fontWeight="bold"
                        >
                          {r.accepted}/{K}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* Time axis */}
                <line
                  x1={MARGIN.left} y1={ssdY + BAR_HEIGHT * 2 + 20}
                  x2={width - MARGIN.right} y2={ssdY + BAR_HEIGHT * 2 + 20}
                  stroke={COLORS.border} strokeWidth={1}
                />
                <text
                  x={width / 2} y={ssdY + BAR_HEIGHT * 2 + 36}
                  textAnchor="middle" fill={COLORS.textDim} fontSize={11}
                >
                  Time →
                </text>
              </>
            )
          })()}
        </svg>

        <div className="flex items-center justify-between mt-4">
          <Legend
            items={[
              { color: COLORS.draft, label: 'Draft (speculate)', tooltip: 'Draft model generates candidate tokens' },
              { color: COLORS.verify, label: 'Verify', tooltip: 'Target model verifies draft tokens' },
              { color: COLORS.cacheHit, label: 'Cache hit', tooltip: 'Pre-computed speculation matched' },
              { color: COLORS.cacheMiss, label: 'Cache miss', tooltip: 'Fallback speculator needed' },
            ]}
          />
          <div className="flex gap-4 text-sm">
            <Tooltip content="Tokens generated per unit time for standard Speculative Decoding">
              <div className="text-text-dim">
                SD: <span className="text-text font-mono">{sdThroughput.toFixed(2)}</span> tok/t
              </div>
            </Tooltip>
            <Tooltip content="Tokens generated per unit time for Speculative Speculative Decoding">
              <div className="text-text-dim">
                SSD: <span className="text-text font-mono">{ssdThroughput.toFixed(2)}</span> tok/t
              </div>
            </Tooltip>
            <Tooltip content="How much faster SSD is compared to standard SD">
              <div className="text-verify font-bold">
                {speedup.toFixed(2)}x
              </div>
            </Tooltip>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <ConceptCard title="Reading the Gantt chart: SD vs SSD" defaultOpen>
            <p>
              Each section shows two lanes: <M color="#f59e0b">{'\\text{Draft}'}</M> and{' '}
              <M color="#3b82f6">{'\\text{Verify}'}</M>. The x-axis is time.
            </p>
            <p>
              In <strong>SD</strong> (top): draft → verify → draft → verify (sequential).
              The verifier sits idle while drafting, and vice versa.
            </p>
            <p>
              In <strong>SSD</strong> (bottom): draft and verify blocks <em>overlap</em>. On a{' '}
              <M color="#8b5cf6">{'\\text{HIT}'}</M>, the transition is seamless. On a{' '}
              <M color="#6b7280">{'\\text{MISS}'}</M>, there's a small gap for the fallback.
            </p>
          </ConceptCard>

          <ConceptCard title="What do the sliders control?">
            <p>
              <M color="#22c55e">{'\\alpha'}</M> (acceptance rate): fraction of <M>{'K'}</M> draft tokens accepted per round
              (shown as "3/4" inside verify blocks).
            </p>
            <p>
              <M color="#8b5cf6">{'p_{\\text{hit}}'}</M> (cache hit rate): how often SSD finds a matching speculation. Only affects SSD.
            </p>
            <p>
              <M color="#f59e0b">{'T_{\\text{draft}} / T_{\\text{verify}}'}</M> (draft/verify ratio): how fast the draft model is. Smaller = faster draft.
            </p>
            <MathBlock>{'\\text{SD: } \\frac{\\alpha K + 1}{T_{\\text{draft}} + T_{\\text{verify}}} \\qquad \\text{SSD: } \\frac{\\alpha K + 1}{T_{\\text{verify}} + (1-p_{\\text{hit}}) \\cdot T_{\\text{fallback}}}'}</MathBlock>
            <p>
              SSD removes <M>{'T_{\\text{draft}}'}</M> from the denominator (it runs in parallel), replacing it with
              the smaller <M>{'(1-p_{\\text{hit}}) \\cdot T_{\\text{fallback}}'}</M> term.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
