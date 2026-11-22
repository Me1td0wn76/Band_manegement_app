import type { AppRole, EventStatus } from '../models/types'
import type { Tone } from './components/ui'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** "2026-11-22" → "2026/11/22（日）" */
export function formatDate(iso: string, withWeekday = true): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  const base = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
  return withWeekday ? `${base}（${WEEKDAYS[date.getDay()]}）` : base
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return `${m}/${d}（${WEEKDAYS[date.getDay()]}）`
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  return `${start ?? ''}〜${end ?? ''}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 今日からの日数（"あと3日" 表示用） */
export function daysFromToday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function relativeDay(iso: string): string {
  const n = daysFromToday(iso)
  if (n === 0) return '今日'
  if (n === 1) return '明日'
  if (n > 0) return `あと${n}日`
  return `${-n}日前`
}

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  scheduled: { label: '予定', tone: 'info' },
  completed: { label: '終了', tone: 'neutral' },
  cancelled: { label: '中止', tone: 'danger' },
}

export const APP_ROLE: Record<AppRole, { label: string; tone: Tone }> = {
  admin: { label: '管理者', tone: 'accent' },
  member: { label: 'メンバー', tone: 'neutral' },
}

export const PART_SUGGESTIONS = ['Vo', 'Gt', 'Ba', 'Dr', 'Key', 'Cho', 'Sax', 'Tp', 'DJ', 'PA']

/** 初期パスワードの生成（紛らわしい文字を除く） */
export function generatePassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
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
