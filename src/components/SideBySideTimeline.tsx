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
const CACHE_BADGE_WIDTH = 38
const CACHE_BADGE_HEIGHT = 18
const CACHE_ROW_GAP = 10
const AXIS_GAP = 22
const ROUND_PILL_WIDTH = 22
const ROUND_PILL_HEIGHT = 14
const ROUND_PILL_MIN_WIDTH = 34
const MARGIN = { top: 40, right: 40, bottom: 30, left: 80 }

function RoundPill({
  x,
  y,
  width,
  label,
  accent,
}: {
  x: number
  y: number
  width: number
  label: string
  accent: string
}) {
  const inside = width >= ROUND_PILL_MIN_WIDTH
  const pillX = inside
    ? x + 5
    : Math.max(MARGIN.left, x + width / 2 - ROUND_PILL_WIDTH / 2)
  const pillY = inside ? y + 4 : y - ROUND_PILL_HEIGHT - 4

  return (
    <g pointerEvents="none">
      <rect
        x={pillX}
        y={pillY}
        width={ROUND_PILL_WIDTH}
        height={ROUND_PILL_HEIGHT}
        rx={4}
        fill={inside ? COLORS.surface : COLORS.surface3}
        fillOpacity={inside ? 0.45 : 1}
        stroke={accent}
        strokeOpacity={inside ? 0.35 : 0.8}
        strokeWidth={1}
      />
      <text
        x={pillX + ROUND_PILL_WIDTH / 2}
        y={pillY + ROUND_PILL_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={8}
        fontWeight="bold"
      >
        {label}
      </text>
    </g>
  )
}

export function SideBySideTimeline() {
  const [alpha, setAlpha] = useState(0.7)
  const [pHit, setPHit] = useState(0.8)
  const [draftLatency, setDraftLatency] = useState(0.3)
  const [seed, setSeed] = useState(0)

  const regenerate = useCallback(() => {
    const roundToStep = (value: number) => Math.round(value * 100) / 100
    setAlpha(roundToStep(0.1 + Math.random() * 0.9))
    setPHit(roundToStep(Math.random()))
    setDraftLatency(roundToStep(0.1 + Math.random() * 0.7))
    setSeed(s => s + 1)
  }, [])

  const { sdRounds, ssdRounds, sdThroughput, ssdThroughput, speedup, maxTime } = useMemo(() => {
    const makeRng = (initialSeed: number) => {
      let s = initialSeed * 9301 + 49297
      return () => {
        s = (s * 9301 + 49297) % 233280
        return s / 233280
      }
    }

    const sd = simulateSD({ rounds: ROUNDS, K, alpha, draftLatency, verifyLatency: 1, rng: makeRng(seed) })
    const ssd = simulateSSD({ rounds: ROUNDS, K, alpha, pHit, draftLatency, verifyLatency: 1, rng: makeRng(seed) })

    const sdT = throughput(sd)
    const ssdT = throughput(ssd)
    const mt = Math.max(
      ...sd.map(r => Math.max(r.verifyEnd, r.draftEnd)),
      ...ssd.map(r => Math.max(r.verifyEnd, r.draftEnd))
    )
    return { sdRounds: sd, ssdRounds: ssd, sdThroughput: sdT, ssdThroughput: ssdT, speedup: ssdT / sdT, maxTime: mt }
  }, [alpha, pHit, draftLatency, seed])

  const width = 800
  const chartHeight = 2 * (BAR_HEIGHT * 2 + ROW_GAP) + 96
  const totalHeight = MARGIN.top + chartHeight + MARGIN.bottom

  const xScale = (t: number) => MARGIN.left + (t / maxTime) * (width - MARGIN.left - MARGIN.right)

  return (
    <SectionHeader
      number={6}
      title="SD vs SSD Side-by-Side Timeline"
      subtitle="Gantt chart comparing sequential SD with overlapping SSD"
      tooltip="SD is sequential; SSD overlaps drafting and verification."
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
            const draftX = xScale(r.draftStart)
            const verifyX = xScale(r.verifyStart)
            const draftW = xScale(r.draftEnd) - xScale(r.draftStart)
            const verifyW = xScale(r.verifyEnd) - xScale(r.verifyStart)
            return (
              <g key={`sd-${i}`}>
                <motion.rect
                    initial={{ width: 0 }}
                    animate={{ width: draftW }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    x={draftX} y={MARGIN.top} height={BAR_HEIGHT} rx={4}
                    fill={COLORS.draft} opacity={0.9}
                  >
                    <title>{`Round ${i + 1}: Draft ${K} tokens (${(r.draftEnd - r.draftStart).toFixed(2)} time units)`}</title>
                  </motion.rect>
                <RoundPill x={draftX} y={MARGIN.top} width={draftW} label={`R${i + 1}`} accent={COLORS.draftLight} />
                <motion.rect
                    initial={{ width: 0 }}
                    animate={{ width: verifyW }}
                    transition={{ duration: 0.5, delay: i * 0.15 + 0.1 }}
                    x={verifyX} y={MARGIN.top + BAR_HEIGHT + 4} height={BAR_HEIGHT} rx={4}
                    fill={COLORS.verify} opacity={0.9}
                  >
                    <title>{`Round ${i + 1}: Verify - accepted ${r.accepted}/${K} tokens`}</title>
                  </motion.rect>
                <RoundPill x={verifyX} y={MARGIN.top + BAR_HEIGHT + 4} width={verifyW} label={`R${i + 1}`} accent={COLORS.verifyLight} />
                {verifyW > 20 && (
                  <text
                    x={verifyX + verifyW / 2}
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
            const cacheY = ssdY + BAR_HEIGHT * 2 + 4 + CACHE_ROW_GAP
            const axisY = cacheY + CACHE_BADGE_HEIGHT + AXIS_GAP
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
                <text x={MARGIN.left - 8} y={cacheY + CACHE_BADGE_HEIGHT / 2} textAnchor="end" fill={COLORS.cacheHit} fontSize={9} dominantBaseline="middle">
                  Cache
                </text>

                {ssdRounds.map((r, i) => {
                  const draftX = xScale(r.draftStart)
                  const verifyX = xScale(r.verifyStart)
                  const verifyW = xScale(r.verifyEnd) - xScale(r.verifyStart)
                  const draftW = xScale(r.draftEnd) - xScale(r.draftStart)
                  const verifyRoundLabel = `R${i + 1}`
                  const draftRoundLabel = `R${i + 2}`
                  return (
                    <g key={`ssd-${i}`}>
                      <motion.rect
                          initial={{ width: 0 }}
                          animate={{ width: draftW }}
                          transition={{ duration: 0.5, delay: i * 0.15 }}
                          x={draftX} y={ssdY} height={BAR_HEIGHT} rx={4}
                          fill={COLORS.draft} opacity={0.9}
                        >
                          <title>{`Preparing ${draftRoundLabel} in parallel while the verifier resolves ${verifyRoundLabel}`}</title>
                        </motion.rect>
                      <RoundPill x={draftX} y={ssdY} width={draftW} label={draftRoundLabel} accent={COLORS.draftLight} />
                      <motion.rect
                          initial={{ width: 0 }}
                          animate={{ width: verifyW }}
                          transition={{ duration: 0.5, delay: i * 0.15 + 0.05 }}
                          x={verifyX} y={ssdY + BAR_HEIGHT + 4} height={BAR_HEIGHT} rx={4}
                          fill={COLORS.verify} opacity={0.9}
                        >
                          <title>{`Verifying ${verifyRoundLabel} - ${r.accepted}/${K} accepted, cache ${r.cacheHit ? 'HIT' : 'MISS'}`}</title>
                        </motion.rect>
                      <RoundPill x={verifyX} y={ssdY + BAR_HEIGHT + 4} width={verifyW} label={verifyRoundLabel} accent={COLORS.verifyLight} />
                      {verifyW > 20 && (
                        <text
                          x={verifyX + verifyW / 2}
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

                {/* Cache status badges are rendered in a separate row so overlapping verify blocks never cover them. */}
                {ssdRounds.map((r, i) => {
                  const desiredX = xScale(r.verifyEnd) + 6
                  const badgeX = Math.min(desiredX, width - MARGIN.right - CACHE_BADGE_WIDTH)
                  const badgeCenterX = badgeX + CACHE_BADGE_WIDTH / 2
                  const verifyBottomY = ssdY + BAR_HEIGHT * 2 + 4

                  return (
                    <g key={`ssd-cache-${i}`}>
                      <title>{r.cacheHit
                        ? 'Cache HIT — next round starts immediately, zero idle time'
                        : 'Cache MISS — fallback speculator must generate new tokens (small delay)'
                      }</title>
                      <line
                        x1={xScale(r.verifyEnd)}
                        y1={verifyBottomY}
                        x2={badgeCenterX}
                        y2={cacheY}
                        stroke={r.cacheHit ? COLORS.cacheHit : COLORS.cacheMiss}
                        strokeWidth={1.5}
                        opacity={0.8}
                      />
                      <rect
                        x={badgeX}
                        y={cacheY}
                        width={CACHE_BADGE_WIDTH}
                        height={CACHE_BADGE_HEIGHT}
                        rx={5}
                        fill={r.cacheHit ? COLORS.cacheHit : COLORS.cacheMiss}
                        stroke="white"
                        strokeOpacity={0.75}
                        strokeWidth={1}
                      />
                      <text
                        x={badgeCenterX}
                        y={cacheY + CACHE_BADGE_HEIGHT / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={7}
                        fontWeight="bold"
                        letterSpacing={0.4}
                      >
                        {r.cacheHit ? 'HIT' : 'MISS'}
                      </text>
                    </g>
                  )
                })}

                {/* Time axis */}
                <line
                  x1={MARGIN.left} y1={axisY}
                  x2={width - MARGIN.right} y2={axisY}
                  stroke={COLORS.border} strokeWidth={1}
                />
                <text
                  x={width / 2} y={axisY + 16}
                  textAnchor="middle" fill={COLORS.textDim} fontSize={11}
                >
                  Time →
                </text>
              </>
            )
          })()}
        </svg>

        <div className="mt-2 text-xs text-text-dim">
          SSD is shown in steady state: the verifier is resolving <M>{'R_t'}</M> while the draft lane prepares <M>{'R_{t+1}'}</M>.
          The initial bootstrap draft for <M>{'R_1'}</M> is omitted.
        </div>

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
              Each method has two lanes: <M color="#f59e0b">{'\\text{Draft}'}</M> and <M color="#3b82f6">{'\\text{Verify}'}</M>. The x-axis is time.
            </p>
            <p>
              In <strong>SD</strong>, draft and verify alternate. In <strong>SSD</strong>, they overlap: while verify handles <M>{'R_t'}</M>, the speculator prepares <M>{'R_{t+1}'}</M>. A cache hit keeps that pipeline moving; a miss inserts fallback delay.
            </p>
          </ConceptCard>

          <ConceptCard title="What do the sliders control?">
            <p>
              <M color="#22c55e">{'\\alpha'}</M> sets how many of the <M>{'K'}</M> draft tokens are accepted. <M color="#8b5cf6">{'p_{\\text{hit}}'}</M> affects only SSD. <M color="#f59e0b">{'T_{\\text{draft}} / T_{\\text{verify}}'}</M> sets draft cost.
            </p>
            <MathBlock>{'\\text{SD: } \\frac{\\alpha K + 1}{T_{\\text{draft}} + T_{\\text{verify}}} \\qquad \\text{SSD: } \\frac{\\alpha K + 1}{T_{\\text{verify}} + (1-p_{\\text{hit}}) \\cdot T_{\\text{fallback}}}'}</MathBlock>
            <p>
              SSD removes draft time from the critical path and replaces it with miss-dependent fallback time.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
