import { load } from 'cheerio'
import PDFDocument from 'pdfkit'

export interface ParsedTrade {
  symbol: string
  type: 'buy' | 'sell'
  size: number
  openPrice: number
  closePrice: number
  closeDate: Date | null
  commission: number
  swap: number
  profit: number
}

export interface ParsedBalance {
  description: string
  amount: number
  date: Date | null
}

export interface TaxResults {
  year: number
  numTrades: number
  corrispettivo: number
  costo: number
  netProfit: number
  taxDue: number
  totalInterest: number
  interestTax: number
  totalSwap: number
}

interface InterestRow {
  date: Date
  description: string
  amountEur: number
  kind: 'Attivi' | 'Passivi'
}

interface PdfMeta {
  userName: string
  taxCode: string
  year: number
}

interface TableColumn {
  key: string
  title: string
  width: number
  align?: 'left' | 'right' | 'center'
}

interface TableState {
  y: number
  pageNumber: number
}

const PAGE_MARGIN = 46
const HEADER_TOP = 26
const CONTENT_TOP = 110
const FOOTER_TEXT_OFFSET = 12
const FOOTER_RESERVED_HEIGHT = 34
const TABLE_CELL_PADDING = 6
const BORDER_COLOR = '#cbd5e1'
const HEADER_BG = '#e2e8f0'
const ALT_ROW_BG = '#f8fafc'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#475569'
const NORMALIZED_REPORT_PREFIX = 'ATF_TSV_V1\n'

export function parseHtmlReport(htmlContent: string) {
  if (htmlContent.startsWith(NORMALIZED_REPORT_PREFIX)) {
    return parseNormalizedReport(htmlContent)
  }

  const sanitized = htmlContent.replace(/\0/g, '')
  const $ = load(sanitized)
  const rows: string[][] = []

  $('tr').each((_, row) => {
    const currentRow: string[] = []

    $(row)
      .find('td, th')
      .each((__, cell) => {
        const text = $(cell).text().replace(/\s+/g, ' ').trim()
        const colspan = Number($(cell).attr('colspan') ?? '1')

        currentRow.push(text)

        for (let index = 1; index < colspan; index += 1) {
          currentRow.push('')
        }
      })

    if (currentRow.length > 0) {
      rows.push(currentRow)
    }
  })

  const headerIndex = rows.findIndex(
    (row) => row.some((cell) => cell.includes('Ticket')) && row.some((cell) => cell.includes('Profit'))
  )

  if (headerIndex === -1) {
    return { trades: [] as ParsedTrade[], balances: [] as ParsedBalance[] }
  }

  const trades: ParsedTrade[] = []
  const balances: ParsedBalance[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    if (row.length < 4) continue

    const rowType = (row[2] ?? '').trim().toLowerCase()

    if (rowType === 'balance') {
      const description = row
        .slice(3, Math.min(13, row.length))
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(' ')

      balances.push({
        description,
        amount: parseNumber(row.at(-1) ?? ''),
        date: parseDate(row[1] ?? ''),
      })
      continue
    }

    if (rowType !== 'buy' && rowType !== 'sell') continue

    trades.push({
      symbol: row[4] ?? '',
      type: rowType,
      size: parseNumber(row[3] ?? ''),
      openPrice: parseNumber(row[5] ?? ''),
      closePrice: parseNumber(row[9] ?? ''),
      closeDate: parseDate(row[8] ?? ''),
      commission: parseNumber(row[10] ?? ''),
      swap: parseNumber(row[12] ?? ''),
      profit: parseNumber(row[13] ?? ''),
    })
  }

  return { trades, balances }
}

function parseNormalizedReport(content: string) {
  const rows = content
    .slice(NORMALIZED_REPORT_PREFIX.length)
    .split('\n')
    .map(line => line.split('\t').map(cell => cell.trim()))
    .filter(row => row.some(cell => cell.length > 0))

  const headerIndex = rows.findIndex(
    (row) => row.some((cell) => cell.includes('Ticket')) && row.some((cell) => cell.includes('Profit'))
  )

  if (headerIndex === -1) {
    return { trades: [] as ParsedTrade[], balances: [] as ParsedBalance[] }
  }

  const trades: ParsedTrade[] = []
  const balances: ParsedBalance[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    if (row.length < 4) continue

    const rowType = (row[2] ?? '').trim().toLowerCase()

    if (rowType === 'balance') {
      const description = row
        .slice(3, Math.min(13, row.length))
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(' ')

      balances.push({
        description,
        amount: parseNumber(row.at(-1) ?? ''),
        date: parseDate(row[1] ?? ''),
      })
      continue
    }

    if (rowType !== 'buy' && rowType !== 'sell') continue

    trades.push({
      symbol: row[4] ?? '',
      type: rowType,
      size: parseNumber(row[3] ?? ''),
      openPrice: parseNumber(row[5] ?? ''),
      closePrice: parseNumber(row[9] ?? ''),
      closeDate: parseDate(row[8] ?? ''),
      commission: parseNumber(row[10] ?? ''),
      swap: parseNumber(row[12] ?? ''),
      profit: parseNumber(row[13] ?? ''),
    })
  }

  return { trades, balances }
}

export function calculateTax(trades: ParsedTrade[], balances: ParsedBalance[], year: number): TaxResults {
  const yearTrades = trades.filter((trade) => trade.closeDate?.getFullYear() === year)
  let corrispettivo = 0
  let costo = 0

  for (const trade of yearTrades) {
    const fiscalNet = roundCurrency((trade.profit + trade.commission) / 100)

    if (fiscalNet > 0) {
      corrispettivo += fiscalNet
    } else if (fiscalNet < 0) {
      costo += Math.abs(fiscalNet)
    }
  }

  const interestKeywords = ['interest', 'cashback', 'ir']
  const yearBalances = balances.filter(
    (balance) =>
      balance.date?.getFullYear() === year &&
      interestKeywords.some((keyword) => balance.description.toLowerCase().includes(keyword))
  )

  const netProfit = roundCurrency(corrispettivo - costo)
  const totalInterest = roundCurrency(
    yearBalances.reduce((sum, balance) => sum + balance.amount, 0) / 100
  )

  return {
    year,
    numTrades: yearTrades.length,
    corrispettivo: roundCurrency(corrispettivo),
    costo: roundCurrency(costo),
    netProfit,
    taxDue: roundCurrency(Math.max(0, netProfit) * 0.26),
    totalInterest,
    interestTax: roundCurrency(Math.max(0, totalInterest) * 0.26),
    totalSwap: roundCurrency(yearTrades.reduce((sum, trade) => sum + trade.swap, 0) / 100),
  }
}

export function getReportYears(trades: ParsedTrade[], balances: ParsedBalance[]) {
  return Array.from(
    new Set(
      [
        ...trades.map(trade => trade.closeDate?.getFullYear()).filter((year): year is number => Number.isFinite(year)),
        ...balances.map(balance => balance.date?.getFullYear()).filter((year): year is number => Number.isFinite(year)),
      ]
    )
  ).sort((left, right) => right - left)
}

export async function generateReportPdf({
  results,
  trades,
  balances,
  userName,
  taxCode,
}: {
  results: TaxResults
  trades: ParsedTrade[]
  balances: ParsedBalance[]
  userName?: string | null
  taxCode?: string | null
}): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `Report fiscale ${results.year}`,
      Author: 'App Trading Fiscale',
      Subject: 'Riepilogo fiscale trading',
    },
  })

  const chunks: Buffer[] = []
  document.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))

  const meta: PdfMeta = {
    userName: userName?.trim() || 'Utente registrato',
    taxCode: taxCode?.trim() || 'Non disponibile',
    year: results.year,
  }

  const state: TableState = {
    y: CONTENT_TOP,
    pageNumber: 1,
  }

  drawPageChrome(document, meta, state.pageNumber)
  drawCover(document, state, meta)

  drawTable(document, state, meta, {
    title: 'Riepilogo fiscale',
    columns: [
      { key: 'label', title: 'Voce', width: 320 },
      { key: 'value', title: 'Importo', width: 180, align: 'right' },
    ],
    rows: [
      { label: 'Corrispettivo EUR', value: formatCurrency(results.corrispettivo) },
      { label: 'Costo EUR', value: formatCurrency(results.costo) },
      { label: 'Plus/Minus netto', value: formatCurrency(results.netProfit) },
      { label: 'Imposta dovuta 26%', value: formatCurrency(results.taxDue) },
    ],
    emphasizedRowIndexes: [3],
  })

  const interestRows = buildInterestRows(balances, results.year)
  const activeInterest = roundCurrency(
    interestRows.filter((row) => row.amountEur >= 0).reduce((sum, row) => sum + row.amountEur, 0)
  )
  const passiveInterest = roundCurrency(
    Math.abs(interestRows.filter((row) => row.amountEur < 0).reduce((sum, row) => sum + row.amountEur, 0))
  )

  drawTable(document, state, meta, {
    title: 'Interessi attivi e passivi',
    columns: [
      { key: 'label', title: 'Voce', width: 320 },
      { key: 'value', title: 'Importo', width: 180, align: 'right' },
    ],
    rows: [
      { label: 'Interessi attivi', value: formatCurrency(activeInterest) },
      { label: 'Interessi passivi', value: formatCurrency(passiveInterest) },
      { label: 'Saldo interessi', value: formatCurrency(results.totalInterest) },
      { label: 'Imposta interessi 26%', value: formatCurrency(results.interestTax) },
    ],
    emphasizedRowIndexes: [3],
  })

  drawTable(document, state, meta, {
    title: 'Dettaglio movimenti interessi',
    emptyMessage: 'Nessun movimento interessi rilevato per l anno selezionato.',
    columns: [
      { key: 'date', title: 'Data', width: 68 },
      { key: 'description', title: 'Descrizione', width: 240 },
      { key: 'kind', title: 'Tipo', width: 65, align: 'center' },
      { key: 'amount', title: 'Importo EUR', width: 130, align: 'right' },
    ],
    rows: interestRows.map((row) => ({
      date: formatShortDate(row.date),
      description: row.description,
      kind: row.kind,
      amount: formatCurrency(row.amountEur),
    })),
    fontSize: 8,
  })

  const tradeRows = trades
    .filter((trade) => trade.closeDate?.getFullYear() === results.year)
    .sort((left, right) => (left.closeDate?.getTime() ?? 0) - (right.closeDate?.getTime() ?? 0))

  drawTable(document, state, meta, {
    title: 'Dettaglio transazioni',
    emptyMessage: 'Nessuna transazione rilevata per l anno selezionato.',
    columns: [
      { key: 'date', title: 'Data', width: 52 },
      { key: 'symbol', title: 'Simbolo', width: 58 },
      { key: 'type', title: 'Tipo', width: 38, align: 'center' },
      { key: 'size', title: 'Size', width: 38, align: 'right' },
      { key: 'open', title: 'Open', width: 60, align: 'right' },
      { key: 'close', title: 'Close', width: 60, align: 'right' },
      { key: 'profit', title: 'Profitto', width: 63, align: 'right' },
      { key: 'commission', title: 'Comm.', width: 50, align: 'right' },
      { key: 'net', title: 'Netto', width: 84, align: 'right' },
    ],
    rows: tradeRows.map((trade) => ({
      date: formatShortDate(trade.closeDate),
      symbol: trade.symbol,
      type: trade.type.toUpperCase(),
      size: trade.size.toFixed(2),
      open: trade.openPrice.toFixed(5),
      close: trade.closePrice.toFixed(5),
      profit: formatCurrency(roundCurrency(trade.profit / 100)),
      commission: formatCurrency(roundCurrency(trade.commission / 100)),
      net: formatCurrency(roundCurrency((trade.profit + trade.commission) / 100)),
    })),
    fontSize: 7,
  })

  document.end()

  await new Promise<void>((resolve, reject) => {
    document.on('end', () => resolve())
    document.on('error', reject)
  })

  return Buffer.concat(chunks)
}

function drawCover(doc: PDFKit.PDFDocument, state: TableState, meta: PdfMeta) {
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(9).text('DOSSIER FISCALE', PAGE_MARGIN, state.y)
  state.y += 18

  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(24).text('App Trading Fiscale', PAGE_MARGIN, state.y)
  state.y += 32

  doc.fillColor(TEXT_MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(`Intestatario: ${meta.userName}`, PAGE_MARGIN, state.y)
    .text(`Codice fiscale: ${meta.taxCode}`, PAGE_MARGIN, state.y + 16)
    .text(`Anno fiscale: ${meta.year}`, PAGE_MARGIN, state.y + 32)

  state.y += 62
}

function drawPageChrome(doc: PDFKit.PDFDocument, meta: PdfMeta, pageNumber: number) {
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const rightX = pageWidth - PAGE_MARGIN
  const footerY = pageHeight - doc.page.margins.bottom - FOOTER_TEXT_OFFSET

  doc.save()
  doc.strokeColor(BORDER_COLOR).lineWidth(0.8)
  doc.moveTo(PAGE_MARGIN, HEADER_TOP + 22).lineTo(pageWidth - PAGE_MARGIN, HEADER_TOP + 22).stroke()
  doc.moveTo(PAGE_MARGIN, footerY - 6).lineTo(pageWidth - PAGE_MARGIN, footerY - 6).stroke()

  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(11).text('App Trading Fiscale', PAGE_MARGIN, HEADER_TOP)
  doc.fillColor(TEXT_MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`Anno ${meta.year}`, rightX - 80, HEADER_TOP, { width: 80, align: 'right' })

  doc.text(`Utente: ${meta.userName}`, PAGE_MARGIN, footerY, { width: 220, lineBreak: false })
  doc.text(`Codice fiscale: ${meta.taxCode}`, PAGE_MARGIN + 220, footerY, {
    width: 180,
    lineBreak: false,
  })
  doc.text(`Pagina ${pageNumber}`, rightX - 80, footerY, {
    width: 80,
    align: 'right',
    lineBreak: false,
  })
  doc.restore()
}

function drawTable(
  doc: PDFKit.PDFDocument,
  state: TableState,
  meta: PdfMeta,
  options: {
    title: string
    columns: TableColumn[]
    rows: Record<string, string>[]
    emptyMessage?: string
    fontSize?: number
    emphasizedRowIndexes?: number[]
  }
) {
  const fontSize = options.fontSize ?? 9
  const headerRow = options.columns.reduce<Record<string, string>>((accumulator, column) => {
    accumulator[column.key] = column.title
    return accumulator
  }, {})

  ensurePage(doc, state, meta, 24)
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(9).text(options.title, PAGE_MARGIN, state.y)
  state.y += 18

  if (options.rows.length === 0) {
    ensurePage(doc, state, meta, 28)
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9).text(options.emptyMessage ?? 'Nessun dato disponibile.', PAGE_MARGIN, state.y)
    state.y += 28
    return
  }

  drawTableRow(doc, state, options.columns, headerRow, fontSize, {
    isHeader: true,
  })

  options.rows.forEach((row, index) => {
    const highlighted = options.emphasizedRowIndexes?.includes(index) ?? false
    drawTableRow(doc, state, options.columns, row, fontSize, {
      alternate: index % 2 === 1,
      highlight: highlighted,
      meta,
    })
  })

  state.y += 16
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  state: TableState,
  columns: TableColumn[],
  row: Record<string, string>,
  fontSize: number,
  options: {
    isHeader?: boolean
    alternate?: boolean
    highlight?: boolean
    meta?: PdfMeta
  }
) {
  const height = getRowHeight(doc, columns, row, fontSize, options.isHeader)

  if (!options.isHeader && options.meta) {
    ensurePage(doc, state, options.meta, height + 1, () => {
      drawTableRow(doc, state, columns, buildHeaderRow(columns), fontSize, { isHeader: true })
    })
  }

  let x = PAGE_MARGIN
  const background = options.isHeader
    ? HEADER_BG
    : options.highlight
      ? HEADER_BG
      : options.alternate
        ? ALT_ROW_BG
        : '#ffffff'

  columns.forEach((column) => {
    doc.save()
    doc.fillColor(background).rect(x, state.y, column.width, height).fillAndStroke(background, BORDER_COLOR)
    doc.restore()

    doc.fillColor(TEXT_DARK)
      .font(options.isHeader || options.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fontSize)
      .text(row[column.key] ?? '', x + TABLE_CELL_PADDING, state.y + TABLE_CELL_PADDING, {
        width: column.width - TABLE_CELL_PADDING * 2,
        align: column.align ?? 'left',
      })

    x += column.width
  })

  state.y += height
}

function ensurePage(
  doc: PDFKit.PDFDocument,
  state: TableState,
  meta: PdfMeta,
  requiredHeight: number,
  afterPageAdd?: () => void
) {
  const limit = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVED_HEIGHT

  if (state.y + requiredHeight <= limit) {
    return
  }

  doc.addPage()
  state.pageNumber += 1
  drawPageChrome(doc, meta, state.pageNumber)
  state.y = CONTENT_TOP
  afterPageAdd?.()
}

function getRowHeight(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  row: Record<string, string>,
  fontSize: number,
  emphasized?: boolean
) {
  doc.font(emphasized ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)

  const heights = columns.map((column) =>
    doc.heightOfString(row[column.key] ?? '', {
      width: column.width - TABLE_CELL_PADDING * 2,
      align: column.align ?? 'left',
    })
  )

  return Math.max(...heights, fontSize) + TABLE_CELL_PADDING * 2
}

function buildHeaderRow(columns: TableColumn[]) {
  return columns.reduce<Record<string, string>>((accumulator, column) => {
    accumulator[column.key] = column.title
    return accumulator
  }, {})
}

function buildInterestRows(balances: ParsedBalance[], year: number): InterestRow[] {
  const interestKeywords = ['interest', 'cashback', 'ir']

  return balances
    .filter(
      (balance) =>
        balance.date?.getFullYear() === year &&
        interestKeywords.some((keyword) => balance.description.toLowerCase().includes(keyword))
    )
    .map((balance) => {
      const amountEur = roundCurrency(balance.amount / 100)

      return {
        date: balance.date as Date,
        description: balance.description || 'Movimento interessi',
        amountEur,
        kind: amountEur >= 0 ? ('Attivi' as const) : ('Passivi' as const),
      }
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

function parseNumber(value: string) {
  const normalized = value.replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hours, minutes, seconds = '00'] = match
  const date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatCurrency(value: number) {
  return `EUR ${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`
}

function formatShortDate(value: Date | null | undefined) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value)
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}
