// Small shared controls. Every control here is wired to state by its caller.
import { useId, useState, type ReactNode } from 'react'
import { SOURCE_BY_ID } from '../data/sources'
import type { Evidence } from '../sim/types'

export function Info({ text }: { text: ReactNode }) {
  return (
    <span className="info" tabIndex={0} role="note" aria-label={typeof text === 'string' ? text : undefined}>
      <span aria-hidden="true">i</span>
      <span className="info-pop">{text}</span>
    </span>
  )
}

export function Field({ label, info, children, wide }: { label: string; info?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' wide' : '')}>
      <span className="field-label">
        {label}
        {info && <Info text={info} />}
      </span>
      {children}
    </label>
  )
}

export function Num({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  scale = 1,
  digits,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  /** display = stored × scale */
  scale?: number
  digits?: number
}) {
  const shown = value * scale
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    const v = parseFloat(text.replace(',', '.'))
    setDraft(null)
    if (!isFinite(v)) return
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v))
    onChange(clamped / scale)
  }
  return (
    <span className="num">
      <input
        type="number"
        inputMode="decimal"
        value={draft ?? (digits !== undefined ? shown.toFixed(digits) : String(Math.round(shown * 1000) / 1000))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  )
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={'check' + (disabled ? ' disabled' : '')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="section">
      <header>
        <button className="section-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span className={'chev' + (open ? ' open' : '')} aria-hidden="true">
            ▸
          </span>
          {title}
        </button>
        {aside}
      </header>
      {open && (
        <div id={id} className="section-body">
          {children}
        </div>
      )}
    </section>
  )
}

const EVIDENCE: Record<Evidence, { short: string; label: string; cls: string }> = {
  manufacturer: { short: 'VÝROBCE', label: 'Údaj výrobce (nezávisle neověřeno)', cls: 'ev-ext' },
  'peer-reviewed': { short: 'STUDIE', label: 'Recenzovaná studie', cls: 'ev-ext' },
  official: { short: 'ÚŘAD', label: 'Úřad nebo právní předpis', cls: 'ev-ext' },
  'third-party': { short: '2. ZDROJ', label: 'Druhotný zdroj (odborný tisk, prodejce, shrnutí)', cls: 'ev-weak' },
  derived: { short: 'MODEL', label: 'Vypočteno tímto modelem', cls: 'ev-sim' },
  assumption: { short: 'PŘEDPOKLAD', label: 'Nastavitelný předpoklad', cls: 'ev-assume' },
  unknown: { short: 'NEZNÁMÉ', label: 'Nepodařilo se ověřit', cls: 'ev-unknown' },
}

export function EvidenceTag({ evidence, sourceId, note }: { evidence: Evidence; sourceId?: string; note?: string }) {
  const e = EVIDENCE[evidence]
  const src = sourceId ? SOURCE_BY_ID[sourceId] : undefined
  const title = [e.label, note, src ? `Zdroj: ${src.organisation}` : ''].filter(Boolean).join(' — ')
  const tag = (
    <span className={'ev ' + e.cls} title={title}>
      {e.short}
    </span>
  )
  return src ? (
    <a href={src.url} target="_blank" rel="noreferrer" className="ev-link" title={title}>
      {tag}
    </a>
  ) : (
    tag
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}
