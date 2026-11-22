import type { LiveEvent } from '../models/types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function parse(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** "2026-12-05" → "12/05（土）" */
export function formatMd(iso: string, withWeekday = true): string {
  const d = parse(iso)
  if (!d) return iso
  const base = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return withWeekday ? `${base}（${WEEKDAYS[d.getDay()]}）` : base
}

/** "2026-12-05" → "2026/12/05（土）" */
export function formatYmd(iso: string): string {
  const d = parse(iso)
  if (!d) return iso
  return `${d.getFullYear()}/${formatMd(iso)}`
}

/** 開場・開演の表記 */
export function formatDoors(event: Pick<LiveEvent, 'openTime' | 'startTime'>): string {
  const parts = []
  if (event.openTime) parts.push(`開場 ${event.openTime}`)
  if (event.startTime) parts.push(`開演 ${event.startTime}`)
  return parts.join(' / ') || '時間未定'
}

export function daysUntil(iso: string): number {
  const d = parse(iso)
  if (!d) return 0
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 「3分前」「昨日」などの相対表記 */
export function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}時間前`
  const d = Math.floor(h / 24)
  if (d === 1) return '昨日'
  if (d < 30) return `${d}日前`
  const date = new Date(iso)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

/** 履歴の時刻表記（今日なら時刻のみ） */
export function formatLogTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? formatClock(iso) : `${d.getMonth() + 1}/${d.getDate()} ${formatClock(iso)}`
}


/** 初期パスワードの生成（紛らわしい文字を除く） */
export function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return `${Array.from(values, (v) => chars[v % chars.length]).join('')}!`
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n')
  // Excel で文字化けしないよう BOM を付ける
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD_LENGTH = 8

/** パスワードの条件（初期登録画面の条件リスト） */
export const PASSWORD_RULES: [label: string, test: (pw: string) => boolean][] = [
  ['8文字以上', (pw) => pw.length >= MIN_PASSWORD_LENGTH],
  ['数字を含む', (pw) => /\d/.test(pw)],
  ['大文字と小文字', (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw)],
  ['記号を含む', (pw) => /[^A-Za-z0-9]/.test(pw)],
]
