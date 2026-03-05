import { Tooltip } from './Tooltip'

export function AnimationControls({
  isPlaying,
  onPlay,
  onPause,
  onStepForward,
  onStepBack,
  onReset,
  speed,
  onSpeedChange,
  currentStep,
  totalSteps,
}: {
  isPlaying: boolean
  onPlay: () => void
  onPause: () => void
  onStepForward: () => void
  onStepBack: () => void
  onReset: () => void
  speed: number
  onSpeedChange: (s: number) => void
  currentStep?: number
  totalSteps?: number
}) {
  return (
    <div className="flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-2.5 border border-border">
      <Tooltip content="Reset animation">
        <button
          onClick={onReset}
          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim hover:text-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2v5h5L4.5 4.5A5.5 5.5 0 1 1 2.5 8H1a7 7 0 1 0 2.8-5.6L2 2z" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip content="Step back">
        <button
          onClick={onStepBack}
          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim hover:text-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2h2v12H3V2zm4 6 7-6v12L7 8z" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip content={isPlaying ? 'Pause' : 'Play'}>
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-2 rounded-lg bg-verify hover:bg-verify-light text-white transition-colors"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2h3v12H3V2zm7 0h3v12h-3V2z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6V2z" />
            </svg>
          )}
        </button>
      </Tooltip>

      <Tooltip content="Step forward">
        <button
          onClick={onStepForward}
          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim hover:text-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2h2v12h-2V2zM2 2l7 6-7 6V2z" />
          </svg>
        </button>
      </Tooltip>

      <div className="h-6 w-px bg-border mx-1" />

      <Tooltip content="Animation speed">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Speed</span>
          <select
            value={speed}
            onChange={e => onSpeedChange(Number(e.target.value))}
            className="bg-surface-3 text-text text-xs rounded px-1.5 py-1 border border-border"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </Tooltip>

      {currentStep !== undefined && totalSteps !== undefined && (
        <>
          <div className="h-6 w-px bg-border mx-1" />
          <span className="text-xs text-text-dim font-mono tabular-nums">
            Step {currentStep + 1}/{totalSteps}
          </span>
        </>
      )}
    </div>
  )
}
