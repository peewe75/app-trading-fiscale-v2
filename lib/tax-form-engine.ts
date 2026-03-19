import PDFDocument from 'pdfkit'
import type { TaxResults } from '@/lib/report-engine'
import type { TaxFormComputedSummary, TaxFormDraftInput, TaxFormDraftRecord } from '@/types'

type TaxFormPdfMeta = {
  reportId: string
  filename: string
  userName: string
}

const PAGE_MARGIN = 48
const SECTION_GAP = 18
const ROW_HEIGHT = 24
const CARD_PADDING = 18
const BORDER_COLOR = '#cbd5e1'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#475569'
const FILL_SOFT = '#f8fafc'

export function createDefaultTaxFormInput(year: number): TaxFormDraftInput {
  return {
    taxCode: '',
    brokerName: '',
    brokerCountryCode: '',
    rwOwnerCode: '1',
    rwAssetCode: '14',
    rwPossessionDays: getDaysInYear(year),
    rwInitialValueEur: null,
    rwFinalValueEur: null,
    rwMaxValueEur: null,
    rwIvafeOverrideEur: null,
    rtPriorLossesEur: null,
    notes: '',
  }
}

export function normalizeTaxFormInput(input: Partial<TaxFormDraftInput> | null | undefined, year: number): TaxFormDraftInput {
  const fallback = createDefaultTaxFormInput(year)

  return {
    taxCode: normalizeString(input?.taxCode),
    brokerName: normalizeString(input?.brokerName),
    brokerCountryCode: normalizeString(input?.brokerCountryCode).toUpperCase(),
    rwOwnerCode: normalizeString(input?.rwOwnerCode) || fallback.rwOwnerCode,
    rwAssetCode: normalizeString(input?.rwAssetCode) || fallback.rwAssetCode,
    rwPossessionDays: normalizeInteger(input?.rwPossessionDays, fallback.rwPossessionDays),
    rwInitialValueEur: normalizeNumber(input?.rwInitialValueEur),
    rwFinalValueEur: normalizeNumber(input?.rwFinalValueEur),
    rwMaxValueEur: normalizeNumber(input?.rwMaxValueEur),
    rwIvafeOverrideEur: normalizeNumber(input?.rwIvafeOverrideEur),
    rtPriorLossesEur: normalizeNumber(input?.rtPriorLossesEur),
    notes: normalizeString(input?.notes),
  }
}

export function validateTaxFormInput(input: TaxFormDraftInput, year: number) {
  const errors: string[] = []
  const maxDays = getDaysInYear(year)

  if (!input.taxCode) errors.push('Codice fiscale obbligatorio.')
  if (!input.brokerName) errors.push('Nome broker obbligatorio.')
  if (!input.brokerCountryCode) errors.push('Paese broker obbligatorio.')
  if (input.rwPossessionDays === null || input.rwPossessionDays < 1 || input.rwPossessionDays > maxDays) {
    errors.push(`Giorni di possesso non validi. Inserire un valore tra 1 e ${maxDays}.`)
  }
  if (input.rwInitialValueEur === null || input.rwInitialValueEur < 0) {
    errors.push('Valore iniziale RW obbligatorio.')
  }
  if (input.rwFinalValueEur === null || input.rwFinalValueEur < 0) {
    errors.push('Valore finale RW obbligatorio.')
  }
  if (input.rwMaxValueEur !== null && input.rwMaxValueEur < 0) {
    errors.push('Valore massimo RW non valido.')
  }
  if (input.rwIvafeOverrideEur !== null && input.rwIvafeOverrideEur < 0) {
    errors.push('IVAFE manuale non valida.')
  }
  if (input.rtPriorLossesEur !== null && input.rtPriorLossesEur < 0) {
    errors.push('Minusvalenze pregresse non valide.')
  }

  return errors
}

export function computeTaxFormSummary(results: TaxResults, input: TaxFormDraftInput): TaxFormComputedSummary {
  const rt23TotalCorrispettivi = roundCurrency(results.corrispettivo)
  const rt24TotalCosti = roundCurrency(results.costo)
  const rt25Plusvalenze = roundCurrency(Math.max(0, rt23TotalCorrispettivi - rt24TotalCosti))
  const rt26MinusvalenzeCompensate = roundCurrency(Math.min(input.rtPriorLossesEur ?? 0, rt25Plusvalenze))
  const rt27ImponibileNetto = roundCurrency(Math.max(0, rt25Plusvalenze - rt26MinusvalenzeCompensate))
  const rwInitialValueEur = roundCurrency(input.rwInitialValueEur ?? 0)
  const rwFinalValueEur = roundCurrency(input.rwFinalValueEur ?? 0)
  const rwMaxValueEur = roundCurrency(
    input.rwMaxValueEur ?? Math.max(rwInitialValueEur, rwFinalValueEur)
  )
  const rwPossessionDays = input.rwPossessionDays ?? getDaysInYear(results.year)
  const rwIvafeDueEur = roundCurrency(
    input.rwIvafeOverrideEur ??
      (rwFinalValueEur * 0.002 * rwPossessionDays) / getDaysInYear(results.year)
  )

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
    rwInitialValueEur,
    rwFinalValueEur,
    rwMaxValueEur,
    rwPossessionDays,
    rwIvafeDueEur,
  }
}

export function createTaxFormDraftRecord(args: {
  reportId: string
  input: TaxFormDraftInput
  summary: TaxFormComputedSummary
  generatedPdfBlobKey?: string | null
}): TaxFormDraftRecord {
  return {
    reportId: args.reportId,
    input: args.input,
    summary: args.summary,
    savedAt: new Date().toISOString(),
    generatedPdfBlobKey: args.generatedPdfBlobKey ?? null,
  }
}

export function parseTaxFormDraftRecord(raw: string | null, year: number): TaxFormDraftRecord | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<TaxFormDraftRecord> & {
      input?: Partial<TaxFormDraftInput>
    }

    if (!parsed.reportId || !parsed.summary) {
      return null
    }

    return {
      reportId: parsed.reportId,
      input: normalizeTaxFormInput(parsed.input, year),
      summary: parsed.summary as TaxFormComputedSummary,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      generatedPdfBlobKey: typeof parsed.generatedPdfBlobKey === 'string' ? parsed.generatedPdfBlobKey : null,
    }
  } catch {
    return null
  }
}

export async function generateTaxFormPdf(args: {
  input: TaxFormDraftInput
  summary: TaxFormComputedSummary
  meta: TaxFormPdfMeta
}): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `Facsimile RW RT ${args.summary.year}`,
      Author: 'App Trading Fiscale',
      Subject: 'Facsimile operativo quadro RW e RT',
    },
  })

  const chunks: Buffer[] = []
  document.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))

  let pageNumber = 1
  drawPageHeader(document, args.meta, args.summary.year, pageNumber)
  let currentY = 118

  currentY = drawLeadCard(document, currentY, args)
  currentY = drawRtSection(document, currentY, args)
  currentY = drawRwSection(document, currentY, args)
  drawNotesSection(document, currentY, args.input.notes)

  const range = document.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index)
    pageNumber = index + 1
    drawPageHeader(document, args.meta, args.summary.year, pageNumber)
    drawPageFooter(document, args.meta.reportId, pageNumber)
  }

  document.end()

  await new Promise<void>((resolve, reject) => {
    document.on('end', () => resolve())
    document.on('error', reject)
  })

  return Buffer.concat(chunks)
}

function drawLeadCard(
  doc: PDFKit.PDFDocument,
  startY: number,
  { input, meta }: { input: TaxFormDraftInput; meta: TaxFormPdfMeta }
) {
  const cardHeight = 126
  drawCard(doc, startY, cardHeight)

  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text('FACSIMILE OPERATIVO', PAGE_MARGIN + CARD_PADDING, startY + 16)
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(20).text('Quadri RW e RT', PAGE_MARGIN + CARD_PADDING, startY + 34)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9).text(
    'Documento di supporto interno. Verificare sempre i dati prima della consegna al cliente o della trascrizione sul modello ministeriale ufficiale.',
    PAGE_MARGIN + CARD_PADDING,
    startY + 62,
    { width: 500, lineGap: 2 }
  )

  const leftX = PAGE_MARGIN + CARD_PADDING
  const rightX = PAGE_MARGIN + 290
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(10)
  doc.text('Intestatario', leftX, startY + 96)
  doc.text('Broker', rightX, startY + 96)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
  doc.text(`${meta.userName} - ${input.taxCode}`, leftX, startY + 112, { width: 220 })
  doc.text(`${input.brokerName || '-'} (${input.brokerCountryCode || '-'})`, rightX, startY + 112, { width: 220 })

  return startY + cardHeight + SECTION_GAP
}

function drawRtSection(
  doc: PDFKit.PDFDocument,
  startY: number,
  { summary }: { summary: TaxFormComputedSummary }
) {
  const sectionY = ensureVerticalSpace(doc, startY, 226)
  drawSectionHeading(doc, sectionY, 'Quadro RT')
  const tableY = sectionY + 30
  const rows = [
    ['RT23', 'Totale corrispettivi', formatEuro(summary.rt23TotalCorrispettivi)],
    ['RT24', 'Totale costi', formatEuro(summary.rt24TotalCosti)],
    ['RT25', 'Plusvalenze imponibili', formatEuro(summary.rt25Plusvalenze)],
    ['RT26', 'Minusvalenze compensate', formatEuro(summary.rt26MinusvalenzeCompensate)],
    ['RT27', 'Imponibile netto', formatEuro(summary.rt27ImponibileNetto)],
    ['Imposta 26%', 'Calcolo teorico', formatEuro(summary.rtTaxDue)],
  ]
  drawSimpleTable(doc, tableY, [
    { title: 'Rigo', width: 86, align: 'center' },
    { title: 'Descrizione', width: 280, align: 'left' },
    { title: 'Importo', width: 142, align: 'right' },
  ], rows, 5)

  return tableY + ROW_HEIGHT * (rows.length + 1) + SECTION_GAP
}

function drawRwSection(
  doc: PDFKit.PDFDocument,
  startY: number,
  { input, summary }: { input: TaxFormDraftInput; summary: TaxFormComputedSummary }
) {
  const sectionY = ensureVerticalSpace(doc, startY, 250)
  drawSectionHeading(doc, sectionY, 'Quadro RW')
  const tableY = sectionY + 30
  const rows = [
    ['Titolare', input.rwOwnerCode || '-', 'Codice detenzione'],
    ['Attivita', input.rwAssetCode || '-', 'Codice attivita estera'],
    ['Paese broker', input.brokerCountryCode || '-', 'Stato estero conto'],
    ['Valore iniziale', formatEuro(summary.rwInitialValueEur), 'Euro'],
    ['Valore finale', formatEuro(summary.rwFinalValueEur), 'Euro'],
    ['Valore massimo', formatEuro(summary.rwMaxValueEur), 'Euro'],
    ['Giorni possesso', String(summary.rwPossessionDays), 'Giorni'],
    ['IVAFE', formatEuro(summary.rwIvafeDueEur), 'Euro'],
  ]
  drawSimpleTable(doc, tableY, [
    { title: 'Campo', width: 190, align: 'left' },
    { title: 'Valore', width: 160, align: 'right' },
    { title: 'Note', width: 158, align: 'left' },
  ], rows, 5)

  return tableY + ROW_HEIGHT * (rows.length + 1) + SECTION_GAP
}

function drawNotesSection(doc: PDFKit.PDFDocument, startY: number, notes: string) {
  const sectionY = ensureVerticalSpace(doc, startY, 144)
  drawSectionHeading(doc, sectionY, 'Note operative')
  const boxY = sectionY + 30
  const height = 92
  drawCard(doc, boxY, height)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9).text(
    notes || 'Nessuna annotazione aggiuntiva.',
    PAGE_MARGIN + CARD_PADDING,
    boxY + 16,
    {
      width: 500,
      height: height - 32,
      lineGap: 2,
    }
  )

  return boxY + height + SECTION_GAP
}

function drawSectionHeading(doc: PDFKit.PDFDocument, y: number, title: string) {
  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), PAGE_MARGIN, y)
}

function drawSimpleTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  columns: Array<{ title: string; width: number; align: 'left' | 'right' | 'center' }>,
  rows: string[][],
  fontSize: number
) {
  let currentY = startY
  drawTableLine(doc, currentY, columns, columns.map(column => column.title), fontSize, true)
  currentY += ROW_HEIGHT

  rows.forEach((row, index) => {
    drawTableLine(doc, currentY, columns, row, fontSize, false, index % 2 === 1)
    currentY += ROW_HEIGHT
  })
}

function drawTableLine(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: Array<{ title: string; width: number; align: 'left' | 'right' | 'center' }>,
  values: string[],
  fontSize: number,
  header = false,
  alternate = false
) {
  let x = PAGE_MARGIN

  columns.forEach((column, index) => {
    doc.save()
    doc.lineWidth(0.8).strokeColor(BORDER_COLOR).fillColor(header ? '#e2e8f0' : alternate ? FILL_SOFT : '#ffffff')
    doc.rect(x, y, column.width, ROW_HEIGHT).fillAndStroke()
    doc.restore()

    doc.fillColor(TEXT_DARK)
      .font(header ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fontSize)
      .text(values[index] ?? '', x + 8, y + 7, {
        width: column.width - 16,
        align: column.align,
        lineBreak: false,
      })

    x += column.width
  })
}

function drawCard(doc: PDFKit.PDFDocument, y: number, height: number) {
  doc.save()
  doc.lineWidth(1)
  doc.strokeColor(BORDER_COLOR)
  doc.fillColor('#ffffff')
  doc.roundedRect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, height, 16).fillAndStroke()
  doc.restore()
}

function ensureVerticalSpace(doc: PDFKit.PDFDocument, y: number, requiredHeight: number) {
  const limit = doc.page.height - PAGE_MARGIN - 42
  if (y + requiredHeight <= limit) {
    return y
  }

  doc.addPage()
  return 118
}

function drawPageHeader(doc: PDFKit.PDFDocument, meta: TaxFormPdfMeta, year: number, pageNumber: number) {
  doc.save()
  doc.strokeColor(BORDER_COLOR).lineWidth(0.8)
  doc.moveTo(PAGE_MARGIN, 82).lineTo(doc.page.width - PAGE_MARGIN, 82).stroke()
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(14).text('App Trading Fiscale', PAGE_MARGIN, 42)
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
  doc.text(`Facsimile RW/RT ${year}`, PAGE_MARGIN, 60)
  doc.text(`Report ${meta.filename}`, doc.page.width - PAGE_MARGIN - 220, 48, { width: 220, align: 'right' })
  doc.text(`Pagina ${pageNumber}`, doc.page.width - PAGE_MARGIN - 220, 62, { width: 220, align: 'right' })
  doc.restore()
}

function drawPageFooter(doc: PDFKit.PDFDocument, reportId: string, pageNumber: number) {
  const footerY = doc.page.height - PAGE_MARGIN - 14
  doc.save()
  doc.strokeColor(BORDER_COLOR).lineWidth(0.8)
  doc.moveTo(PAGE_MARGIN, footerY - 12).lineTo(doc.page.width - PAGE_MARGIN, footerY - 12).stroke()
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
  doc.text(`Report ID ${reportId}`, PAGE_MARGIN, footerY, { lineBreak: false })
  doc.text(`Pag. ${pageNumber}`, doc.page.width - PAGE_MARGIN - 60, footerY, {
    width: 60,
    align: 'right',
    lineBreak: false,
  })
  doc.restore()
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeInteger(value: unknown, fallback: number | null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? roundCurrency(parsed) : null
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
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
