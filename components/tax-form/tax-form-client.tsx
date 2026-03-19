'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { TaxFormComputedSummary, TaxFormDraftInput } from '@/types'

type TaxFormPayload = {
  report: {
    id: string
    filename: string
    year: number
    status: 'processing' | 'ready' | 'error'
    created_at?: string
  }
  input: TaxFormDraftInput
  summary: TaxFormComputedSummary
  savedAt: string | null
  generatedPdfAvailable: boolean
  downloadUrl?: string
  error?: string
}

type TaxFormClientProps = {
  reportId: string
  userName: string
}

export function TaxFormClient({ reportId, userName }: TaxFormClientProps) {
  const [payload, setPayload] = useState<TaxFormPayload | null>(null)
  const [form, setForm] = useState<TaxFormDraftInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/reports/${reportId}/tax-form`, { cache: 'no-store' })
        const data = (await response.json()) as TaxFormPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Errore nel caricamento del facsimile.')
        }

        if (!active) return
        setPayload(data)
        setForm(data.input)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Errore sconosciuto.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [reportId])

  const summaryCards = useMemo(() => {
    if (!payload) return []

    return [
      { label: 'RT23 corrispettivi', value: formatCurrency(payload.summary.rt23TotalCorrispettivi) },
      { label: 'RT27 imponibile', value: formatCurrency(payload.summary.rt27ImponibileNetto) },
      { label: 'Imposta teorica', value: formatCurrency(payload.summary.rtTaxDue) },
      { label: 'IVAFE stimata', value: formatCurrency(payload.summary.rwIvafeDueEur) },
    ]
  }, [payload])

  function updateField<K extends keyof TaxFormDraftInput>(key: K, value: TaxFormDraftInput[K]) {
    setForm(current => (current ? { ...current, [key]: value } : current))
    setMessage(null)
    setError(null)
  }

  function handleNumericFieldChange(key: keyof TaxFormDraftInput, value: string) {
    const normalized = value.replace(',', '.').trim()
    if (!normalized) {
      updateField(key, null as TaxFormDraftInput[keyof TaxFormDraftInput])
      return
    }

    const parsed = Number(normalized)
    updateField(key, (Number.isFinite(parsed) ? parsed : null) as TaxFormDraftInput[keyof TaxFormDraftInput])
  }

  async function persistDraft(mode: 'save' | 'generate') {
    if (!form) return

    setError(null)
    setMessage(null)

    try {
      if (mode === 'save') {
        setSaving(true)
        const response = await fetch(`/api/reports/${reportId}/tax-form`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: form }),
        })
        const data = (await response.json()) as TaxFormPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Errore nel salvataggio del draft.')
        }

        setPayload(data)
        setForm(data.input)
        setMessage('Draft salvato in Netlify Blobs.')
        return
      }

      setGenerating(true)
      const response = await fetch(`/api/reports/${reportId}/tax-form/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: form, userName }),
      })
      const data = (await response.json()) as TaxFormPayload

      if (!response.ok) {
        throw new Error(data.error ?? 'Errore nella generazione del PDF.')
      }

      setPayload(data)
      setForm(data.input)
      setMessage('Facsimile RW/RT generato correttamente.')
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Errore sconosciuto.')
    } finally {
      setSaving(false)
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">RW / RT</span>
          <h1 className="page-title">Preparazione facsimile</h1>
        </div>
        <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Caricamento del report e dei dati RW/RT in corso.
        </div>
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">RW / RT</span>
          <h1 className="page-title">Preparazione facsimile</h1>
        </div>
        <div className="mt-8 rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error}</div>
      </div>
    )
  }

  if (!payload || !form) return null

  return (
    <div className="space-y-6">
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">RW / RT</span>
          <h1 className="page-title">Facsimile operativo quadro RW e RT</h1>
          <p className="page-subtitle">
            Compila i campi mancanti del conto estero e genera un PDF di lavoro separato dal report fiscale principale.
          </p>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Codice fiscale">
              <input value={form.taxCode} onChange={event => updateField('taxCode', event.target.value)} />
            </Field>
            <Field label="Nome broker">
              <input value={form.brokerName} onChange={event => updateField('brokerName', event.target.value)} />
            </Field>
            <Field label="Paese broker">
              <input value={form.brokerCountryCode} maxLength={2} onChange={event => updateField('brokerCountryCode', event.target.value.toUpperCase())} />
            </Field>
            <Field label="Codice titolare RW">
              <input value={form.rwOwnerCode} onChange={event => updateField('rwOwnerCode', event.target.value)} />
            </Field>
            <Field label="Codice attivita RW">
              <input value={form.rwAssetCode} onChange={event => updateField('rwAssetCode', event.target.value)} />
            </Field>
            <Field label="Giorni possesso">
              <input
                inputMode="numeric"
                value={form.rwPossessionDays ?? ''}
                onChange={event => handleNumericFieldChange('rwPossessionDays', event.target.value)}
              />
            </Field>
            <Field label="Valore iniziale RW">
              <input value={form.rwInitialValueEur ?? ''} onChange={event => handleNumericFieldChange('rwInitialValueEur', event.target.value)} />
            </Field>
            <Field label="Valore finale RW">
              <input value={form.rwFinalValueEur ?? ''} onChange={event => handleNumericFieldChange('rwFinalValueEur', event.target.value)} />
            </Field>
            <Field label="Valore massimo RW">
              <input value={form.rwMaxValueEur ?? ''} onChange={event => handleNumericFieldChange('rwMaxValueEur', event.target.value)} />
            </Field>
            <Field label="IVAFE manuale">
              <input value={form.rwIvafeOverrideEur ?? ''} onChange={event => handleNumericFieldChange('rwIvafeOverrideEur', event.target.value)} />
            </Field>
            <Field label="Minusvalenze pregresse RT">
              <input value={form.rtPriorLossesEur ?? ''} onChange={event => handleNumericFieldChange('rtPriorLossesEur', event.target.value)} />
            </Field>
            <Field label="Anno report">
              <input value={String(payload.report.year)} readOnly className="bg-slate-50 text-slate-500" />
            </Field>

            <div className="md:col-span-2">
              <Field label="Note operative">
                <textarea
                  rows={5}
                  value={form.notes}
                  onChange={event => updateField('notes', event.target.value)}
                  placeholder="Annotazioni per controllo interno o per la trascrizione sul modello ufficiale."
                />
              </Field>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Report selezionato</p>
              <p className="mt-3 text-xl font-semibold text-slate-950">{payload.report.filename}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Caricato il {payload.report.created_at ? formatDate(payload.report.created_at) : '-'}.
              </p>
              {payload.savedAt ? (
                <p className="mt-3 text-sm text-slate-500">Ultimo salvataggio: {formatDate(payload.savedAt)}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {summaryCards.map(card => (
                <div key={card.label} className="stat-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Azioni</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" disabled={saving || generating} onClick={() => void persistDraft('save')}>
                  {saving ? 'Salvataggio...' : 'Salva draft'}
                </Button>
                <Button type="button" disabled={saving || generating} onClick={() => void persistDraft('generate')}>
                  {generating ? 'Generazione...' : 'Genera PDF RW/RT'}
                </Button>
                {payload.generatedPdfAvailable ? (
                  <Link href={payload.downloadUrl ?? `/api/reports/${reportId}/tax-form/download`} className={buttonVariants('secondary')}>
                    Scarica facsimile
                  </Link>
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Il PDF RW/RT è separato dal report fiscale principale e può essere rigenerato dopo ogni modifica del draft.
              </p>
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard/reports" className={cn(buttonVariants('secondary'), 'px-4 py-2')}>
            Torna ai report
          </Link>
          <Link href={`/api/reports/${reportId}/download`} className={cn(buttonVariants('secondary'), 'px-4 py-2')}>
            Scarica report fiscale base
          </Link>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      {children}
    </label>
  )
}
