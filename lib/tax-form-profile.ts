type ClerkLikeUser = {
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
  publicMetadata?: unknown
  unsafeMetadata?: unknown
} | null | undefined

export function extractTaxProfileFromClerkUser(user: ClerkLikeUser) {
  return {
    displayName:
      user?.fullName?.trim() ||
      [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ').trim() ||
      user?.primaryEmailAddress?.emailAddress?.trim() ||
      null,
    taxCode:
      readMetadataString(user?.publicMetadata, ['taxCode', 'tax_code', 'codiceFiscale', 'codice_fiscale']) ||
      readMetadataString(user?.unsafeMetadata, ['taxCode', 'tax_code', 'codiceFiscale', 'codice_fiscale']) ||
      null,
  }
}

function readMetadataString(input: unknown, keys: string[]) {
  if (!input || typeof input !== 'object') {
    return null
  }

  const metadata = input as Record<string, unknown>
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}
