import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { bandsOfEvent, slotsForEvent } from '../../controllers/selectors'
import type { BandEvent, EventInput, EventStatus } from '../../models/types'
import { useAction } from '../components/Feedback'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { EVENT_STATUS } from '../format'

interface Props {
  event?: BandEvent
  onClose: () => void
  onSaved?: (id: string) => void
}

type Errors = Partial<Record<'title' | 'date' | 'time', string>>

export function EventFormModal({ event, onClose, onSaved }: Props) {
  const { snapshot, actions } = useData()
  const { run, pending } = useAction()

  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? '')
  const [startTime, setStartTime] = useState(event?.startTime ?? '')
  const [endTime, setEndTime] = useState(event?.endTime ?? '')
  const [venue, setVenue] = useState(event?.venue ?? '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'scheduled')
  const [description, setDescription] = useState(event?.description ?? '')
  const [bandIds, setBandIds] = useState<string[]>(event ? bandsOfEvent(snapshot, event.id).map((b) => b.id) : [])
  const [slots, setSlots] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      event
        ? slotsForEvent(snapshot, event.id).map((s) => [s.role.id, s.slots])
        : snapshot.roles.map((r) => [r.id, r.defaultSlots]),
    ),
  )
  const [errors, setErrors] = useState<Errors>({})

  const toggleBand = (id: string, checked: boolean) =>
    setBandIds((prev) => (checked ? [...prev, id] : prev.filter((b) => b !== id)))

  const moveBand = (id: string, dir: -1 | 1) =>
    setBandIds((prev) => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const submit = async () => {
    const errs: Errors = {}
    if (!title.trim()) errs.title = 'イベント名を入力してください'
    if (!date) errs.date = '日付を入力してください'
    if (startTime && endTime && endTime < startTime) errs.time = '終了時刻は開始時刻より後にしてください'
    setErrors(errs)
    if (Object.keys(errs).length) return

    const input: EventInput = {
      title: title.trim(),
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      venue: venue.trim() || null,
      description: description.trim() || null,
      status,
      bandIds,
      roleSlots: snapshot.roles.map((r) => ({ roleId: r.id, slots: Math.max(0, slots[r.id] ?? 0) })),
    }

    let savedId = event?.id ?? ''
    const ok = await run(
      async () => {
        if (event) await actions.updateEvent(event.id, input)
        else savedId = await actions.createEvent(input)
      },
      event ? 'イベントを更新しました' : 'イベントを登録しました',
    )
    if (ok) {
      onClose()
      onSaved?.(savedId)
    }
  }

  const selectedBands = bandIds
    .map((id) => snapshot.bands.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))

  return (
    <Modal
      title={event ? 'イベントを編集' : 'イベントを登録'}
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            {event ? '保存' : '登録'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="イベント名" error={errors.title} required className="span-2">
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="定期ライブ vol.13" autoFocus />}
        </Field>
        <Field label="日付" error={errors.date} required>
          {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="ステータス">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              {(Object.keys(EVENT_STATUS) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EVENT_STATUS[s].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="開始時刻">
          {(id) => <Input id={id} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
        </Field>
        <Field label="終了時刻" error={errors.time}>
          {(id) => <Input id={id} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
        </Field>
        <Field label="会場" className="span-2">
          {(id) => <Input id={id} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="ライブハウス名など" />}
        </Field>
        <Field label="メモ" className="span-2">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>

      <fieldset className="fieldset">
        <legend>出演バンド</legend>
        {snapshot.bands.length === 0 ? (
          <p className="muted small">バンドが登録されていません。</p>
        ) : (
          <div className="check-grid">
            {snapshot.bands.map((b) => (
              <Checkbox key={b.id} checked={bandIds.includes(b.id)} onChange={(c) => toggleBand(b.id, c)}>
                {b.name}
              </Checkbox>
            ))}
          </div>
        )}
        {selectedBands.length > 1 && (
          <ol className="order-list" aria-label="出演順">
            {selectedBands.map((b, i) => (
              <li key={b.id}>
                <span className="order-num">{i + 1}</span>
                <span className="order-name">{b.name}</span>
                <button type="button" className="icon-btn" aria-label={`${b.name}を前へ`} disabled={i === 0} onClick={() => moveBand(b.id, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${b.name}を後ろへ`}
                  disabled={i === selectedBands.length - 1}
                  onClick={() => moveBand(b.id, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend>必要な役割と人数</legend>
        {snapshot.roles.length === 0 ? (
          <p className="muted small">役割が登録されていません。「役割の割り振り」の役割マスタから追加できます。</p>
        ) : (
          <div className="slot-grid">
            {snapshot.roles.map((r) => (
              <label key={r.id} className="slot-input">
                <span>{r.name}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="input input-number"
                  value={slots[r.id] ?? 0}
                  onChange={(e) => setSlots((s) => ({ ...s, [r.id]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }))}
                />
                <span className="muted small">人</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </Modal>
  )
}
