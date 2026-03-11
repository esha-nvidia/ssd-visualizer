import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import katex from 'katex'
import 'katex/dist/katex.min.css'

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
  const html = useMemo(() => {
    const colorCmd = color ? `\\textcolor{${color}}{${children}}` : children
    return katex.renderToString(colorCmd, {
      throwOnError: false,
      displayMode: false,
    })
  }, [children, color])

  return (
    <span
      className="inline-block align-middle mx-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Block math: renders a LaTeX expression as a display block */
export function MathBlock({ children }: { children: string }) {
  const html = useMemo(() => {
    return katex.renderToString(children, {
      throwOnError: false,
      displayMode: true,
    })
  }, [children])

  return (
    <div
      className="bg-surface-2 rounded-md px-3 py-2 text-text border border-border/50 my-1.5 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
