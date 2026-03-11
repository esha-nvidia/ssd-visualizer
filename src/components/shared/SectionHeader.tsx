import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

export function SectionHeader({
  number,
  title,
  subtitle,
  tooltip,
  referenceFigure,
  children,
}: {
  number: number
  title: string
  subtitle: string
  tooltip?: string
  referenceFigure?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-verify/20 flex items-center justify-center text-verify font-bold text-lg">
          {number}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-text flex items-center gap-2">
            {title}
            {tooltip && (
              <Tooltip content={tooltip}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-3 text-text-dim text-xs cursor-help">
                  ?
                </span>
              </Tooltip>
            )}
          </h2>
          <p className="text-sm text-text-dim mt-0.5">{subtitle}</p>
        </div>
        {referenceFigure && (
          <Tooltip
            content={
              <div>
                <p className="font-medium mb-1">Reference from paper</p>
                <img
                  src={referenceFigure}
                  alt="Reference figure"
                  className="max-w-64 rounded"
                />
              </div>
            }
            side="left"
          >
            <button className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-3 text-text-dim text-xs hover:text-text hover:bg-surface-3/80 transition-colors border border-border">
              Paper fig.
            </button>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  )
}
