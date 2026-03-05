import * as RadixSlider from '@radix-ui/react-slider'
import { Tooltip } from './Tooltip'

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  tooltip,
  formatValue,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  tooltip?: string
  formatValue?: (v: number) => string
}) {
  const display = formatValue ? formatValue(value) : value.toFixed(2)

  const labelEl = (
    <div className="flex items-center justify-between text-sm mb-1.5">
      <span className="text-text-dim font-medium">{label}</span>
      <span className="text-text font-mono tabular-nums">{display}</span>
    </div>
  )

  return (
    <div className="w-full">
      {tooltip ? (
        <Tooltip content={tooltip}>{labelEl}</Tooltip>
      ) : (
        labelEl
      )}
      <RadixSlider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      >
        <RadixSlider.Track className="relative grow rounded-full h-1.5 bg-surface-3">
          <RadixSlider.Range className="absolute rounded-full h-full bg-verify" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block w-4 h-4 rounded-full bg-white shadow-md border-2 border-verify hover:bg-verify-light focus:outline-none focus:ring-2 focus:ring-verify/50 transition-colors cursor-grab active:cursor-grabbing" />
      </RadixSlider.Root>
    </div>
  )
}
