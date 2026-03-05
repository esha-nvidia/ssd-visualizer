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
