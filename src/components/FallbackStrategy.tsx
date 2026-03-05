import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

type BackupType = 'neural' | 'fast' | 'adaptive'

function simulateBatch(
  batchSize: number,
  pHit: number,
  backup: BackupType,
  seed: number
): { lanes: { hit: boolean }[]; stallTime: number; tokPerSeq: number } {
  let s = seed
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }

  const lanes = Array.from({ length: batchSize }, () => ({
    hit: next() < pHit,
  }))

  const anyMiss = lanes.some(l => !l.hit)
  const neuralDelay = 0.8
  const fastDelay = 0.15

  let stallTime = 0
  if (anyMiss) {
    switch (backup) {
      case 'neural': stallTime = neuralDelay; break
      case 'fast': stallTime = fastDelay; break
      case 'adaptive': stallTime = batchSize <= 4 ? neuralDelay : fastDelay; break
    }
  }

  const qualityFactor = backup === 'fast' ? 0.6 : 1.0
  const baseTokens = 4
  const effectiveTokens = anyMiss ? baseTokens * qualityFactor : baseTokens
  const roundTime = 1 + stallTime
  const tokPerSeq = effectiveTokens / roundTime

  return { lanes, stallTime, tokPerSeq }
}

export function FallbackStrategy() {
  const [batchSize, setBatchSize] = useState(4)
  const [pHit, setPHit] = useState(0.8)
  const [backup, setBackup] = useState<BackupType>('adaptive')

  const b = Math.round(batchSize)

  const { lanes, stallTime } = useMemo(
    () => simulateBatch(b, pHit, backup, 42),
    [b, pHit, backup]
  )

  const crossoverData = useMemo(() => {
    const sizes = Array.from({ length: 16 }, (_, i) => i + 1)
    return sizes.map(bs => ({
      batchSize: bs,
      neural: simulateBatch(bs, pHit, 'neural', 42).tokPerSeq,
      fast: simulateBatch(bs, pHit, 'fast', 42).tokPerSeq,
    }))
  }, [pHit])

  const maxTok = Math.max(...crossoverData.flatMap(d => [d.neural, d.fast]))

  const chartWidth = 400
  const chartHeight = 160
  const chartMargin = { top: 10, right: 20, bottom: 30, left: 40 }
  const plotW = chartWidth - chartMargin.left - chartMargin.right
  const plotH = chartHeight - chartMargin.top - chartMargin.bottom

  return (
    <SectionHeader
      number={4}
      title="Fallback Strategy & Batch Size"
      subtitle="Why the optimal backup speculator changes with batch size"
      tooltip="Section 4.3, Theorem 17: At small batch sizes, neural backup wins. At large batch sizes, fast backup wins."
      referenceFigure="./reference-figures/fig6-fallback-batch.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-44">
            <Slider label="Batch size" value={batchSize} onChange={setBatchSize} min={1} max={16} step={1}
              formatValue={v => String(Math.round(v))}
              tooltip="Number of sequences decoded in parallel." />
          </div>
          <div className="w-44">
            <Slider label="Cache hit rate" value={pHit} onChange={setPHit} min={0.3} max={0.99}
              tooltip="Per-sequence probability of a cache hit." />
          </div>
          <div className="flex gap-2 items-end pb-1">
            {(['neural', 'fast', 'adaptive'] as const).map(t => (
              <Tooltip
                key={t}
                content={
                  t === 'neural' ? 'Slow but high-quality neural draft model as backup' :
                  t === 'fast' ? 'Fast random token generation as backup (low quality)' :
                  'Saguaro adaptive: neural for small batches, fast for large'
                }
              >
                <button
                  onClick={() => setBackup(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    backup === t
                      ? 'bg-verify text-white border-verify'
                      : 'bg-surface-3 text-text-dim border-border hover:text-text'
                  }`}
                >
                  {t === 'neural' ? 'Neural' : t === 'fast' ? 'Fast' : 'Adaptive'}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="text-xs text-text-dim mb-2 font-medium">Batch sequences (each lane is an independent decode)</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(b, 16)}, 1fr)` }}>
            {lanes.map((lane, i) => (
              <Tooltip
                key={i}
                content={
                  <div>
                    <div className="font-medium">Sequence {i + 1}</div>
                    <div>{lane.hit ? 'Cache HIT - no stall' : 'Cache MISS - triggers backup speculator'}</div>
                    {!lane.hit && (
                      <div className="text-text-dim mt-1">
                        This miss stalls the ENTIRE batch.
                      </div>
                    )}
                  </div>
                }
              >
                <motion.div
                  className="rounded-lg h-12 flex items-center justify-center text-xs font-bold text-white cursor-default"
                  animate={{ backgroundColor: lane.hit ? COLORS.cacheHit : COLORS.reject }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  {lane.hit ? 'HIT' : 'MISS'}
                </motion.div>
              </Tooltip>
            ))}
          </div>
          {stallTime > 0 && (
            <Tooltip content="When any lane has a cache miss, the entire batch must wait for the backup speculator">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 p-2 rounded-lg bg-reject/10 border border-reject/30 text-xs text-reject"
              >
                Stall: {backup === 'neural' ? 'Neural backup' : 'Fast backup'} needed — {(stallTime * 1000).toFixed(0)}ms delay for entire batch
              </motion.div>
            </Tooltip>
          )}
        </div>

        <div className="p-3 rounded-lg bg-surface-3 border border-border">
          <Tooltip content="Shows how throughput changes with batch size. The crossover point b* is where fast backup starts winning.">
            <div className="text-xs text-text-dim mb-2 font-medium cursor-help">Throughput vs batch size (crossover point)</div>
          </Tooltip>
          <svg width={chartWidth} height={chartHeight} className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            <g transform={`translate(${chartMargin.left},${chartMargin.top})`}>
              <line x1={0} y1={0} x2={0} y2={plotH} stroke={COLORS.border} />
              <text x={-8} y={plotH / 2} textAnchor="middle" fill={COLORS.textDim} fontSize={9} transform={`rotate(-90, -8, ${plotH / 2})`}>
                tok/s/seq
              </text>
              <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke={COLORS.border} />
              <text x={plotW / 2} y={plotH + 22} textAnchor="middle" fill={COLORS.textDim} fontSize={9}>
                Batch size
              </text>
              <motion.path
                d={crossoverData.map((d, i) => {
                  const x = (d.batchSize / 16) * plotW
                  const y = plotH - (d.neural / maxTok) * plotH
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                }).join(' ')}
                fill="none" stroke={COLORS.verify} strokeWidth={2}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }}
              />
              <motion.path
                d={crossoverData.map((d, i) => {
                  const x = (d.batchSize / 16) * plotW
                  const y = plotH - (d.fast / maxTok) * plotH
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                }).join(' ')}
                fill="none" stroke={COLORS.draft} strokeWidth={2}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
              />
              <line
                x1={(b / 16) * plotW} y1={0} x2={(b / 16) * plotW} y2={plotH}
                stroke={COLORS.text} strokeWidth={1} strokeDasharray="4 4" opacity={0.4}
              />
              <text x={(b / 16) * plotW} y={plotH + 14} textAnchor="middle" fill={COLORS.text} fontSize={9} fontWeight="bold">
                b={b}
              </text>
            </g>
          </svg>
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: COLORS.verify }} />
              <span className="text-text-dim">Neural backup</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: COLORS.draft }} />
              <span className="text-text-dim">Fast backup</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 mb-4">
          <Legend
            items={[
              { color: COLORS.cacheHit, label: 'Cache hit', tooltip: 'Sequence had matching speculation' },
              { color: COLORS.reject, label: 'Cache miss', tooltip: 'No matching speculation — triggers backup' },
            ]}
          />
          <Tooltip content={`P(all hit) = ${pHit.toFixed(2)}^${b} = ${Math.pow(pHit, b).toFixed(3)}`}>
            <div className="text-sm text-text-dim">
              P(any miss) = <span className="text-text font-mono font-bold">{(1 - Math.pow(pHit, b)).toFixed(3)}</span>
            </div>
          </Tooltip>
        </div>

        <div className="space-y-2">
          <ConceptCard title="Why does batch size change the optimal fallback?" defaultOpen>
            <p>
              On a cache miss, a <strong>fallback speculator</strong> generates new draft tokens. Two options:
            </p>
            <p>
              <M color="#3b82f6">{'\\text{Neural backup}'}</M>: run the draft model (slow, ~800ms, but high-quality tokens).
            </p>
            <p>
              <M color="#f59e0b">{'\\text{Fast backup}'}</M>: generate random/heuristic tokens instantly (~150ms, but low quality).
            </p>
            <p>
              In batched decoding, all sequences are processed together.
              If <em>any</em> sequence misses, the <em>entire batch</em> waits:
            </p>
            <MathBlock>{'P(\\text{any miss}) = 1 - p_{\\text{hit}}^{\\,b}'}</MathBlock>
            <p>
              At <M>{'b=1'}</M>: <M>{'P(\\text{miss}) = '}</M>{(1 - pHit).toFixed(2)} — misses are rare, neural backup is fine.
              At <M>{'b=8'}</M>: <M>{'P(\\text{miss}) = '}</M>{(1 - Math.pow(pHit, 8)).toFixed(3)} — almost every round stalls.
              At <M>{'b=16'}</M>: <M>{'P(\\text{miss}) = '}</M>{(1 - Math.pow(pHit, 16)).toFixed(4)} — you're paying the fallback cost every round, so fast wins.
            </p>
          </ConceptCard>

          <ConceptCard title="What is the crossover point b* (Theorem 17)?">
            <p>
              <M>{'b^*'}</M> is the <strong>critical batch size</strong> where neural and fast backups give equal throughput.
            </p>
            <MathBlock>{'b^* \\approx \\frac{\\ln(\\text{crossover ratio})}{\\ln(1 / p_{\\text{hit}})}'}</MathBlock>
            <p>
              Below <M>{'b^*'}</M>, use neural backup; above <M>{'b^*'}</M>, use fast backup.
              The <M color="#f59e0b">{'\\text{Adaptive}'}</M> strategy switches automatically based on batch size.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
