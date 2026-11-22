import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

/**
 * GitHub Pages ではサーバー側のリライトが使えないため、ハッシュ（#/path）でルーティングする。
 */

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

const getHash = () => window.location.hash

export interface Location {
  path: string
  query: URLSearchParams
}

function parse(hash: string): Location {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, search = ''] = raw.split('?')
  return { path: path || '/', query: new URLSearchParams(search) }
}

export function useLocation(): Location {
  const hash = useSyncExternalStore(subscribe, getHash)
  return parse(hash)
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}#${to}`
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = to
  }
  window.scrollTo({ top: 0 })
}

/** "/events/:id" のようなパターンにマッチすればパラメータを返す */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
}

export function Link({ to, onClick, ...props }: LinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      window.scrollTo({ top: 0 })
    }
  }
  return <a href={`#${to}`} onClick={handleClick} {...props} />
}
