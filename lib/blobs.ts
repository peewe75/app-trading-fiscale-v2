import { getStore } from '@netlify/blobs'

// Store dedicato ai report PDF
function getReportsStore() {
  return getStore({
    name: 'reports',
    consistency: 'strong',
  })
}

// Salva un PDF su Netlify Blobs
// key formato: reports/{userId}/{reportId}.pdf
export async function saveBlob(key: string, data: Uint8Array | ArrayBuffer): Promise<void> {
  const store = getReportsStore()
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  const payload = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  await store.set(key, payload, { metadata: { contentType: 'application/pdf' } })
}

export async function saveTextBlob(
  key: string,
  content: string,
  contentType = 'text/plain; charset=utf-8'
): Promise<void> {
  const store = getReportsStore()
  const payload = new Blob([content], { type: contentType })
  await store.set(key, payload, { metadata: { contentType } })
}

// Recupera un PDF da Netlify Blobs
export async function getBlob(key: string): Promise<ArrayBuffer | null> {
  try {
    const store = getReportsStore()
    return await store.get(key, { type: 'arrayBuffer' })
  } catch {
    return null
  }
}

export async function getTextBlob(key: string): Promise<string | null> {
  try {
    const store = getReportsStore()
    return await store.get(key, { type: 'text' })
  } catch {
    return null
  }
}

// Elimina un PDF da Netlify Blobs
export async function deleteBlob(key: string): Promise<void> {
  const store = getReportsStore()
  await store.delete(key)
}

// Costruisce la chiave blob standard per un report
export function buildBlobKey(userId: string, reportId: string): string {
  return `reports/${userId}/${reportId}.pdf`
}

export function buildUploadBlobKey(userId: string, reportId: string): string {
  return `sources/${userId}/${reportId}.html`
}

export function buildTaxFormDraftKey(userId: string, reportId: string): string {
  return `tax-forms/${userId}/${reportId}.json`
}

export function buildTaxFormPdfKey(userId: string, reportId: string): string {
  return `tax-forms/${userId}/${reportId}.pdf`
}

export function buildTaxFormControlPdfKey(userId: string, reportId: string): string {
  return `tax-forms/${userId}/${reportId}.control.pdf`
}

export function buildTaxFormFacsimilePdfKey(userId: string, reportId: string): string {
  return `tax-forms/${userId}/${reportId}.facsimile.pdf`
}
