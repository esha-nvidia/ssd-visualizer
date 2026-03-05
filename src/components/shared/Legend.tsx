import { Tooltip } from './Tooltip'

export function LegendItem({
  color,
  label,
  tooltip,
}: {
  color: string
  label: string
  tooltip?: string
}) {
  const inner = (
    <div className="flex items-center gap-1.5 text-xs text-text-dim">
      <div
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  )
  if (tooltip) {
    return <Tooltip content={tooltip}>{inner}</Tooltip>
  }
  return inner
}

export function Legend({ items }: { items: { color: string; label: string; tooltip?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(item => (
        <LegendItem key={item.label} {...item} />
      ))}
    </div>
  )
}
