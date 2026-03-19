'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { TaxFormFieldSource, TaxFormManualOverrides, TaxFormPreview } from '@/types'

type TaxFormPayload = {
  report: TaxFormPreview['report']
  preview: TaxFormPreview
  savedAt: string | null
  generatedAt: string | null
  error?: string
}

type TaxFormClientProps = {
  reportId: string
}

type ExtractionRow = [string, string | null, TaxFormFieldSource | undefined]
type SummaryRow = [string, string]

export function TaxFormClient({ reportId }: TaxFormClientProps) {
  const [payload, setPayload] = useState<TaxFormPayload | null>(null)
  const [manualOverrides, setManualOverrides] = useState<TaxFormManualOverrides>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
        setManualOverrides(data.preview.manual_overrides ?? {})
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Errore sconosciuto.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [reportId])

  const preview = payload?.preview ?? null

  const summaryCards = useMemo(() => {
    if (!preview) return []

    return [
      { label: 'Corrispettivo RT', value: formatCurrency(preview.rt_summary.rt23TotalCorrispettivi) },
      { label: 'Costo RT', value: formatCurrency(preview.rt_summary.rt24TotalCosti) },
      { label: 'Netto imponibile RT', value: formatCurrency(preview.rt_summary.rt27ImponibileNetto) },
      { label: 'IVAFE stimata RW', value: formatCurrency(preview.rw_summary.rwIvafeDueEur) },
    ]
  }, [preview])

  async function refreshPreview() {
    setRefreshing(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/reports/${reportId}/tax-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualOverrides }),
      })
      const data = (await response.json()) as TaxFormPayload

      if (!response.ok) {
        throw new Error(data.error ?? 'Errore nel refresh dei dati RW/RT.')
      }

      setPayload(data)
      setManualOverrides(data.preview.manual_overrides ?? {})
      setMessage('Dati RW/RT rigenerati dal report HTML caricato.')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Errore sconosciuto.')
    } finally {
      setRefreshing(false)
    }
  }

  async function generatePdfs() {
    setGenerating(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/reports/${reportId}/tax-form/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualOverrides }),
      })
      const data = (await response.json()) as TaxFormPayload

      if (!response.ok) {
        throw new Error(data.error ?? 'Errore nella generazione del PDF RW/RT.')
      }

      setPayload(data)
      setManualOverrides(data.preview.manual_overrides ?? {})
      setMessage('PDF di controllo e facsimile RW/RT generati correttamente.')
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Errore sconosciuto.')
    } finally {
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
          Analisi automatica del conto in corso.
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

  if (!payload || !preview) return null

  const extractionRows: ExtractionRow[] = [
    ['Titolare', preview.account_extraction.ownerName, preview.field_sources.owner_name],
    ['Codice fiscale', preview.account_extraction.taxCode, preview.field_sources.tax_code],
    ['Account ID', preview.account_extraction.accountId, preview.field_sources.account_id],
    ['Account label', preview.account_extraction.accountLabel, 'html' as const],
    ['Broker', preview.account_extraction.brokerName, preview.field_sources.broker_name],
    ['Paese broker', preview.account_extraction.brokerCountryCode, preview.field_sources.broker_country_code],
    ['Valuta', preview.account_extraction.currency, preview.field_sources.currency],
    ['Scala conto', preview.account_extraction.isCentAccount ? 'Conto centesimale' : 'Conto standard', 'derived' as const],
    ['Metodo timeline', preview.account_extraction.timelineMethod, 'derived' as const],
    ['Prima attivita', preview.account_extraction.firstActivityAt ? formatDate(preview.account_extraction.firstActivityAt) : '-', 'derived' as const],
    ['Ultima attivita', preview.account_extraction.lastActivityAt ? formatDate(preview.account_extraction.lastActivityAt) : '-', 'derived' as const],
  ]

  const rtRows: SummaryRow[] = [
    ['RT23 corrispettivi', formatCurrency(preview.rt_summary.rt23TotalCorrispettivi)],
    ['RT24 costi', formatCurrency(preview.rt_summary.rt24TotalCosti)],
    ['RT25 plusvalenze', formatCurrency(preview.rt_summary.rt25Plusvalenze)],
    ['RT26 minusvalenze compensate', formatCurrency(preview.rt_summary.rt26MinusvalenzeCompensate)],
    ['RT27 imponibile netto', formatCurrency(preview.rt_summary.rt27ImponibileNetto)],
    ['Imposta teorica 26%', formatCurrency(preview.rt_summary.rtTaxDue)],
  ]

  const rwRows: SummaryRow[] = [
    ['Codice titolare RW', preview.rw_summary.rwOwnerCode],
    ['Codice attivita RW', preview.rw_summary.rwAssetCode],
    ['Paese broker', preview.rw_summary.brokerCountryCode ?? '-'],
    ['Valore iniziale RW', formatCurrency(preview.rw_summary.rwInitialValueEur)],
    ['Valore finale RW', formatCurrency(preview.rw_summary.rwFinalValueEur)],
    ['Valore massimo RW', formatCurrency(preview.rw_summary.rwMaxValueEur)],
    ['Giorni possesso', String(preview.rw_summary.rwPossessionDays)],
    ['IVAFE stimata', formatCurrency(preview.rw_summary.rwIvafeDueEur)],
  ]

  const editableFields = [
    {
      key: 'ownerName' as const,
      label: 'Intestatario manuale',
      placeholder: 'Compila solo se il nome non e ricavabile dal report.',
      visible: preview.field_sources.owner_name !== 'html',
    },
    {
      key: 'taxCode' as const,
      label: 'Codice fiscale manuale',
      placeholder: 'Correggi o integra il codice fiscale se serve.',
      visible: true,
    },
    {
      key: 'brokerName' as const,
      label: 'Nome broker manuale',
      placeholder: 'Compila se il broker non e ricavabile in modo affidabile.',
      visible: preview.field_sources.broker_name !== 'html',
    },
    {
      key: 'brokerCountryCode' as const,
      label: 'Paese broker manuale',
      placeholder: 'Sigla ISO a 2 lettere, es. CY, SC, MU.',
      visible: preview.field_sources.broker_country_code !== 'html',
    },
  ].filter(field => field.visible)

  return (
    <div className="space-y-6">
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">RW / RT</span>
          <h1 className="page-title">Facsimile operativo quadro RW e RT</h1>
          <p className="page-subtitle">
            Estrazione automatica dal file HTML del broker. Documento di supporto personale per semplificare il lavoro del commercialista.
          </p>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Report selezionato</p>
              <p className="mt-3 text-xl font-semibold text-slate-950">{payload.report.filename}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetaRow label="Anno fiscale" value={String(payload.report.year)} />
                <MetaRow label="Creato il" value={payload.report.created_at ? formatDate(payload.report.created_at) : '-'} />
                <MetaRow label="Ultimo refresh" value={payload.savedAt ? formatDate(payload.savedAt) : '-'} />
                <MetaRow label="Ultima generazione PDF" value={payload.generatedAt ? formatDate(payload.generatedAt) : '-'} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Anteprima automatica</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">Dati estratti dal conto caricato</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Un upload corrisponde a un solo conto trading e genera una sola riga RW. Nessuna aggregazione tra conti diversi dello stesso utente.
              </p>

              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Valore</th>
                      <th>Origine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractionRows.map(([label, value, source]) => (
                      <tr key={label}>
                        <td className="font-medium text-slate-900">{label}</td>
                        <td>{value && value !== '' ? value : '-'}</td>
                        <td>{sourceLabel(source)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <SummaryPanel title="Quadro RT" rows={rtRows} />
              <SummaryPanel title="Quadro RW" rows={rwRows} />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Origine dati</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {Object.entries(preview.field_sources).map(([field, source]) => (
                  <div key={field} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{field}</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{sourceLabel(source)}</p>
                  </div>
                ))}
              </div>
            </div>

            {editableFields.length ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Integrazione manuale</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">Campi non ricavati con certezza</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  I calcoli fiscali restano automatici. Qui puoi completare solo i dati non economici che non arrivano in modo affidabile dall HTML o dal profilo utente.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {editableFields.map(field => (
                    <label key={field.key} className="space-y-2">
                      <span className="text-sm font-semibold text-slate-900">{field.label}</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                        value={manualOverrides[field.key] ?? ''}
                        placeholder={field.placeholder}
                        maxLength={field.key === 'brokerCountryCode' ? 2 : undefined}
                        onChange={event =>
                          setManualOverrides(current => ({
                            ...current,
                            [field.key]:
                              field.key === 'brokerCountryCode'
                                ? event.target.value.toUpperCase()
                                : event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {summaryCards.map(card => (
                <div key={card.label} className="stat-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
                </div>
              ))}
            </div>

            <NoticePanel tone="slate" title="Documento di supporto" lines={preview.disclaimers} />

            {preview.warnings.length ? (
              <NoticePanel
                tone="amber"
                title="Warning non bloccanti"
                lines={preview.warnings.map(warning => warning.message)}
              />
            ) : null}

            {preview.blocking_issues.length ? (
              <NoticePanel
                tone="rose"
                title="Blocchi reali"
                lines={preview.blocking_issues.map(issue => issue.message)}
              />
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Azioni</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" disabled={refreshing || generating} onClick={() => void refreshPreview()}>
                  {refreshing ? 'Aggiornamento...' : 'Rigenera dati'}
                </Button>
                <Button
                  type="button"
                  disabled={refreshing || generating || !preview.can_generate_facsimile_pdf}
                  onClick={() => void generatePdfs()}
                >
                  {generating ? 'Generazione...' : 'Genera PDF'}
                </Button>
                {preview.internal_pdf_available ? (
                  <Link href={preview.internal_download_url} className={buttonVariants('secondary')}>
                    Scarica PDF di controllo
                  </Link>
                ) : null}
                {preview.facsimile_pdf_available ? (
                  <Link href={preview.facsimile_download_url} className={buttonVariants('secondary')}>
                    Scarica facsimile RW/RT
                  </Link>
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Se un dato non e ricavabile automaticamente, puoi integrarlo qui sopra senza alterare i calcoli fiscali del report.
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function SummaryPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{title}</p>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">{label}</p>
            <p className="text-sm font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function NoticePanel({
  title,
  lines,
  tone,
}: {
  title: string
  lines: string[]
  tone: 'slate' | 'amber' | 'rose'
}) {
  const styles =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'rose'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <div className={cn('rounded-[28px] border p-6', styles)}>
      <p className="text-xs font-semibold uppercase tracking-[0.28em]">{title}</p>
      <div className="mt-4 space-y-2">
        {lines.map(line => (
          <p key={line} className="text-sm leading-7">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

function sourceLabel(source: TaxFormFieldSource | undefined) {
  switch (source) {
    case 'html':
      return 'HTML broker'
    case 'profile':
      return 'Profilo utente'
    case 'mapping':
      return 'Mapping broker'
    case 'manual':
      return 'Manuale utente'
    case 'derived':
      return 'Derivato'
    default:
      return 'Fallback'
  }
}
