import { useSyncExternalStore } from 'react'

/** stage（夜のライブハウス、既定）と rehearsal（昼のスタジオ） */
export type Theme = 'stage' | 'rehearsal'

const KEY = 'riffboard-theme'
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'rehearsal' ? 'rehearsal' : 'stage'
  } catch {
    return 'stage'
  }
}

let current: Theme = read()

export function applyTheme(theme: Theme = current): void {
  current = theme
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // 保存できなくても表示は切り替える
  }
  listeners.forEach((l) => l())
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
  return [theme, applyTheme]
}
