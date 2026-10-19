import { supabase } from '../backend/client'

// Shared by the admin views (AdminView, AdminInsights).

export const PAGE_SIZE = 1000

export async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  if (!supabase) return []
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '-'
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // The BOM makes Excel open UTF-8 (Turkish characters) correctly.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
