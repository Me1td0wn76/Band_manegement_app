import { createContext, use, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../../controllers/DataController'
import { Icon } from './Icon'
import { Button, Modal } from './ui'

// ---------------- Toast ----------------

interface Toast {
  id: number
  tone: 'success' | 'error'
  message: string
}

interface ToastApi {
  success(message: string): void
  error(message: string): void
}

const ToastContext = createContext<ToastApi | null>(null)

// ---------------- Confirm ----------------

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const push = (tone: Toast['tone'], message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000)
  }

  const toastApi: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  }

  const confirm: ConfirmFn = (options) =>
    new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve }))

  const closeConfirm = (result: boolean) => {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  return (
    <ToastContext value={toastApi}>
      <ConfirmContext value={confirm}>
        {children}
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={16} />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
        {confirmState && (
          <Modal
            title={confirmState.title}
            size="sm"
            onClose={() => closeConfirm(false)}
            footer={
              <>
                <Button onClick={() => closeConfirm(false)}>キャンセル</Button>
                <Button
                  variant={confirmState.danger ? 'danger' : 'primary'}
                  onClick={() => closeConfirm(true)}
                  autoFocus
                >
                  {confirmState.confirmLabel ?? 'OK'}
                </Button>
              </>
            }
          >
            <div className="confirm-message">{confirmState.message}</div>
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
 * 非同期操作を実行し、成功・失敗をトーストで通知する。
 * 戻り値は成功したかどうか。
 */
export function useAction() {
  const toast = useToast()
  const [pending, setPending] = useState(false)

  const run = async (fn: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
    setPending(true)
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    } finally {
      setPending(false)
    }
  }

  return { run, pending }
}
