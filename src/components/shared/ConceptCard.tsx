import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type KatexRuntime = (typeof import('katex'))['default']

let katexRuntime: KatexRuntime | null = null
let katexLoader: Promise<KatexRuntime> | null = null

function loadKatex(): Promise<KatexRuntime> {
  if (katexRuntime) return Promise.resolve(katexRuntime)
  if (!katexLoader) {
    katexLoader = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([module]) => {
      katexRuntime = module.default
      return katexRuntime
    })
  }
  return katexLoader
}

function renderMathIfReady(expression: string, displayMode: boolean): string | null {
  if (!katexRuntime) return null
  return katexRuntime.renderToString(expression, {
    throwOnError: false,
    displayMode,
  })
}

function useRenderedMath(expression: string, displayMode: boolean): string | null {
  const cachedHtml = renderMathIfReady(expression, displayMode)
  const [asyncHtml, setAsyncHtml] = useState<string | null>(cachedHtml)

  useEffect(() => {
    if (cachedHtml !== null) return

    let cancelled = false
    loadKatex().then(runtime => {
      if (cancelled) return
      setAsyncHtml(runtime.renderToString(expression, {
        throwOnError: false,
        displayMode,
      }))
    })

    return () => {
      cancelled = true
    }
  }, [cachedHtml, displayMode, expression])

  return cachedHtml ?? asyncHtml
}

export function ConceptCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg bg-surface-3/50 border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-dim hover:text-text transition-colors text-left"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          className="text-verify text-[10px] flex-shrink-0"
        >
          ▶
        </motion.span>
        {title}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 text-xs text-text-dim leading-relaxed space-y-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Inline math: renders a LaTeX expression inline */
export function M({ children, color }: { children: string; color?: string }) {
  const expression = useMemo(
    () => (color ? `\\textcolor{${color}}{${children}}` : children),
    [children, color]
  )
  const html = useRenderedMath(expression, false)

  if (html === null) {
    return (
      <code
        className="inline-block align-middle mx-0.5 rounded px-1 py-0.5 text-[0.9em] bg-surface-2 text-text"
        style={color ? { color } : undefined}
      >
        {children}
      </code>
    )
  }

  return (
    <span
      className="inline-block align-middle mx-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Block math: renders a LaTeX expression as a display block */
export function MathBlock({ children }: { children: string }) {
  const html = useRenderedMath(children, true)

  if (html === null) {
    return (
      <pre className="bg-surface-2 rounded-md px-3 py-2 text-text border border-border/50 my-1.5 overflow-x-auto text-[11px] whitespace-pre-wrap">
        {children}
      </pre>
    )
  }

  return (
    <div
      className="bg-surface-2 rounded-md px-3 py-2 text-text border border-border/50 my-1.5 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
