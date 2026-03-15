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

// Recupera un PDF da Netlify Blobs
export async function getBlob(key: string): Promise<ArrayBuffer | null> {
  try {
    const store = getReportsStore()
    return await store.get(key, { type: 'arrayBuffer' })
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
