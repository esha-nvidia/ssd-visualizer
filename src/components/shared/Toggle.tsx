import { Tooltip } from './Tooltip'

export function Toggle({
  label,
  checked,
  onChange,
  tooltip,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  tooltip?: string
}) {
  const inner = (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm group"
    >
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-verify' : 'bg-surface-3'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-text-dim group-hover:text-text transition-colors">
        {label}
      </span>
    </button>
  )

  if (tooltip) {
    return <Tooltip content={tooltip}>{inner}</Tooltip>
  }
  return inner
}
