import { useState } from 'react'
import { TooltipProvider } from './components/shared/Tooltip'
import { AlgorithmTimeline } from './components/AlgorithmTimeline'
import { SpeculationCache } from './components/SpeculationCache'
import { SaguaroSampling } from './components/SaguaroSampling'
import { FallbackStrategy } from './components/FallbackStrategy'
import { PowerLawPlot } from './components/PowerLawPlot'
import { SideBySideTimeline } from './components/SideBySideTimeline'
import { Tooltip } from './components/shared/Tooltip'
import { ConceptCard, M } from './components/shared/ConceptCard'

const SECTIONS = [
  { id: 'algo', label: 'Algorithm 1', short: '1' },
  { id: 'cache', label: 'Cache', short: '2' },
  { id: 'saguaro', label: 'Saguaro', short: '3' },
  { id: 'fallback', label: 'Fallback', short: '4' },
  { id: 'power', label: 'Scaling', short: '5' },
  { id: 'timeline', label: 'SD vs SSD', short: '6' },
] as const

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
              <Tooltip content="Paper by Tanishq Kumar, Tri Dao, and Avner May (2025). Click to view on arXiv.">
                <a
                  href="https://arxiv.org/abs/2603.03251"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-text-dim hover:text-verify transition-colors"
                >
                  Kumar, Dao & May (2025) — Interactive Visualizer
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
              <span className="text-text font-medium">Standard Speculative Decoding (SD)</span> uses a small draft model to generate candidate tokens, then a large target model to verify them.
              The bottleneck: drafting and verification are <span className="text-reject">sequential</span>.{' '}
              <span className="text-text font-medium">SSD</span> eliminates this idle time by having the speculator{' '}
              <span className="text-accept">predict verification outcomes and pre-compute the next speculation</span> while verification runs.
              The <span className="text-cache-hit font-medium">Saguaro algorithm</span> optimizes cache construction, sampling, and fallback strategy.
            </p>
            <p className="text-xs text-text-dim mt-2">
              Hover over any element for detailed explanations. Expand the explanation panels below each visualization for the math.
              Click "Paper fig." buttons to see the original figure from the paper.
            </p>
          </div>

          <div className="mb-8">
            <ConceptCard title="Quick glossary: all variables and acronyms used in this visualizer">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <p><M color="#3b82f6">{'\\text{SD}'}</M> — Speculative Decoding (standard, sequential)</p>
                <p><M color="#3b82f6">{'\\text{SSD}'}</M> — Speculative <em>Speculative</em> Decoding (this paper)</p>
                <p><M color="#f59e0b">{'\\text{Speculator}'}</M> — the small, fast draft model</p>
                <p><M color="#3b82f6">{'\\text{Verifier}'}</M> — the large, accurate target model</p>
                <p><M>{'K'}</M> — speculation lookahead (tokens drafted per round)</p>
                <p><M color="#22c55e">{'\\alpha'}</M> — acceptance rate: <M>{'P(\\text{token passes verification})'}</M></p>
                <p><M>{'v = (k, t^*)'}</M> — verification outcome: <M>{'k'}</M> accepted + bonus token <M>{'t^*'}</M></p>
                <p><M>{'t^*'}</M> — bonus token, sampled from the residual distribution</p>
                <p><M color="#8b5cf6">{'\\text{Speculation cache}'}</M> — pre-computed speculations for predicted outcomes</p>
                <p><M color="#8b5cf6">{'p_{\\text{hit}}'}</M> — probability of a cache hit</p>
                <p><M>{'B'}</M> — cache budget (total pre-computed speculations)</p>
                <p><M>{'F,\\, F_k'}</M> — fan-out (number of guesses per position <M>{'k'}</M>)</p>
                <p><M>{'C'}</M> — Saguaro downweighting constant <M>{'(0 \\leq C \\leq 1)'}</M></p>
                <p><M>{'r(t)'}</M> — residual: <M>{'\\max(p_{\\text{target}} - p_{\\text{draft}},\\, 0) / Z'}</M></p>
                <p><M>{'r'}</M> — power-law exponent for cache miss scaling</p>
                <p><M>{'b'}</M> — batch size (sequences decoded in parallel)</p>
                <p><M>{'b^*'}</M> — critical batch size (crossover for backup strategy)</p>
                <p><M>{'T'}</M> — temperature (controls distribution entropy)</p>
              </div>
            </ConceptCard>
          </div>
        </div>

        {/* Visualizations */}
        <main className="max-w-5xl mx-auto px-4 pb-16 space-y-12">
          <div id="algo">
            <AlgorithmTimeline />
          </div>
          <div id="cache">
            <SpeculationCache />
          </div>
          <div id="saguaro">
            <SaguaroSampling />
          </div>
          <div id="fallback">
            <FallbackStrategy />
          </div>
          <div id="power">
            <PowerLawPlot />
          </div>
          <div id="timeline">
            <SideBySideTimeline />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-6 text-center">
          <p className="text-xs text-text-dim">
            Based on{' '}
            <a href="https://arxiv.org/abs/2603.03251" target="_blank" rel="noopener noreferrer" className="text-verify hover:underline">
              Speculative Speculative Decoding
            </a>
            {' '}by Kumar, Dao & May (2025)
          </p>
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
