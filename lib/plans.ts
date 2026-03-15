import type { Plan } from '@/types'

export const PLAN_DETAILS: Record<
  Plan,
  {
    name: string
    priceLabel: string
    priceCents: number
    description: string
    maxReportsPerYear: number | null
    allowHistoricYears: boolean
    features: string[]
  }
> = {
  base: {
    name: 'Base',
    priceLabel: 'EUR 9,90',
    priceCents: 990,
    description: 'Per un singolo report annuale.',
    maxReportsPerYear: 1,
    allowHistoricYears: false,
    features: [
      'Anno corrente e precedente',
      '1 report per anno fiscale',
      'Riepilogo fiscale in PDF',
    ],
  },
  standard: {
    name: 'Standard',
    priceLabel: 'EUR 19,90',
    priceCents: 1990,
    description: 'Per chi gestisce piu conti nello stesso anno.',
    maxReportsPerYear: 3,
    allowHistoricYears: false,
    features: [
      'Anno corrente e precedente',
      'Fino a 3 report per anno fiscale',
      'Storico report e download PDF',
    ],
  },
  pro: {
    name: 'Pro',
    priceLabel: 'EUR 34,90',
    priceCents: 3490,
    description: 'Per studi e trader con storico completo.',
    maxReportsPerYear: null,
    allowHistoricYears: true,
    features: [
      'Report illimitati',
      'Accesso agli anni precedenti',
      'Storico completo e priorita operativa',
    ],
  },
}

export function getAllowedYears(plan: Plan | null, currentYear = new Date().getFullYear()) {
  const floorYear = currentYear - 8

  if (!plan) {
    return [currentYear, currentYear - 1]
  }

  if (PLAN_DETAILS[plan].allowHistoricYears) {
    return Array.from({ length: currentYear - floorYear + 1 }, (_, index) => currentYear - index)
  }

  return [currentYear, currentYear - 1]
}

export function isYearAllowedForPlan(plan: Plan, year: number, currentYear = new Date().getFullYear()) {
  return getAllowedYears(plan, currentYear).includes(year)
}
