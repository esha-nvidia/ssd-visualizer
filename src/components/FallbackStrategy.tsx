import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { COLORS } from '../lib/constants'
import { SectionHeader } from './shared/SectionHeader'
import { Slider } from './shared/Slider'
import { Tooltip } from './shared/Tooltip'
import { Legend } from './shared/Legend'
import { ConceptCard, M, MathBlock } from './shared/ConceptCard'

type BackupType = 'neural' | 'fast' | 'adaptive'
type ConcreteBackup = Exclude<BackupType, 'adaptive'>

const MAX_BATCH_SIZE = 32
const PRIMARY_SPEC_TIME = 0.3
const PRIMARY_TOKENS = 4.4
const BACKUP_PROFILE: Record<ConcreteBackup, { latency: number; missTokens: number }> = {
  neural: { latency: PRIMARY_SPEC_TIME, missTokens: PRIMARY_TOKENS },
  fast: { latency: 0.12, missTokens: 1.0 },
}

function batchMissProbability(batchSize: number, pHit: number): number {
  return 1 - Math.pow(pHit, batchSize)
}

function expectedBatchMetrics(
  batchSize: number,
  pHit: number,
  backup: ConcreteBackup
): { pAnyMiss: number; pAllHit: number; stallTime: number; tokPerSeq: number } {
  const pAnyMiss = batchMissProbability(batchSize, pHit)
  const pAllHit = 1 - pAnyMiss
  const profile = BACKUP_PROFILE[backup]
  const expectedTokens = pHit * PRIMARY_TOKENS + (1 - pHit) * profile.missTokens
  const criticalPath = pAllHit * Math.max(1, PRIMARY_SPEC_TIME) + pAnyMiss * (1 + profile.latency)
  const stallTime = pAnyMiss * profile.latency
  const tokPerSeq = expectedTokens / criticalPath
  return { pAnyMiss, pAllHit, stallTime, tokPerSeq }
}

function resolveAdaptiveBackup(batchSize: number, pHit: number): ConcreteBackup {
  const neural = expectedBatchMetrics(batchSize, pHit, 'neural')
  const fast = expectedBatchMetrics(batchSize, pHit, 'fast')
  return neural.tokPerSeq >= fast.tokPerSeq ? 'neural' : 'fast'
}

function simulateBatch(
  batchSize: number,
  pHit: number,
  backup: BackupType,
  seed: number
): { lanes: { hit: boolean }[]; missCount: number; stallTime: number } {
  let s = seed
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }

  const lanes = Array.from({ length: batchSize }, () => ({
    hit: next() < pHit,
  }))

  const missCount = lanes.filter(l => !l.hit).length
  const resolvedBackup = backup === 'adaptive' ? resolveAdaptiveBackup(batchSize, pHit) : backup
  const stallTime = missCount === 0 ? 0 : BACKUP_PROFILE[resolvedBackup].latency

  return { lanes, missCount, stallTime }
}

export function FallbackStrategy() {
  const [batchSize, setBatchSize] = useState(4)
  const [pHit, setPHit] = useState(0.8)
  const [backup, setBackup] = useState<BackupType>('adaptive')

  const b = Math.round(batchSize)

  const { lanes, missCount, stallTime } = useMemo(
    () => simulateBatch(b, pHit, backup, 42),
    [b, pHit, backup]
  )

  const selectedMetrics = useMemo(() => {
    if (backup === 'adaptive') {
      const selected = resolveAdaptiveBackup(b, pHit)
      return {
        selected,
        ...expectedBatchMetrics(b, pHit, selected),
      }
    }
    return {
      selected: backup,
      ...expectedBatchMetrics(b, pHit, backup),
    }
  }, [b, pHit, backup])

  const crossoverData = useMemo(() => {
    const sizes = Array.from({ length: MAX_BATCH_SIZE }, (_, i) => i + 1)
    return sizes.map(bs => ({
      batchSize: bs,
      neural: expectedBatchMetrics(bs, pHit, 'neural').tokPerSeq,
      fast: expectedBatchMetrics(bs, pHit, 'fast').tokPerSeq,
    }))
  }, [pHit])

  const crossoverBatch = useMemo(() => {
    const crossover = crossoverData.find(d => d.fast > d.neural)
    return crossover?.batchSize ?? null
  }, [crossoverData])

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
      tooltip="Corollary 16 and Theorem 17: the denominator worsens as p_hit^b falls, so large batches favor lower-latency backup."
      referenceFigure="./reference-figures/fig6-fallback-batch.png"
    >
      <div className="bg-surface-2 rounded-xl p-5 border border-border">
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
          <div className="w-44">
            <Slider label="Batch size" value={batchSize} onChange={setBatchSize} min={1} max={MAX_BATCH_SIZE} step={1}
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
                  t === 'neural' ? 'High-quality neural backup: better miss recovery, higher latency T_b' :
                  t === 'fast' ? 'Low-latency backup: lower T_b, but weaker miss recovery E_miss' :
                  'Adaptive: picks whichever Corollary 16 throughput curve is higher at the current batch size'
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
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(b, 8)}, 1fr)` }}>
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
          {stallTime > 0 ? (
            <Tooltip content="When any lane has a cache miss, the whole batch waits for backup. This sampled grid is illustrative; the chart below uses the expected batch formula from Corollary 16.">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 p-2 rounded-lg bg-reject/10 border border-reject/30 text-xs text-reject"
              >
                Sampled batch stall: {backup === 'adaptive'
                  ? `Adaptive chose ${selectedMetrics.selected}`
                  : `${backup === 'neural' ? 'Neural' : 'Fast'} backup`} with {missCount} miss{missCount === 1 ? '' : 'es'} — {(stallTime * 1000).toFixed(0)}ms delay
              </motion.div>
            </Tooltip>
          ) : (
            <div className="mt-2 p-2 rounded-lg bg-accept/10 border border-accept/30 text-xs text-accept">
              This sampled batch had no misses, so fallback was avoided.
            </div>
          )}
        </div>

        <div className="p-3 rounded-lg bg-surface-3 border border-border">
          <Tooltip content="Shows how throughput changes with batch size. The crossover point b* is where fast backup starts winning.">
            <div className="text-xs text-text-dim mb-2 font-medium cursor-help">Corollary 16 throughput proxy vs batch size</div>
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
                  const x = ((d.batchSize - 1) / (MAX_BATCH_SIZE - 1)) * plotW
                  const y = plotH - (d.neural / maxTok) * plotH
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                }).join(' ')}
                fill="none" stroke={COLORS.verify} strokeWidth={2}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }}
              />
              <motion.path
                d={crossoverData.map((d, i) => {
                  const x = ((d.batchSize - 1) / (MAX_BATCH_SIZE - 1)) * plotW
                  const y = plotH - (d.fast / maxTok) * plotH
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                }).join(' ')}
                fill="none" stroke={COLORS.draft} strokeWidth={2}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
              />
              <line
                x1={((b - 1) / (MAX_BATCH_SIZE - 1)) * plotW} y1={0} x2={((b - 1) / (MAX_BATCH_SIZE - 1)) * plotW} y2={plotH}
                stroke={COLORS.text} strokeWidth={1} strokeDasharray="4 4" opacity={0.4}
              />
              <text x={((b - 1) / (MAX_BATCH_SIZE - 1)) * plotW} y={plotH + 14} textAnchor="middle" fill={COLORS.text} fontSize={9} fontWeight="bold">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 mb-4">
          <Tooltip content="Expected throughput for the selected fallback strategy under the current batch size and cache-hit rate.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Selected throughput</div>
              <div className="text-lg font-mono font-bold text-text">
                {selectedMetrics.tokPerSeq.toFixed(2)} tok/s/seq
              </div>
            </div>
          </Tooltip>
          <Tooltip content="Expected stall added by fallback under the current settings, averaged over many batches.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Expected stall</div>
              <div className="text-lg font-mono font-bold text-text">
                {(selectedMetrics.stallTime * 1000).toFixed(0)} ms
              </div>
            </div>
          </Tooltip>
          <Tooltip content="First batch size in the plotted range where fast backup beats neural backup. If none appears, the crossover is beyond the chart range.">
            <div className="p-3 rounded-lg bg-surface-3 border border-border">
              <div className="text-xs text-text-dim mb-1">Crossover</div>
              <div className="text-lg font-mono font-bold text-text">
                {crossoverBatch ? `b* ≈ ${crossoverBatch}` : `b* > ${MAX_BATCH_SIZE}`}
              </div>
            </div>
          </Tooltip>
        </div>

        <div className="flex items-center justify-between mt-4 mb-4">
          <Legend
            items={[
              { color: COLORS.cacheHit, label: 'Cache hit', tooltip: 'Sequence had matching speculation' },
              { color: COLORS.reject, label: 'Cache miss', tooltip: 'No matching speculation — triggers backup' },
            ]}
          />
          <Tooltip content={`Batch-all-hit probability: p_hit^b = ${pHit.toFixed(2)}^${b} = ${Math.pow(pHit, b).toFixed(3)}`}>
            <div className="text-sm text-text-dim">
              P(any miss) = <span className="text-text font-mono font-bold">{selectedMetrics.pAnyMiss.toFixed(3)}</span>
            </div>
          </Tooltip>
        </div>

        <div className="space-y-2">
          <ConceptCard title="Why does batch size change the optimal fallback?" defaultOpen>
            <p>
              On a cache miss, a fallback speculator generates the next draft. Corollary 16 says batch size enters through the probability that the entire batch avoids misses.
            </p>
            <MathBlock>{'\\text{Throughput} \\propto \\frac{p_{\\text{hit}} E_{\\text{hit}} + (1-p_{\\text{hit}}) E_{\\text{miss}}}{p_{\\text{hit}}^{\\,b} \\max(1, T_p) + (1-p_{\\text{hit}}^{\\,b})(1 + T_b)}'}</MathBlock>
            <p>
              As <M>{'b'}</M> grows, <M>{'p_{\\text{hit}}^b'}</M> shrinks, so the miss path matters more. That is why small batches can justify better backup quality, while large batches reward lower backup latency.
            </p>
          </ConceptCard>

          <ConceptCard title="What is the crossover point b* (Theorem 17)?">
            <p>
              <M>{'b^*'}</M> is the batch size where the neural and fast throughput curves intersect.
            </p>
            <p>
              Below <M>{'b^*'}</M>, neural wins; above it, fast wins. <M color="#f59e0b">{'\\text{Adaptive}'}</M> picks whichever curve is higher. This panel keeps <M>{'E_{\\text{hit}}'}</M>, <M>{'E_{\\text{miss}}'}</M>, <M>{'T_p'}</M>, and <M>{'T_b'}</M> fixed to stylized constants so the theorem's tradeoff stays visible.
            </p>
          </ConceptCard>
        </div>
      </div>
    </SectionHeader>
  )
}
