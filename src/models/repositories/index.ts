import { LocalRepository } from './LocalRepository'
import type { Repository } from './Repository'
import { SupabaseRepository } from './SupabaseRepository'

export type { Repository, RepositoryMode } from './Repository'
export { LocalRepository } from './LocalRepository'
export { DEMO_ACCOUNTS } from './demoSeed'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Supabase の接続情報が設定されていれば Supabase、無ければデモ（ブラウザ保存）で動作する。
 */
export const repository: Repository =
  supabaseUrl && supabaseKey ? new SupabaseRepository(supabaseUrl, supabaseKey) : new LocalRepository()
