import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { TooltipProvider } from './components/shared/Tooltip'
import { AlgorithmTimeline } from './components/AlgorithmTimeline'
import { Tooltip } from './components/shared/Tooltip'
import { ConceptCard, M } from './components/shared/ConceptCard'

const SpeculationCache = lazy(() =>
  import('./components/SpeculationCache').then(module => ({ default: module.SpeculationCache }))
)
const SaguaroSampling = lazy(() =>
  import('./components/SaguaroSampling').then(module => ({ default: module.SaguaroSampling }))
)
const FallbackStrategy = lazy(() =>
  import('./components/FallbackStrategy').then(module => ({ default: module.FallbackStrategy }))
)
const PowerLawPlot = lazy(() =>
  import('./components/PowerLawPlot').then(module => ({ default: module.PowerLawPlot }))
)
const SideBySideTimeline = lazy(() =>
  import('./components/SideBySideTimeline').then(module => ({ default: module.SideBySideTimeline }))
)

const SECTIONS = [
  { id: 'algo', label: 'Algorithm 1', short: '1' },
  { id: 'cache', label: 'Cache', short: '2' },
  { id: 'saguaro', label: 'Saguaro', short: '3' },
  { id: 'fallback', label: 'Fallback', short: '4' },
  { id: 'power', label: 'Scaling', short: '5' },
  { id: 'timeline', label: 'SD vs SSD', short: '6' },
] as const

function SectionFallback({
  label,
  minHeight,
}: {
  label: string
  minHeight: number
}) {
  return (
    <div
      className="rounded-xl border border-border bg-surface-2/60 p-5"
      style={{ minHeight }}
      aria-busy="true"
    >
      <div className="animate-pulse">
        <div className="h-4 w-40 rounded bg-surface-3 mb-3" />
        <div className="h-3 w-64 rounded bg-surface-3/80 mb-6" />
        <div className="h-48 rounded-lg bg-surface-3/70" />
      </div>
      <p className="text-xs text-text-dim mt-3">Loading {label}…</p>
    </div>
  )
}

function DeferredSection({
  id,
  label,
  minHeight,
  active,
  children,
}: {
  id: string
  label: string
  minHeight: number
  active: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState(() => active || typeof IntersectionObserver === 'undefined')
  const shouldRender = active || seen

  useEffect(() => {
    if (shouldRender) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setSeen(true)
        observer.disconnect()
      },
      { rootMargin: '480px 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [shouldRender])

  return (
    <div id={id} ref={ref}>
      {shouldRender ? (
        <Suspense fallback={<SectionFallback label={label} minHeight={minHeight} />}>
          {children}
        </Suspense>
      ) : (
        <SectionFallback label={label} minHeight={minHeight} />
      )}
    </div>
  )
}

function App() {
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveSection(id)
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-surface">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-text">
                Speculative Speculative Decoding
              </h1>
              <Tooltip content="Paper by Tanishq Kumar, Tri Dao, and Avner May (2026). Click to view on arXiv.">
                <a
                  href="https://arxiv.org/abs/2603.03251"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-text-dim hover:text-verify transition-colors"
                >
                  Kumar, Dao & May (2026) — Interactive Visualizer
                </a>
              </Tooltip>
            </div>

            {/* Section nav */}
            <nav className="flex gap-1">
              {SECTIONS.map(s => (
                <Tooltip key={s.id} content={s.label}>
                  <button
                    onClick={() => scrollTo(s.id)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                      activeSection === s.id
                        ? 'bg-verify text-white'
                        : 'bg-surface-2 text-text-dim hover:text-text hover:bg-surface-3'
                    }`}
                  >
                    {s.short}
                  </button>
                </Tooltip>
              ))}
            </nav>
          </div>
        </header>

        {/* Intro */}
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
          <div className="p-4 rounded-xl bg-surface-2 border border-border mb-4">
            <p className="text-sm text-text-dim leading-relaxed">
              <span className="text-text font-medium">SD</span> uses a small draft model and a large verifier, but they run{' '}
              <span className="text-reject">sequentially</span>. <span className="text-text font-medium">SSD</span> overlaps them:
              while the verifier checks the current draft, the speculator <span className="text-accept">predicts likely verification outcomes and prepares the next speculation</span>.
              <span className="text-cache-hit font-medium"> Saguaro</span> improves cache shape, sampling, and fallback.
            </p>
            <p className="text-xs text-text-dim mt-2">
              Hover for details, open the cards for the math, and use "Paper fig." to compare with the original figure.
            </p>
          </div>

          <div className="mb-8">
            <ConceptCard title="Quick glossary">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <p><M color="#3b82f6">{'\\text{SD}'}</M> — standard speculative decoding</p>
                <p><M color="#3b82f6">{'\\text{SSD}'}</M> — speculative speculative decoding</p>
                <p><M color="#f59e0b">{'\\text{Speculator}'}</M> — small draft model</p>
                <p><M color="#3b82f6">{'\\text{Verifier}'}</M> — large target model</p>
                <p><M>{'K'}</M> — lookahead per round</p>
                <p><M>{'\\text{pos}'}</M> — accepted count; paper writes <M>{'k'}</M></p>
                <p><M color="#22c55e">{'\\alpha'}</M> — per-token acceptance rate</p>
                <p><M>{'v = (\\text{pos}, t^*)'}</M> — verifier output</p>
                <p><M>{'t^*'}</M> — bonus token</p>
                <p><M color="#8b5cf6">{'\\text{Speculation cache}'}</M> — precomputed next drafts</p>
                <p><M color="#8b5cf6">{'p_{\\text{hit}}'}</M> — cache-hit probability</p>
                <p><M>{'B'}</M> — cache budget</p>
                <p><M>{'F_{\\text{pos}}'}</M> — fan-out at accepted count <M>{'\\text{pos}'}</M></p>
                <p><M>{'C'}</M> — Saguaro downweight constant</p>
                <p><M>{'r(t)'}</M> — residual distribution</p>
                <p><M>{'\\rho'}</M> — power-law exponent; paper also uses <M>{'r'}</M></p>
                <p><M>{'b'}</M> — batch size</p>
                <p><M>{'b^*'}</M> — fallback crossover batch size</p>
                <p><M>{'T'}</M> — temperature</p>
              </div>
            </ConceptCard>
          </div>
        </div>

        {/* Visualizations */}
        <main className="max-w-5xl mx-auto px-4 pb-16 space-y-12">
          <div id="algo">
            <AlgorithmTimeline />
          </div>
          <DeferredSection id="cache" label="Speculation Cache" minHeight={760} active={activeSection === 'cache'}>
            <SpeculationCache />
          </DeferredSection>
          <DeferredSection id="saguaro" label="Saguaro Sampling" minHeight={760} active={activeSection === 'saguaro'}>
            <SaguaroSampling />
          </DeferredSection>
          <DeferredSection id="fallback" label="Fallback Strategy" minHeight={760} active={activeSection === 'fallback'}>
            <FallbackStrategy />
          </DeferredSection>
          <DeferredSection id="power" label="Power-Law Scaling" minHeight={720} active={activeSection === 'power'}>
            <PowerLawPlot />
          </DeferredSection>
          <DeferredSection id="timeline" label="SD vs SSD Timeline" minHeight={760} active={activeSection === 'timeline'}>
            <SideBySideTimeline />
          </DeferredSection>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-6 text-center">
          <p className="text-xs text-text-dim">
            Based on{' '}
            <a href="https://arxiv.org/abs/2603.03251" target="_blank" rel="noopener noreferrer" className="text-verify hover:underline">
              Speculative Speculative Decoding
            </a>
            {' '}by Kumar, Dao & May (2026)
          </p>
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
