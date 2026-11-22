import { createContext, use, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../controllers/DataController'
import { Button, Modal, Toast } from './rb/core'

/**
 * トースト（右下、4〜5秒）と確認モーダル。保存・削除の結果は必ずここで知らせる。
 */

interface ToastItem {
  id: number
  tone: 'success' | 'error' | 'info'
  title: string
  message?: string
}

interface ToastApi {
  success(title: string, message?: string): void
  error(title: string, message?: string): void
  info(title: string, message?: string): void
}

interface ConfirmOptions {
  title: string
  eyebrow?: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ToastContext = createContext<ToastApi | null>(null)
const ConfirmContext = createContext<ConfirmFn | null>(null)

const DURATION = 4500

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))
  const push = (tone: ToastItem['tone'], title: string, message?: string) => {
    const id = nextId.current++
    // 同時に出すのは3件まで
    setToasts((t) => [...t.slice(-2), { id, tone, title, message }])
    setTimeout(() => dismiss(id), tone === 'error' ? DURATION + 1500 : DURATION)
  }

  const api: ToastApi = {
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    info: (t, m) => push('info', t, m),
  }

  const confirm: ConfirmFn = (options) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve }))
  const closeConfirm = (result: boolean) => {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  return (
    <ToastContext value={api}>
      <ConfirmContext value={confirm}>
        {children}
        <div className="app-toasts" aria-live="polite">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              tone={t.tone}
              title={t.title}
              message={t.message}
              duration={t.tone === 'error' ? DURATION + 1500 : DURATION}
              onClose={() => dismiss(t.id)}
            />
          ))}
        </div>
        {confirmState && (
          <Modal
            title={confirmState.title}
            eyebrow={confirmState.eyebrow ?? 'Confirm'}
            size="sm"
            onClose={() => closeConfirm(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => closeConfirm(false)}>
                  キャンセル
                </Button>
                <Button
                  variant={confirmState.danger ? 'danger' : 'primary'}
                  icon={confirmState.danger ? 'trash' : 'check'}
                  onClick={() => closeConfirm(true)}
                >
                  {confirmState.confirmLabel}
                </Button>
              </>
            }
          >
            <div className="app-confirm">{confirmState.message}</div>
          </Modal>
        )}
      </ConfirmContext>
    </ToastContext>
  )
}

export function useToast(): ToastApi {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('useToast は FeedbackProvider の内側で使ってください')
  return ctx
}

export function useConfirm(): ConfirmFn {
  const ctx = use(ConfirmContext)
  if (!ctx) throw new Error('useConfirm は FeedbackProvider の内側で使ってください')
  return ctx
}

/**
 * 非同期操作を実行し、成功・失敗をトーストで知らせる。戻り値は成功したかどうか。
 */
export function useAction() {
  const toast = useToast()
  const [pending, setPending] = useState(false)

  const run = async (
    fn: () => Promise<unknown>,
    success?: string | { title: string; message?: string },
  ): Promise<boolean> => {
    setPending(true)
    try {
      await fn()
      if (success) {
        if (typeof success === 'string') toast.success(success)
        else toast.success(success.title, success.message)
      }
      return true
    } catch (e) {
      toast.error('保存できませんでした', errorMessage(e))
      return false
    } finally {
      setPending(false)
    }
  }

  return { run, pending }
}
