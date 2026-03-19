import { load } from 'cheerio'
import PDFDocument from 'pdfkit'
import type { TaxResults } from '@/lib/report-engine'
import type {
  TaxFormAccountExtraction,
  TaxFormBlockingIssue,
  TaxFormFieldSource,
  TaxFormManualOverrides,
  TaxFormPreview,
  TaxFormPreviewRecord,
  TaxFormRtSummary,
  TaxFormRwSummary,
  TaxFormWarning,
} from '@/types'

type TaxProfileInput = {
  displayName: string | null
  taxCode: string | null
}

type ReportPreviewInput = {
  report: TaxFormPreview['report']
  sourceHtml: string
  results: TaxResults
  profile: TaxProfileInput
  manualOverrides?: TaxFormManualOverrides
  internalPdfAvailable?: boolean
  facsimilePdfAvailable?: boolean
}

type TaxFormPdfKind = 'control' | 'facsimile'

type BrokerEvent = {
  date: Date
  kind: string
  symbol: string
  comment: string
  deltaRaw: number
  runningBalanceRaw: number | null
}

type BrokerMetadata = {
  ownerName: string | null
  accountId: string | null
  accountLabel: string | null
  companyName: string | null
  currency: string | null
}

type ParsedTaxFormContext = {
  metadata: BrokerMetadata
  events: BrokerEvent[]
  timelineMethod: TaxFormAccountExtraction['timelineMethod']
}

type ResolvedValue<T> = {
  value: T
  source: TaxFormFieldSource
}

type DerivedTimeline = {
  openingBalanceEur: number | null
  closingBalanceEur: number | null
  maxBalanceEur: number | null
  possessionDays: number
  firstActivityAt: string | null
  lastActivityAt: string | null
}

type BrokerCountryRule = {
  match: RegExp
  code: string
}

const NORMALIZED_REPORT_PREFIX = 'ATF_TSV_V1\n'
const RW_OWNER_CODE = '1'
const RW_ASSET_CODE = '14'
const PAGE_MARGIN = 44
const CARD_RADIUS = 14
const BORDER_COLOR = '#cbd5e1'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#475569'
const TEXT_WARNING = '#b45309'
const FILL_SOFT = '#f8fafc'
const FILL_WARNING = '#fffbeb'
const FILL_HEADER = '#e2e8f0'
const DISCLAIMER_LINES = [
  'Documento di supporto personale generato da App Trading Fiscale.',
  'Non sostituisce il controllo del commercialista.',
  'Non e un documento ufficiale da depositare.',
]

const BROKER_COUNTRY_RULES: BrokerCountryRule[] = [
  { match: /\bpu\s*prime\s*ltd\b/i, code: 'MU' },
  { match: /\bpu\s*prime\s*limited\b/i, code: 'SC' },
]

export function createTaxFormPreview(args: ReportPreviewInput): TaxFormPreview {
  const manualOverrides = normalizeManualOverrides(args.manualOverrides)
  const warnings: TaxFormWarning[] = []
  const blockingIssues: TaxFormBlockingIssue[] = []
  const fieldSources: Record<string, TaxFormFieldSource> = {}
  const parsedContext = parseTaxFormContext(args.sourceHtml)
  const scaleResolution = detectScaleFactor(parsedContext)

  if (scaleResolution.warning) {
    warnings.push(scaleResolution.warning)
  }

  const ownerName = pickResolvedValue(
    [
      resolvedString(parsedContext.metadata.ownerName, 'html'),
      resolvedString(manualOverrides.ownerName, 'manual'),
      resolvedString(args.profile.displayName, 'profile'),
      { value: 'Utente registrato', source: 'fallback' as const },
    ],
    'owner_name',
    fieldSources
  )

  const accountId = pickResolvedValue(
    [resolvedString(parsedContext.metadata.accountId, 'html'), { value: null, source: 'fallback' as const }],
    'account_id',
    fieldSources
  )

  const brokerName = pickResolvedValue(
    [
      resolvedString(parsedContext.metadata.companyName, 'html'),
      resolvedString(deriveBrokerName(parsedContext.metadata.accountLabel), 'derived'),
      resolvedString(manualOverrides.brokerName, 'manual'),
      { value: 'Broker non identificato', source: 'fallback' as const },
    ],
    'broker_name',
    fieldSources
  )

  const currency = pickResolvedValue(
    [resolvedString(parsedContext.metadata.currency, 'html'), { value: 'EUR', source: 'fallback' as const }],
    'currency',
    fieldSources
  )

  const taxCode = pickResolvedValue(
    [
      resolvedString(normalizeTaxCode(manualOverrides.taxCode), 'manual'),
      resolvedString(normalizeTaxCode(args.profile.taxCode), 'profile'),
      { value: null, source: 'fallback' as const },
    ],
    'tax_code',
    fieldSources
  )

  if (!taxCode) {
    warnings.push({
      code: 'missing-tax-code',
      message: 'Codice fiscale non presente nel profilo utente. Il PDF verra generato comunque con segnalazione.',
      field: 'tax_code',
      source: 'fallback',
    })
  } else if (!looksLikeTaxCode(taxCode)) {
    warnings.push({
      code: 'invalid-tax-code',
      message: `Il codice fiscale "${taxCode}" non rispetta il formato atteso a 16 caratteri. Verificarlo con il commercialista.`,
      field: 'tax_code',
      source: 'profile',
    })
  }

  const brokerCountry = resolveBrokerCountry(parsedContext.metadata, brokerName, manualOverrides.brokerCountryCode)
  fieldSources.broker_country_code = brokerCountry.source

  if (!brokerCountry.value) {
    warnings.push({
      code: 'missing-broker-country',
      message: 'Paese broker non determinato automaticamente. Il facsimile verra prodotto con campo da verificare.',
      field: 'broker_country_code',
      source: brokerCountry.source,
    })
  } else if (brokerCountry.source === 'mapping') {
    warnings.push({
      code: 'mapped-broker-country',
      message: `Paese broker impostato automaticamente su ${brokerCountry.value} da mapping interno. Verificare che corrisponda all entita contrattuale effettiva.`,
      field: 'broker_country_code',
      source: 'mapping',
    })
  }

  const timeline = deriveTimelineForYear(
    parsedContext.events,
    args.report.year,
    scaleResolution.scaleFactor,
    parsedContext.timelineMethod,
    warnings,
    blockingIssues
  )

  fieldSources.rw_initial_value = timeline.openingBalanceEur === null ? 'fallback' : 'derived'
  fieldSources.rw_final_value = timeline.closingBalanceEur === null ? 'fallback' : 'derived'
  fieldSources.rw_max_value = timeline.maxBalanceEur === null ? 'fallback' : 'derived'
  fieldSources.rw_possession_days = 'derived'
  fieldSources.rw_owner_code = 'derived'
  fieldSources.rw_asset_code = 'derived'
  fieldSources.rt_summary = 'derived'

  const rtSummary = computeRtSummary(args.results)
  const rwSummary = computeRwSummary({
    year: args.report.year,
    openingBalanceEur: timeline.openingBalanceEur,
    closingBalanceEur: timeline.closingBalanceEur,
    maxBalanceEur: timeline.maxBalanceEur,
    possessionDays: timeline.possessionDays,
    brokerCountryCode: brokerCountry.value,
  })

  if (timeline.openingBalanceEur === null || timeline.closingBalanceEur === null || timeline.maxBalanceEur === null) {
    blockingIssues.push({
      code: 'incomplete-rw-timeline',
      message: 'Impossibile ricostruire in modo attendibile i valori RW dal report caricato.',
    })
  }

  const accountExtraction: TaxFormAccountExtraction = {
    ownerName,
    taxCode,
    accountId,
    accountLabel: parsedContext.metadata.accountLabel,
    brokerName,
    companyName: parsedContext.metadata.companyName,
    brokerCountryCode: brokerCountry.value,
    currency,
    isCentAccount: scaleResolution.scaleFactor === 100,
    scaleFactor: scaleResolution.scaleFactor,
    timelineMethod: parsedContext.timelineMethod,
    firstActivityAt: timeline.firstActivityAt,
    lastActivityAt: timeline.lastActivityAt,
  }

  const dedupedBlockingIssues = dedupeBlockingIssues(blockingIssues)

  return {
    report: args.report,
    account_extraction: accountExtraction,
    rt_summary: rtSummary,
    rw_summary: rwSummary,
    field_sources: fieldSources,
    warnings,
    blocking_issues: dedupedBlockingIssues,
    disclaimers: DISCLAIMER_LINES,
    can_generate_internal_pdf: dedupedBlockingIssues.length === 0,
    can_generate_facsimile_pdf: dedupedBlockingIssues.length === 0,
    internal_pdf_available: args.internalPdfAvailable ?? false,
    facsimile_pdf_available: args.facsimilePdfAvailable ?? false,
    internal_download_url: `/api/reports/${args.report.id}/tax-form/control/download`,
    facsimile_download_url: `/api/reports/${args.report.id}/tax-form/download`,
    manual_overrides: manualOverrides,
  }
}

export function createTaxFormPreviewRecord(args: {
  reportId: string
  preview: TaxFormPreview
  manualOverrides?: TaxFormManualOverrides
  generatedAt?: string | null
  internalPdfBlobKey?: string | null
  facsimilePdfBlobKey?: string | null
}): TaxFormPreviewRecord {
  return {
    reportId: args.reportId,
    preview: args.preview,
    manualOverrides: normalizeManualOverrides(args.manualOverrides ?? args.preview.manual_overrides),
    savedAt: new Date().toISOString(),
    generatedAt: args.generatedAt ?? null,
    internalPdfBlobKey: args.internalPdfBlobKey ?? null,
    facsimilePdfBlobKey: args.facsimilePdfBlobKey ?? null,
  }
}

export function parseTaxFormPreviewRecord(raw: string | null): TaxFormPreviewRecord | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<TaxFormPreviewRecord>
    if (!parsed.reportId || !parsed.preview) return null

    return {
      reportId: parsed.reportId,
      preview: parsed.preview as TaxFormPreview,
      manualOverrides: normalizeManualOverrides(parsed.manualOverrides),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null,
      internalPdfBlobKey: typeof parsed.internalPdfBlobKey === 'string' ? parsed.internalPdfBlobKey : null,
      facsimilePdfBlobKey: typeof parsed.facsimilePdfBlobKey === 'string' ? parsed.facsimilePdfBlobKey : null,
    }
  } catch {
    return null
  }
}

export async function generateTaxFormPdf(args: {
  preview: TaxFormPreview
  kind: TaxFormPdfKind
}): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: args.kind === 'control' ? `Controllo RW RT ${args.preview.report.year}` : `Facsimile RW RT ${args.preview.report.year}`,
      Author: 'App Trading Fiscale',
      Subject:
        args.kind === 'control'
          ? 'PDF interno di controllo RW e RT'
          : 'Facsimile operativo RW e RT per supporto al commercialista',
    },
  })

  const chunks: Buffer[] = []
  document.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))

  let pageNumber = 1
  let y = 110
  drawDocumentChrome(document, args.preview, args.kind, pageNumber)
  y = drawLeadSection(document, args.preview, args.kind, y)

  if (args.kind === 'control') {
    y = drawWarningsSection(document, args.preview.warnings, y)
    y = drawExtractionSection(document, args.preview, y)
    y = drawRtSection(document, args.preview.rt_summary, y, 'PDF di controllo RT')
    y = drawRwSection(document, args.preview.rw_summary, y, 'PDF di controllo RW')
    drawFieldSourcesSection(document, args.preview.field_sources, y)
  } else {
    y = drawWarningsSection(document, args.preview.warnings, y)
    y = drawRtSection(document, args.preview.rt_summary, y, 'Quadro RT')
    y = drawRwSection(document, args.preview.rw_summary, y, 'Quadro RW')
    drawDisclaimerCard(document, args.preview.disclaimers, y)
  }

  const range = document.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index)
    pageNumber = index + 1
    drawDocumentChrome(document, args.preview, args.kind, pageNumber)
  }

  document.end()

  await new Promise<void>((resolve, reject) => {
    document.on('end', resolve)
    document.on('error', reject)
  })

  return Buffer.concat(chunks)
}

function parseTaxFormContext(htmlContent: string): ParsedTaxFormContext {
  const rows = extractRows(htmlContent)
  const metadata = extractMetadata(rows)
  const dealEvents = extractDealBalanceEvents(rows)

  if (dealEvents.length > 0) {
    return {
      metadata,
      events: dealEvents,
      timelineMethod: 'deal-balance',
    }
  }

  const fallbackEvents = extractLegacyEvents(rows)
  return {
    metadata,
    events: fallbackEvents,
    timelineMethod: fallbackEvents.length > 0 ? 'event-rebuild' : 'unavailable',
  }
}

function extractRows(content: string): string[][] {
  if (content.startsWith(NORMALIZED_REPORT_PREFIX)) {
    return content
      .slice(NORMALIZED_REPORT_PREFIX.length)
      .split('\n')
      .map(line => line.split('\t').map(cell => cell.trim()))
      .filter(row => row.some(cell => cell.length > 0))
  }

  const sanitized = content.replace(/\0/g, '')
  const $ = load(sanitized)
  const rows: string[][] = []

  $('tr').each((_, row) => {
    const cells: string[] = []

    $(row)
      .find('td, th')
      .each((__, cell) => {
        const text = $(cell).text().replace(/\s+/g, ' ').trim()
        const colspan = Number($(cell).attr('colspan') ?? '1')
        const safeColspan = Number.isFinite(colspan) && colspan > 0 ? colspan : 1

        cells.push(text)
        for (let index = 1; index < safeColspan; index += 1) {
          cells.push('')
        }
      })

    if (cells.length > 0) {
      rows.push(cells)
    }
  })

  return rows
}

function extractMetadata(rows: string[][]): BrokerMetadata {
  const ownerName = findLabelValue(rows, 'Name')
  const accountValue = findLabelValue(rows, 'Account')
  const companyName = findLabelValue(rows, 'Company')
  const accountId = accountValue?.match(/^([^\s(]+)/)?.[1] ?? null
  const accountLabel = accountValue ?? null
  const currencyMatch = accountValue?.match(/\(([A-Z]{3})\s*,/i)
  const currency = currencyMatch?.[1]?.toUpperCase() ?? null

  return {
    ownerName,
    accountId,
    accountLabel,
    companyName,
    currency,
  }
}

function findLabelValue(rows: string[][], label: string) {
  const normalizedLabel = `${label.toLowerCase()}:`

  for (const row of rows) {
    const labelIndex = row.findIndex(cell => cell.trim().toLowerCase() === normalizedLabel)
    if (labelIndex === -1) continue

    const value = row
      .slice(labelIndex + 1)
      .map(cell => cell.trim())
      .find(Boolean)

    if (value) return value
  }

  return null
}

function extractDealBalanceEvents(rows: string[][]): BrokerEvent[] {
  const headerIndex = rows.findIndex(row => {
    const normalized = row.map(normalizeHeaderCell)
    return normalized.includes('deal') && normalized.includes('type') && normalized.includes('profit') && normalized.includes('balance')
  })

  if (headerIndex === -1) return []

  const headers = rows[headerIndex].map(normalizeHeaderCell)
  const timeIndex = headers.indexOf('time')
  const typeIndex = headers.indexOf('type')
  const symbolIndex = headers.indexOf('symbol')
  const commentIndex = headers.indexOf('comment')
  const commissionIndex = headers.indexOf('commission')
  const feeIndex = headers.indexOf('fee')
  const swapIndex = headers.indexOf('swap')
  const profitIndex = headers.indexOf('profit')
  const balanceIndex = headers.indexOf('balance')

  if (timeIndex === -1 || typeIndex === -1 || profitIndex === -1 || balanceIndex === -1) return []

  const events: BrokerEvent[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    const date = parseDate(row[timeIndex] ?? '')
    if (!date) continue

    const kind = (row[typeIndex] ?? '').trim().toLowerCase()
    if (!kind) continue

    const commission = parseNumber(row[commissionIndex] ?? '')
    const fee = parseNumber(row[feeIndex] ?? '')
    const swap = parseNumber(row[swapIndex] ?? '')
    const profit = parseNumber(row[profitIndex] ?? '')

    events.push({
      date,
      kind,
      symbol: (row[symbolIndex] ?? '').trim(),
      comment: (row[commentIndex] ?? '').trim(),
      deltaRaw: roundRaw(profit + commission + fee + swap),
      runningBalanceRaw: parseMaybeNumber(row[balanceIndex] ?? ''),
    })
  }

  return events.sort((left, right) => left.date.getTime() - right.date.getTime())
}

function extractLegacyEvents(rows: string[][]): BrokerEvent[] {
  const headerIndex = rows.findIndex(row => {
    const normalized = row.map(normalizeHeaderCell)
    return normalized.includes('ticket') && normalized.includes('type') && normalized.includes('profit')
  })

  if (headerIndex === -1) return []

  const headers = rows[headerIndex].map(normalizeHeaderCell)
  const typeIndex = headers.indexOf('type')
  const symbolIndex = Math.max(headers.indexOf('item'), headers.indexOf('symbol'))
  const commissionIndex = headers.indexOf('commission')
  const swapIndex = headers.indexOf('swap')
  const profitIndex = headers.indexOf('profit')
  const closeTimeIndex = headers.indexOf('close time')
  const timeIndex = closeTimeIndex >= 0 ? closeTimeIndex : headers.lastIndexOf('time')

  if (typeIndex === -1 || profitIndex === -1 || timeIndex === -1) return []

  const events: BrokerEvent[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    const kind = (row[typeIndex] ?? '').trim().toLowerCase()
    const date = parseDate(row[timeIndex] ?? '')

    if (!date || !kind) continue
    if (!['buy', 'sell', 'balance'].includes(kind)) continue

    const commission = parseNumber(row[commissionIndex] ?? '')
    const swap = parseNumber(row[swapIndex] ?? '')
    const profit = parseNumber(row[profitIndex] ?? '')
    const trailingText =
      [...row]
        .reverse()
        .find(cell => cell.trim() && Number.isNaN(Number(cell.replace(/\s/g, '').replace(',', '.')))) ?? ''

    events.push({
      date,
      kind,
      symbol: (row[symbolIndex] ?? '').trim(),
      comment: trailingText.trim(),
      deltaRaw: roundRaw(profit + commission + swap),
      runningBalanceRaw: null,
    })
  }

  return events.sort((left, right) => left.date.getTime() - right.date.getTime())
}

function computeRtSummary(results: TaxResults): TaxFormRtSummary {
  const rt23TotalCorrispettivi = roundCurrency(results.corrispettivo)
  const rt24TotalCosti = roundCurrency(results.costo)
  const rt25Plusvalenze = roundCurrency(Math.max(0, rt23TotalCorrispettivi - rt24TotalCosti))
  const rt26MinusvalenzeCompensate = 0
  const rt27ImponibileNetto = rt25Plusvalenze

  return {
    year: results.year,
    corrispettivo: rt23TotalCorrispettivi,
    costo: rt24TotalCosti,
    rt23TotalCorrispettivi,
    rt24TotalCosti,
    rt25Plusvalenze,
    rt26MinusvalenzeCompensate,
    rt27ImponibileNetto,
    rtTaxDue: roundCurrency(rt27ImponibileNetto * 0.26),
  }
}

function computeRwSummary(args: {
  year: number
  openingBalanceEur: number | null
  closingBalanceEur: number | null
  maxBalanceEur: number | null
  possessionDays: number
  brokerCountryCode: string | null
}): TaxFormRwSummary {
  const closingBalanceEur = roundCurrency(args.closingBalanceEur ?? 0)
  const possessionDays = args.possessionDays

  return {
    rwInitialValueEur: roundCurrency(args.openingBalanceEur ?? 0),
    rwFinalValueEur: closingBalanceEur,
    rwMaxValueEur: roundCurrency(args.maxBalanceEur ?? 0),
    rwPossessionDays: possessionDays,
    rwIvafeDueEur: roundCurrency((closingBalanceEur * 0.002 * possessionDays) / getDaysInYear(args.year)),
    rwOwnerCode: RW_OWNER_CODE,
    rwAssetCode: RW_ASSET_CODE,
    brokerCountryCode: args.brokerCountryCode,
  }
}

function deriveTimelineForYear(
  events: BrokerEvent[],
  year: number,
  scaleFactor: number,
  timelineMethod: TaxFormAccountExtraction['timelineMethod'],
  warnings: TaxFormWarning[],
  blockingIssues: TaxFormBlockingIssue[]
): DerivedTimeline {
  if (!events.length) {
    blockingIssues.push({
      code: 'missing-account-events',
      message: 'Il report non contiene uno storico conto sufficiente per ricostruire la riga RW.',
    })

    return {
      openingBalanceEur: null,
      closingBalanceEur: null,
      maxBalanceEur: null,
      possessionDays: 0,
      firstActivityAt: null,
      lastActivityAt: null,
    }
  }

  const normalizedEvents = events
    .map(event => ({
      date: event.date,
      kind: event.kind,
      symbol: event.symbol,
      comment: event.comment,
      deltaEur: roundCurrency(event.deltaRaw / scaleFactor),
      runningBalanceEur:
        event.runningBalanceRaw === null ? null : roundCurrency(event.runningBalanceRaw / scaleFactor),
    }))
    .sort((left, right) => left.date.getTime() - right.date.getTime())

  let runningBalance = 0
  const timeline = normalizedEvents.map(event => {
    const nextBalance = event.runningBalanceEur ?? roundCurrency(runningBalance + event.deltaEur)
    runningBalance = nextBalance
    return {
      ...event,
      runningBalanceEur: nextBalance,
    }
  })

  if (timelineMethod === 'event-rebuild') {
    warnings.push({
      code: 'rebuilt-balance-timeline',
      message: 'Saldo conto ricostruito da movimenti storici senza colonna Balance esplicita. Verificare i valori RW.',
      source: 'derived',
    })
  }

  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const yearEndExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
  const beforeYear = timeline.filter(event => event.date.getTime() < yearStart.getTime())
  const withinYear = timeline.filter(
    event => event.date.getTime() >= yearStart.getTime() && event.date.getTime() < yearEndExclusive.getTime()
  )
  const firstEvent = timeline[0]
  const lastEvent = timeline.at(-1) ?? null

  let openingBalance = beforeYear.at(-1)?.runningBalanceEur ?? null
  if (openingBalance === null && withinYear.length > 0) {
    openingBalance = 0
    warnings.push({
      code: 'opening-balance-assumed-zero',
      message: `Nessun saldo storico precedente al ${year}. Il valore iniziale RW e stato impostato a zero.`,
      field: 'rw_initial_value',
      source: 'derived',
    })
  }

  if (openingBalance === null && withinYear.length === 0) {
    blockingIssues.push({
      code: 'missing-year-activity',
      message: `Il report non contiene attivita o saldo utile per l anno fiscale ${year}.`,
    })
  }

  const closingEvent = withinYear.at(-1) ?? beforeYear.at(-1) ?? null
  const closingBalance = closingEvent?.runningBalanceEur ?? openingBalance

  if (withinYear.length > 0) {
    const lastWithinYear = withinYear.at(-1)
    if (lastWithinYear && !isSameUtcDay(lastWithinYear.date, new Date(Date.UTC(year, 11, 31)))) {
      warnings.push({
        code: 'closing-balance-carried-forward',
        message: 'Valore finale RW derivato dall ultimo saldo disponibile dell anno, non da un movimento esattamente al 31 dicembre.',
        field: 'rw_final_value',
        source: 'derived',
      })
    }
  }

  const candidateBalances = [
    openingBalance ?? 0,
    ...withinYear.map(event => event.runningBalanceEur),
    closingBalance ?? 0,
  ]
  const maxBalance = candidateBalances.length ? Math.max(...candidateBalances) : null
  const possessionDays = calculatePossessionDays({
    openingBalance: openingBalance ?? 0,
    events: withinYear.map(event => ({ date: event.date, balance: event.runningBalanceEur })),
    year,
  })

  return {
    openingBalanceEur: openingBalance,
    closingBalanceEur: closingBalance,
    maxBalanceEur: maxBalance,
    possessionDays,
    firstActivityAt: firstEvent?.date.toISOString() ?? null,
    lastActivityAt: lastEvent?.date.toISOString() ?? null,
  }
}

function detectScaleFactor(parsedContext: ParsedTaxFormContext) {
  const metadataText = [
    parsedContext.metadata.accountLabel,
    parsedContext.metadata.companyName,
    parsedContext.metadata.ownerName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/\bcent\b|\bcents\b|\bcent account\b/.test(metadataText)) {
    return {
      scaleFactor: 100,
      warning: {
        code: 'cent-account-detected',
        message: 'Scala monetaria del conto rilevata automaticamente come centesimale.',
        source: 'derived' as const,
      },
    }
  }

  const balances = parsedContext.events
    .map(event => Math.abs(event.runningBalanceRaw ?? 0))
    .filter(value => value > 0)
    .sort((left, right) => left - right)
  const deltas = parsedContext.events
    .map(event => Math.abs(event.deltaRaw))
    .filter(value => value > 0)
    .sort((left, right) => left - right)

  const medianBalance = balances.length ? balances[Math.floor(balances.length / 2)] : 0
  const medianDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0
  const scaleFactor = medianBalance >= 20000 || medianDelta >= 250 ? 100 : 1

  return {
    scaleFactor,
    warning:
      scaleFactor === 100
        ? ({
            code: 'cent-account-detected',
            message: 'Scala monetaria del conto rilevata automaticamente come centesimale.',
            source: 'derived',
          } satisfies TaxFormWarning)
        : null,
  }
}

function resolveBrokerCountry(
  metadata: BrokerMetadata,
  brokerName: string | null,
  manualOverride?: string | null
): ResolvedValue<string | null> {
  const normalizedManual = normalizeCountryCode(manualOverride)
  if (normalizedManual) {
    return {
      value: normalizedManual,
      source: 'manual',
    }
  }

  const candidates = [metadata.companyName, brokerName, metadata.accountLabel].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const rule = BROKER_COUNTRY_RULES.find(entry => entry.match.test(candidate))
    if (rule) {
      return {
        value: rule.code,
        source: 'mapping',
      }
    }
  }

  return {
    value: null,
    source: 'fallback',
  }
}

function deriveBrokerName(accountLabel: string | null) {
  if (!accountLabel) return null

  const match = accountLabel.match(/\(([^)]+)\)/)
  if (!match) return null

  const parts = match[1].split(',').map(part => part.trim()).filter(Boolean)
  return parts[1] ?? null
}

function resolvedString(value: string | null | undefined, source: TaxFormFieldSource) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? ({ value: normalized, source } as ResolvedValue<string>) : null
}

function pickResolvedValue<T>(
  values: Array<ResolvedValue<T | null> | null>,
  fieldKey: string,
  fieldSources: Record<string, TaxFormFieldSource>
): T | null {
  const resolved = values.find(Boolean) as ResolvedValue<T | null> | undefined
  if (!resolved) {
    fieldSources[fieldKey] = 'fallback'
    return null
  }

  fieldSources[fieldKey] = resolved.source
  return resolved.value
}

function normalizeTaxCode(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/g, '').trim().toUpperCase()
  return normalized || null
}

function normalizeCountryCode(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/g, '').trim().toUpperCase()
  return normalized || null
}

function normalizeManualOverrides(overrides?: TaxFormManualOverrides | null): TaxFormManualOverrides {
  return {
    ownerName: (overrides?.ownerName ?? '').trim() || null,
    taxCode: normalizeTaxCode(overrides?.taxCode),
    brokerName: (overrides?.brokerName ?? '').trim() || null,
    brokerCountryCode: normalizeCountryCode(overrides?.brokerCountryCode),
  }
}

function looksLikeTaxCode(value: string) {
  return /^[A-Z0-9]{16}$/.test(value)
}

function calculatePossessionDays(args: {
  openingBalance: number
  events: Array<{ date: Date; balance: number }>
  year: number
}) {
  const checkpoints: Array<{ date: Date; balance: number }> = [
    { date: new Date(Date.UTC(args.year, 0, 1, 0, 0, 0)), balance: args.openingBalance },
    ...args.events,
    { date: new Date(Date.UTC(args.year + 1, 0, 1, 0, 0, 0)), balance: args.events.at(-1)?.balance ?? args.openingBalance },
  ]

  let days = 0

  for (let index = 0; index < checkpoints.length - 1; index += 1) {
    const current = checkpoints[index]
    const next = checkpoints[index + 1]
    if (current.balance <= 0) continue

    const start = truncateUtcDay(current.date)
    const end = truncateUtcDay(new Date(next.date.getTime() - 1))
    const span = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    days += Math.max(0, span)
  }

  return Math.min(days, getDaysInYear(args.year))
}

function drawDocumentChrome(
  doc: PDFKit.PDFDocument,
  preview: TaxFormPreview,
  kind: TaxFormPdfKind,
  pageNumber: number
) {
  const footerY = doc.page.height - PAGE_MARGIN - 14
  const title = kind === 'control' ? 'PDF controllo RW/RT' : 'Facsimile operativo RW/RT'

  doc.save()
  doc.strokeColor(BORDER_COLOR).lineWidth(0.8)
  doc.moveTo(PAGE_MARGIN, 76).lineTo(doc.page.width - PAGE_MARGIN, 76).stroke()
  doc.moveTo(PAGE_MARGIN, footerY - 12).lineTo(doc.page.width - PAGE_MARGIN, footerY - 12).stroke()
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(14).text('App Trading Fiscale', PAGE_MARGIN, 40)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
  doc.text(title, PAGE_MARGIN, 58)
  doc.text(`Report ${preview.report.filename}`, doc.page.width - PAGE_MARGIN - 220, 44, {
    width: 220,
    align: 'right',
  })
  doc.text(`Pagina ${pageNumber}`, doc.page.width - PAGE_MARGIN - 220, 58, {
    width: 220,
    align: 'right',
  })
  doc.text(`Report ID ${preview.report.id}`, PAGE_MARGIN, footerY, { lineBreak: false })
  doc.text(`Anno ${preview.report.year}`, doc.page.width - PAGE_MARGIN - 80, footerY, {
    width: 80,
    align: 'right',
    lineBreak: false,
  })
  doc.restore()
}

function drawLeadSection(doc: PDFKit.PDFDocument, preview: TaxFormPreview, kind: TaxFormPdfKind, startY: number) {
  const height = kind === 'control' ? 164 : 144
  drawCard(doc, startY, height, FILL_SOFT)

  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text('USO PERSONALE', PAGE_MARGIN + 16, startY + 16)
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(20).text(
    kind === 'control' ? 'Controllo automatico RW e RT' : 'Facsimile operativo quadro RW e RT',
    PAGE_MARGIN + 16,
    startY + 34
  )
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)

  preview.disclaimers.forEach((line, index) => {
    doc.text(line, PAGE_MARGIN + 16, startY + 66 + index * 14)
  })

  const leftX = PAGE_MARGIN + 16
  const rightX = PAGE_MARGIN + 280
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(10)
  doc.text('Intestatario', leftX, startY + height - 44)
  doc.text('Broker', rightX, startY + height - 44)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
  doc.text(preview.account_extraction.ownerName ?? 'Non disponibile', leftX, startY + height - 28, { width: 210 })
  doc.text(
    `${preview.account_extraction.brokerName ?? 'Non disponibile'} (${preview.rw_summary.brokerCountryCode ?? '-'})`,
    rightX,
    startY + height - 28,
    { width: 220 }
  )

  return startY + height + 18
}

function drawWarningsSection(doc: PDFKit.PDFDocument, warnings: TaxFormWarning[], startY: number) {
  if (!warnings.length) return startY

  const boxHeight = 28 + warnings.length * 18
  const y = ensureVerticalSpace(doc, startY, boxHeight)
  drawCard(doc, y, boxHeight, FILL_WARNING)
  doc.fillColor(TEXT_WARNING).font('Helvetica-Bold').fontSize(10).text('Avvertenze da verificare', PAGE_MARGIN + 16, y + 14)
  doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8)
  warnings.forEach((warning, index) => {
    doc.text(`- ${warning.message}`, PAGE_MARGIN + 16, y + 34 + index * 15, {
      width: doc.page.width - PAGE_MARGIN * 2 - 32,
    })
  })

  return y + boxHeight + 16
}

function drawExtractionSection(doc: PDFKit.PDFDocument, preview: TaxFormPreview, startY: number) {
  const y = ensureVerticalSpace(doc, startY, 208)
  drawSectionLabel(doc, y, 'Estrazione conto')

  const rows = [
    ['Titolare', preview.account_extraction.ownerName ?? '-', sourceLabel(preview.field_sources.owner_name)],
    ['Codice fiscale', preview.account_extraction.taxCode ?? '-', sourceLabel(preview.field_sources.tax_code)],
    ['Account ID', preview.account_extraction.accountId ?? '-', sourceLabel(preview.field_sources.account_id)],
    ['Account label', preview.account_extraction.accountLabel ?? '-', 'html'],
    ['Broker', preview.account_extraction.brokerName ?? '-', sourceLabel(preview.field_sources.broker_name)],
    ['Paese broker', preview.rw_summary.brokerCountryCode ?? '-', sourceLabel(preview.field_sources.broker_country_code)],
    ['Valuta', preview.account_extraction.currency ?? '-', sourceLabel(preview.field_sources.currency)],
    ['Scala conto', preview.account_extraction.isCentAccount ? 'centesimale' : 'standard', 'derived'],
  ]

  drawKeyValueTable(doc, y + 24, rows)
  return y + 24 + 28 * (rows.length + 1) + 16
}

function drawRtSection(
  doc: PDFKit.PDFDocument,
  summary: TaxFormRtSummary,
  startY: number,
  title: string
) {
  const y = ensureVerticalSpace(doc, startY, 210)
  drawSectionLabel(doc, y, title)

  const rows = [
    ['RT23', 'Totale corrispettivi', formatEuro(summary.rt23TotalCorrispettivi)],
    ['RT24', 'Totale costi', formatEuro(summary.rt24TotalCosti)],
    ['RT25', 'Plusvalenze imponibili', formatEuro(summary.rt25Plusvalenze)],
    ['RT26', 'Minusvalenze compensate', formatEuro(summary.rt26MinusvalenzeCompensate)],
    ['RT27', 'Imponibile netto', formatEuro(summary.rt27ImponibileNetto)],
    ['Imposta 26%', 'Calcolo teorico', formatEuro(summary.rtTaxDue)],
  ]

  drawGridTable(
    doc,
    y + 24,
    [
      { title: 'Rigo', width: 74, align: 'center' },
      { title: 'Descrizione', width: 292, align: 'left' },
      { title: 'Importo', width: 146, align: 'right' },
    ],
    rows
  )

  return y + 24 + 28 * (rows.length + 1) + 18
}

function drawRwSection(
  doc: PDFKit.PDFDocument,
  summary: TaxFormRwSummary,
  startY: number,
  title: string
) {
  const y = ensureVerticalSpace(doc, startY, 238)
  drawSectionLabel(doc, y, title)

  const rows = [
    ['Codice titolare', summary.rwOwnerCode, 'Default conto singolo'],
    ['Codice attivita', summary.rwAssetCode, 'Conto trading estero'],
    ['Paese broker', summary.brokerCountryCode ?? '-', 'Da HTML/profilo/mapping'],
    ['Valore iniziale RW', formatEuro(summary.rwInitialValueEur), 'Saldo ricostruito al 1 gennaio'],
    ['Valore finale RW', formatEuro(summary.rwFinalValueEur), 'Saldo ricostruito al 31 dicembre'],
    ['Valore massimo RW', formatEuro(summary.rwMaxValueEur), 'Massimo annuo conto'],
    ['Giorni possesso', String(summary.rwPossessionDays), 'Calcolo automatico'],
    ['IVAFE stimata', formatEuro(summary.rwIvafeDueEur), 'Supporto personale'],
  ]

  drawGridTable(
    doc,
    y + 24,
    [
      { title: 'Campo', width: 196, align: 'left' },
      { title: 'Valore', width: 146, align: 'right' },
      { title: 'Nota', width: 170, align: 'left' },
    ],
    rows
  )

  return y + 24 + 28 * (rows.length + 1) + 18
}

function drawFieldSourcesSection(
  doc: PDFKit.PDFDocument,
  fieldSources: Record<string, TaxFormFieldSource>,
  startY: number
) {
  const rows = Object.entries(fieldSources).map(([field, source]) => [
    field,
    sourceLabel(source),
    source === 'mapping' ? 'Verificare l entita broker' : '',
  ])

  const y = ensureVerticalSpace(doc, startY, Math.max(120, 28 * (rows.length + 2)))
  drawSectionLabel(doc, y, 'Origine dati')
  drawGridTable(
    doc,
    y + 24,
    [
      { title: 'Campo', width: 210, align: 'left' },
      { title: 'Origine', width: 120, align: 'left' },
      { title: 'Nota', width: 182, align: 'left' },
    ],
    rows
  )
}

function drawDisclaimerCard(doc: PDFKit.PDFDocument, disclaimers: string[], startY: number) {
  const y = ensureVerticalSpace(doc, startY, 120)
  drawCard(doc, y, 94, FILL_SOFT)
  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text('Disclaimer', PAGE_MARGIN + 16, y + 14)
  doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(9)
  disclaimers.forEach((line, index) => {
    doc.text(`- ${line}`, PAGE_MARGIN + 16, y + 34 + index * 16, {
      width: doc.page.width - PAGE_MARGIN * 2 - 32,
    })
  })
}

function drawKeyValueTable(doc: PDFKit.PDFDocument, startY: number, rows: string[][]) {
  drawGridTable(
    doc,
    startY,
    [
      { title: 'Campo', width: 180, align: 'left' },
      { title: 'Valore', width: 210, align: 'left' },
      { title: 'Origine', width: 122, align: 'left' },
    ],
    rows
  )
}

function drawGridTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  columns: Array<{ title: string; width: number; align: 'left' | 'right' | 'center' }>,
  rows: string[][]
) {
  let y = startY
  drawGridRow(doc, y, columns, columns.map(column => column.title), true)
  y += 28

  rows.forEach((row, index) => {
    drawGridRow(doc, y, columns, row, false, index % 2 === 1)
    y += 28
  })
}

function drawGridRow(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: Array<{ title: string; width: number; align: 'left' | 'right' | 'center' }>,
  values: string[],
  header = false,
  alternate = false
) {
  let x = PAGE_MARGIN

  columns.forEach((column, index) => {
    doc.save()
    doc.strokeColor(BORDER_COLOR).lineWidth(0.8)
    doc.fillColor(header ? FILL_HEADER : alternate ? FILL_SOFT : '#ffffff')
    doc.rect(x, y, column.width, 28).fillAndStroke()
    doc.restore()

    doc.fillColor(TEXT_DARK)
      .font(header ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .text(values[index] ?? '', x + 8, y + 9, {
        width: column.width - 16,
        align: column.align,
        lineBreak: false,
      })

    x += column.width
  })
}

function drawCard(doc: PDFKit.PDFDocument, y: number, height: number, fillColor = '#ffffff') {
  doc.save()
  doc.lineWidth(1)
  doc.strokeColor(BORDER_COLOR)
  doc.fillColor(fillColor)
  doc.roundedRect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, height, CARD_RADIUS).fillAndStroke()
  doc.restore()
}

function drawSectionLabel(doc: PDFKit.PDFDocument, y: number, title: string) {
  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), PAGE_MARGIN, y)
}

function ensureVerticalSpace(doc: PDFKit.PDFDocument, y: number, requiredHeight: number) {
  const limit = doc.page.height - PAGE_MARGIN - 40
  if (y + requiredHeight <= limit) {
    return y
  }

  doc.addPage()
  return 110
}

function sourceLabel(source: TaxFormFieldSource | undefined) {
  switch (source) {
    case 'html':
      return 'html'
    case 'profile':
      return 'profilo'
    case 'mapping':
      return 'mapping'
    case 'manual':
      return 'manuale'
    case 'derived':
      return 'derivato'
    default:
      return 'fallback'
  }
}

function normalizeHeaderCell(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseNumber(value: string) {
  const normalized = value.replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMaybeNumber(value: string) {
  const cleaned = value.replace(/\u00a0/g, '').trim()
  if (!cleaned) return null

  const parsed = parseNumber(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hours, minutes, seconds = '00'] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)))
  return Number.isNaN(date.getTime()) ? null : date
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function roundRaw(value: number) {
  return Math.round(value * 100000) / 100000
}

function getDaysInYear(year: number) {
  return new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365
}

function formatEuro(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function truncateUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0))
}

function isSameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  )
}

function dedupeBlockingIssues(issues: TaxFormBlockingIssue[]) {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
