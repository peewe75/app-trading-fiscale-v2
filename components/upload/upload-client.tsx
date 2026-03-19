'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import type { Plan } from '@/types'

type UploadClientProps = {
  allowedYears: number[]
  plan: Plan
}

type ReportStatusResponse = {
  status: 'processing' | 'ready' | 'error'
  net_profit: number | null
  tax_due: number | null
}

function parseYearFromCell(value: string) {
  const match = value.trim().match(/^(\d{4})\.\d{2}\.\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/)
  if (!match) return null

  const year = Number(match[1])
  return Number.isFinite(year) ? year : null
}

function normalizeCellText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('\t', ' ')
}

function normalizeBrokerReport(source: string) {
  const parser = new DOMParser()
  const document = parser.parseFromString(source, 'text/html')
  const rows = Array.from(document.querySelectorAll('tr'))

  if (!rows.length) {
    return source
  }

  const normalizedRows = rows
    .map(row => {
      const cells: string[] = []

      Array.from(row.querySelectorAll('th, td')).forEach(cell => {
          const colspan = Number(cell.getAttribute('colspan') ?? '1')
          const text = normalizeCellText(cell.textContent ?? '')
          const safeColspan = Number.isFinite(colspan) && colspan > 0 ? colspan : 1

          cells.push(text)

          for (let index = 1; index < safeColspan; index += 1) {
            cells.push('')
          }
        })

      return cells.join('\t')
    })
    .join('\n')

  return `ATF_TSV_V1\n${normalizedRows}`
}

function extractReportYears(source: string) {
  const parser = new DOMParser()
  const document = parser.parseFromString(source, 'text/html')
  const rows = Array.from(document.querySelectorAll('tr')).map(row => {
    const cells: string[] = []

    Array.from(row.querySelectorAll('th, td')).forEach(cell => {
      const colspan = Number(cell.getAttribute('colspan') ?? '1')
      const text = normalizeCellText(cell.textContent ?? '')
      const safeColspan = Number.isFinite(colspan) && colspan > 0 ? colspan : 1

      cells.push(text)

      for (let index = 1; index < safeColspan; index += 1) {
        cells.push('')
      }
    })

    return cells
  })

  const headerIndex = rows.findIndex(
    row => row.some(cell => cell.includes('Ticket')) && row.some(cell => cell.includes('Profit'))
  )

  if (headerIndex === -1) {
    return []
  }

  return Array.from(
    new Set(
      rows
        .slice(headerIndex + 1)
        .flatMap(row => {
          const rowType = (row[2] ?? '').trim().toLowerCase()

          if (rowType === 'buy' || rowType === 'sell') {
            return [parseYearFromCell(row[8] ?? '')]
          }

          if (rowType === 'balance') {
            return [parseYearFromCell(row[1] ?? '')]
          }

          return []
        })
        .filter((year): year is number => year !== null)
    )
  ).sort((left, right) => right - left)
}

async function readJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text()

  if (!text) {
    return {} as T & { error?: string }
  }

  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    return {
      error: text.startsWith('Internal Error')
        ? 'Il file e troppo pesante per l elaborazione diretta. Riprova con il nuovo upload compattato o con un export HTML piu leggero.'
        : text,
    } as T & { error?: string }
  }
}

export function UploadClient({ allowedYears, plan }: UploadClientProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [year, setYear] = useState(allowedYears[0] ?? new Date().getFullYear())
  const [detectedYears, setDetectedYears] = useState<number[]>([])
  const [yearMessage, setYearMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [progress, setProgress] = useState(8)
  const [status, setStatus] = useState<ReportStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const processing = loading || (!!reportId && status?.status !== 'ready' && status?.status !== 'error')

  useEffect(() => {
    if (!processing) return

    const timer = window.setInterval(() => {
      setProgress(current => Math.min(current + 7, 92))
    }, 1200)

    return () => window.clearInterval(timer)
  }, [processing])

  useEffect(() => {
    if (!reportId) return

    let active = true

    const poll = async () => {
      try {
        const response = await fetch(`/api/reports/${reportId}/status`, { cache: 'no-store' })
        const data = (await response.json()) as ReportStatusResponse & { error?: string }

        if (!response.ok) {
          throw new Error(data.error ?? 'Errore nel recupero dello stato')
        }

        if (!active) return
        setStatus(data)

        if (data.status === 'ready') {
          setProgress(100)
          setLoading(false)
          window.setTimeout(() => {
            router.push(`/dashboard/reports?new=${reportId}`)
          }, 800)
          return
        }

        if (data.status === 'error') {
          setLoading(false)
          setError('Elaborazione non completata. Verifica il file e riprova.')
          return
        }

        window.setTimeout(poll, 3000)
      } catch (pollError) {
        if (!active) return
        setLoading(false)
        setError(pollError instanceof Error ? pollError.message : 'Errore durante il polling del report')
      }
    }

    void poll()

    return () => {
      active = false
    }
  }, [reportId, router])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setError(null)

    if (!nextFile) {
      setDetectedYears([])
      setYearMessage(null)
      return
    }

    const sourceHtml = await nextFile.text()
    const years = extractReportYears(sourceHtml)
    setDetectedYears(years)

    if (!years.length) {
      setYearMessage('Non sono riuscito a rilevare automaticamente l anno fiscale dal file selezionato.')
      return
    }

    const allowedDetectedYears = years.filter(candidate => allowedYears.includes(candidate))

    if (!allowedDetectedYears.length) {
      setYearMessage(`Il file contiene movimenti per ${years.join(', ')}, ma il piano attivo non consente questi anni.`)
      return
    }

    if (!allowedDetectedYears.includes(year)) {
      const suggestedYear = allowedDetectedYears[0]
      setYear(suggestedYear)
      setYearMessage(`Anni rilevati nel file: ${years.join(', ')}. Ho selezionato automaticamente il ${suggestedYear}.`)
      return
    }

    setYearMessage(`Anni rilevati nel file: ${years.join(', ')}.`)
  }

  function handleFilePickerClick() {
    fileInputRef.current?.click()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return

    setError(null)
    setStatus(null)
    setReportId(null)
    setProgress(10)
    setLoading(true)

    try {
      const sourceHtml = await file.text()
      const availableYears = extractReportYears(sourceHtml)

      if (availableYears.length > 0 && !availableYears.includes(year)) {
        throw new Error(
          `Il file caricato non contiene movimenti per il ${year}. Anni rilevati nel report: ${availableYears.join(', ')}.`
        )
      }

      const normalizedReport = normalizeBrokerReport(sourceHtml)
      const uploadFile = new File([normalizedReport], file.name, { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('year', String(year))

      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await readJsonResponse<{ reportId?: string }>(response)

      if (!response.ok || !data.reportId) {
        throw new Error(data.error ?? 'Errore durante l elaborazione del file')
      }

      setProgress(25)
      setReportId(data.reportId)
    } catch (submitError) {
      setLoading(false)
      setError(submitError instanceof Error ? submitError.message : 'Errore sconosciuto')
    }
  }

  const helperText = useMemo(() => {
    if (!status || status.status === 'processing') {
      return 'La funzione fiscale puo richiedere fino a 30 secondi. Mantieni aperta questa pagina.'
    }

    if (status.status === 'ready') {
      return `Report pronto. Netto ${formatCurrency(status.net_profit)} - imposta ${formatCurrency(status.tax_due)}`
    }

    return 'Il report e terminato con errore.'
  }, [status])

  return (
    <div className="page-panel">
      <div className="page-header">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Upload fiscale</span>
        <h1 className="page-title">Carica il report HTML del broker</h1>
        <p className="page-subtitle">
          Supporto per report MetaTrader 4 e 5. Piano attivo: <span className="font-semibold text-slate-900">{plan}</span>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5 rounded-[28px] border border-slate-200 bg-slate-50 p-6">
          <div className="space-y-2">
            <label htmlFor="year" className="text-sm font-semibold text-slate-900">
              Anno fiscale
            </label>
            <select id="year" value={year} onChange={event => setYear(Number(event.target.value))}>
              {allowedYears.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className="text-sm text-slate-500">Base e Standard consentono solo anno corrente e precedente.</p>
            {yearMessage ? <p className="text-sm text-slate-700">{yearMessage}</p> : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="file" className="text-sm font-semibold text-slate-900">
              File report broker
            </label>
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".htm,.html"
              onChange={handleFileChange}
              className="sr-only"
              required
              tabIndex={-1}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={handleFilePickerClick}>
                Seleziona file
              </Button>
              <span className="text-sm text-slate-600">
                {file ? file.name : 'Nessun file selezionato'}
              </span>
            </div>
            <p className="text-sm text-slate-500">Formati ammessi: `.htm` e `.html` esportati dal broker.</p>
            {detectedYears.length ? (
              <p className="text-sm text-slate-500">Anni rilevati: {detectedYears.join(', ')}.</p>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <Button type="submit" disabled={!file || loading} className="w-full sm:w-auto">
            {loading ? 'Invio in corso...' : 'Elabora e genera PDF'}
          </Button>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Stato elaborazione</p>
              <p className="mt-2 text-2xl font-display text-slate-950">
                {status?.status === 'ready' ? 'Completato' : status?.status === 'error' ? 'Interrotto' : 'In esecuzione'}
              </p>
            </div>
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full border text-sm font-semibold',
                processing ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              )}
            >
              {progress}%
            </div>
          </div>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-600">{helperText}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Netto fiscale</p>
              <p className="mt-3 text-xl font-semibold text-slate-950">{formatCurrency(status?.net_profit ?? null)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Imposta 26%</p>
              <p className="mt-3 text-xl font-semibold text-slate-950">{formatCurrency(status?.tax_due ?? null)}</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
