'use client'

import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'

interface FunnelStep {
  event_type: string
  users: number
  conversion_rate: number       // vs first
  step_conversion_rate: number  // vs previous
  drop_off: number
  median_seconds: number
}

interface Props {
  steps: FunnelStep[]
}

export function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = sec / 60
  if (m < 60) return `${m.toFixed(m < 10 ? 1 : 0)}m`
  const h = m / 60
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)}h`
  return `${(h / 24).toFixed(1)}d`
}

const BAR_H = 240 // px

export function FunnelChart({ steps }: Props) {
  if (!steps.length) return (
    <div className="flex items-center justify-center h-40 type-body-15 text-[var(--color-text-subtle)]">No data</div>
  )

  return (
    <div>
      {/* Descending-column funnel — the shape itself shows the drop-off */}
      <div className="flex items-stretch">
        {steps.map((step, i) => {
          const fillPct = Math.max(step.conversion_rate * 100, step.users > 0 ? 2 : 0)
          return (
            <Fragment key={`bar-${step.event_type}-${i}`}>
              {/* Between-step connector, vertically centred on the bars.
                  Shows the conversion INTO this step + the drop lost getting here. */}
              {i > 0 && (
                <div className="flex flex-col items-center justify-center w-20 flex-shrink-0 gap-0.5" style={{ height: BAR_H }}>
                  <span className="type-small-body text-[var(--color-text)]">{(step.step_conversion_rate * 100).toFixed(0)}%</span>
                  <ArrowRight className="h-4 w-4 text-[var(--color-text-subtle)]" />
                  {step.median_seconds > 0 && (
                    <span className="type-body-12-400 text-[var(--color-text-subtle)]">{fmtDuration(step.median_seconds)}</span>
                  )}
                  <span className="type-body-12-400 text-[#DE0202]">−{steps[i - 1].drop_off.toLocaleString()}</span>
                </div>
              )}

              <div className="flex-1 flex flex-col items-center min-w-0">
                <span className="type-h3-16 text-[#0052F2] mb-1.5">{(step.conversion_rate * 100).toFixed(1)}%</span>
                <div
                  className="relative w-full max-w-[120px] rounded-lg bg-[#EEF3FD] overflow-hidden"
                  style={{ height: BAR_H }}
                  title={`${step.users.toLocaleString()} users${step.median_seconds > 0 ? ` · median ${fmtDuration(step.median_seconds)}` : ''}`}
                >
                  <div
                    className="absolute bottom-0 inset-x-0 accent-gradient rounded-lg transition-all duration-700"
                    style={{ height: `${fillPct}%` }}
                  />
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* Labels row, aligned under each column */}
      <div className="flex items-start mt-3">
        {steps.map((step, i) => (
          <Fragment key={`lbl-${step.event_type}-${i}`}>
            {i > 0 && <div className="w-20 flex-shrink-0" />}
            <div className="flex-1 text-center min-w-0 px-1">
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#EEF3FD] text-[#0052F2] type-body-12-400 flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="type-small-body text-[var(--color-text)] truncate" title={step.event_type}>{step.event_type}</span>
              </div>
              <div className="type-body-13 text-[var(--color-text-muted)] mt-1">{step.users.toLocaleString()} users</div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
