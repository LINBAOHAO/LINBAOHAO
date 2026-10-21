import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BOTS, findBot, systemPrompt } from './bots'
import { ChatError, completeChat } from './chat'
import { Portrait } from './Portrait'
import { loadStore, saveStore } from './storage'
import type { ChatMessage, HistoryTurn, Settings } from './types'

function uid() {
  return crypto.randomUUID()
}

function formatTime(ts: number) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)
}

function dayLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return '今天'
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(d)
}

export default function App() {
  const [store, setStore] = useState(loadStore)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [live, setLive] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [armClear, setArmClear] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const seq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const bot = findBot(store.activeBotId)
  const stored = store.threads[bot.id]
  const shown = useMemo<ChatMessage[]>(
    () => [
      { id: `open-${bot.id}`, role: 'assistant', content: bot.opening, createdAt: 0 },
      ...(stored ?? []),
    ],
    [bot.id, bot.opening, stored],
  )

  useEffect(() => {
    saveStore(store)
  }, [store])

  useEffect(() => {
    document.title = `${bot.name} · 夜谈`
  }, [bot.name])

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    const el = threadRef.current
    if (!el || !stickRef.current) return
    el.scrollTop = el.scrollHeight
  }, [shown, live, pending, error, bot.id])

  useEffect(() => {
    setArmClear(false)
  }, [bot.id])

  const cooldown = Math.max(0, cooldownUntil - now)
  const canSend = draft.trim().length > 0 && !pending && cooldown === 0

  function fitBox(el: HTMLTextAreaElement) {
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`
  }

  function selectBot(id: string) {
    if (id === bot.id) return
    seq.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPending(false)
    setLive('')
    setError(null)
    setDraft('')
    stickRef.current = true
    setStore((prev) => ({ ...prev, activeBotId: id }))
  }

  function append(botId: string, message: ChatMessage) {
    setStore((prev) => ({
      ...prev,
      threads: {
        ...prev.threads,
        [botId]: [...(prev.threads[botId] ?? []), message],
      },
    }))
  }

  async function run(botId: string, history: HistoryTurn[], settings: Settings) {
    const runId = ++seq.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPending(true)
    setLive('')
    setError(null)
    const persona = findBot(botId)
    let streamed = ''
    try {
      const text = await completeChat({
        settings,
        system: systemPrompt(persona, settings.displayName),
        history,
        signal: ctrl.signal,
        onDelta: (next) => {
          streamed = next
          if (seq.current === runId) setLive(next)
        },
      })
      if (seq.current !== runId) return
      append(botId, {
        id: uid(),
        role: 'assistant',
        content: text,
        createdAt: Date.now(),
      })
      setLive('')
    } catch (err) {
      if (seq.current !== runId) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof ChatError ? err.message : '这句话没送出去。'
      const partial = (err instanceof ChatError && err.partial) || streamed
      if (partial.trim()) {
        append(botId, {
          id: uid(),
          role: 'assistant',
          content: partial.trim(),
          createdAt: Date.now(),
        })
      }
      if (err instanceof ChatError && err.retryAfterMs) {
        setCooldownUntil(Date.now() + err.retryAfterMs)
      }
      setLive('')
      setError(message)
    } finally {
      if (seq.current === runId) setPending(false)
    }
  }

  function send(text: string) {
    const content = text.trim()
    if (!content || pending || cooldown > 0) return
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content,
      createdAt: Date.now(),
    }
    stickRef.current = true
    append(bot.id, userMessage)
    setDraft('')
    if (boxRef.current) {
      boxRef.current.style.height = '0px'
    }
    const history: HistoryTurn[] = [...shown, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    }))
    void run(bot.id, history, store.settings)
  }

  function retry() {
    if (pending) return
    const history = shown
      .filter((item) => item.content.trim())
      .map((item) => ({ role: item.role, content: item.content }))
    stickRef.current = true
    void run(bot.id, history, store.settings)
  }

  function stop() {
    const partial = live.trim()
    seq.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPending(false)
    setLive('')
    if (partial) {
      append(bot.id, {
        id: uid(),
        role: 'assistant',
        content: partial,
        createdAt: Date.now(),
      })
    }
  }

  function clearThread() {
    if (!armClear) {
      setArmClear(true)
      window.setTimeout(() => setArmClear(false), 2800)
      return
    }
    seq.current += 1
    abortRef.current?.abort()
    setPending(false)
    setLive('')
    setError(null)
    setArmClear(false)
    setStore((prev) => ({
      ...prev,
      threads: { ...prev.threads, [bot.id]: [] },
    }))
  }

  const onlyOpening = (stored?.length ?? 0) === 0 && !pending

  return (
    <div className="app">
      <div className="lamp" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">夜</span>
          <div>
            <strong>夜谈</strong>
            <small>有人值夜</small>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="text-btn" onClick={clearThread}>
            {armClear ? '再点一次清空' : '重新开始'}
          </button>
          <button type="button" className="text-btn" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        </div>
      </header>

      <div className="stage">
        <aside className="roster" aria-label="值夜的人">
          {BOTS.map((item) => {
            const active = item.id === bot.id
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'bot-card active' : 'bot-card'}
                aria-current={active ? 'true' : undefined}
                style={{ '--accent': item.accent } as CSSProperties}
                onClick={() => selectBot(item.id)}
              >
                <Portrait id={item.id} accent={item.accent} />
                <span className="bot-copy">
                  <span className="bot-name">{item.name}</span>
                  <span className="bot-place">{item.place}</span>
                  <span className="bot-presence">{item.presence}</span>
                </span>
              </button>
            )
          })}
        </aside>

        <main className="chat" style={{ '--accent': bot.accent } as CSSProperties}>
          <div className="chat-head">
            <Portrait id={bot.id} accent={bot.accent} />
            <div>
              <h1>{bot.name}</h1>
              <p>
                {bot.place}
                <span className="dot">·</span>
                {bot.presence}
              </p>
            </div>
            <span className="live-pill">
              {store.settings.provider === 'free' ? '实时模型' : store.settings.model}
            </span>
          </div>

          <div
            className="thread"
            ref={threadRef}
            onScroll={() => {
              const el = threadRef.current
              if (!el) return
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
            }}
          >
            {shown.map((item, index) => {
              const prev = shown[index - 1]
              const showDay =
                item.createdAt > 0 &&
                (!prev || !prev.createdAt || dayLabel(prev.createdAt) !== dayLabel(item.createdAt))
              return (
                <div key={item.id}>
                  {showDay ? <div className="day">{dayLabel(item.createdAt)}</div> : null}
                  <article className={item.role === 'user' ? 'row user' : 'row bot'}>
                    <div className="bubble">
                      {item.role === 'assistant' ? <span className="who">{bot.name}</span> : null}
                      <p>{item.content}</p>
                      {item.createdAt ? <time>{formatTime(item.createdAt)}</time> : null}
                    </div>
                  </article>
                </div>
              )
            })}

            {pending ? (
              <article className="row bot">
                <div className="bubble">
                  <span className="who">{bot.name}</span>
                  {live ? (
                    <p>
                      {live}
                      <span className="caret" />
                    </p>
                  ) : (
                    <p className="dots" aria-label={`${bot.name}正在想`}>
                      <i />
                      <i />
                      <i />
                    </p>
                  )}
                </div>
              </article>
            ) : null}

            {onlyOpening ? (
              <div className="starters">
                {bot.starters.map((line) => (
                  <button key={line} type="button" onClick={() => send(line)}>
                    {line}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              send(draft)
            }}
          >
            {error ? (
              <div className="alert" role="alert">
                <span>{error}</span>
                <button type="button" onClick={retry}>
                  再试一次
                </button>
              </div>
            ) : null}
            <div className="composer-box">
              <label className="sr" htmlFor="draft">
                给{bot.name}的消息
              </label>
              <textarea
                id="draft"
                ref={boxRef}
                rows={1}
                value={draft}
                maxLength={2000}
                placeholder={
                  cooldown > 0
                    ? `免费线路歇一会儿，${Math.ceil(cooldown / 1000)} 秒后再说`
                    : `跟${bot.name}说点什么`
                }
                disabled={pending}
                onChange={(event) => {
                  setDraft(event.target.value)
                  fitBox(event.target)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send(draft)
                  }
                }}
              />
              {pending ? (
                <button type="button" className="send stop" onClick={stop}>
                  停一下
                </button>
              ) : (
                <button type="submit" className="send" disabled={!canSend}>
                  {cooldown > 0 ? `${Math.ceil(cooldown / 1000)}s` : '发送'}
                </button>
              )}
            </div>
            <p className="hint">
              {store.settings.provider === 'free'
                ? '回复由公开模型实时生成，不是写好的台词。免费线路人多时会请你稍等。'
                : '这条线用的是你自己的接口。Enter 发送，Shift+Enter 换行。'}
              <span className="hint-keys">Enter 发送 · Shift+Enter 换行</span>
            </p>
          </form>
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={store.settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(settings) => {
          setStore((prev) => ({ ...prev, settings }))
          setSettingsOpen(false)
        }}
      />
    </div>
  )
}

function SettingsDialog({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean
  settings: Settings
  onClose: () => void
  onSave: (settings: Settings) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState(settings)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      setForm(settings)
      el.showModal()
    }
    if (!open && el.open) el.close()
  }, [open, settings])

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave(form)
        }}
      >
        <header>
          <h2>设置</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <label>
          你的称呼
          <input
            value={form.displayName}
            maxLength={24}
            placeholder="可以不填"
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </label>
        <fieldset>
          <legend>模型线路</legend>
          <label className="choice">
            <input
              type="radio"
              name="provider"
              checked={form.provider === 'free'}
              onChange={() => setForm({ ...form, provider: 'free' })}
            />
            <span>
              <strong>免费实时模型</strong>
              <small>不用密钥，打开就能聊。忙碌时大约要等半分钟。</small>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="provider"
              checked={form.provider === 'custom'}
              onChange={() => setForm({ ...form, provider: 'custom' })}
            />
            <span>
              <strong>自己的接口</strong>
              <small>任何 OpenAI 兼容的地址。密钥只留在这台浏览器。</small>
            </span>
          </label>
        </fieldset>
        {form.provider === 'custom' ? (
          <div className="custom-fields">
            <label>
              接口地址
              <input
                value={form.baseUrl}
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
              />
            </label>
            <label>
              密钥
              <input
                type="password"
                value={form.apiKey}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
              />
            </label>
            <label>
              模型名
              <input
                value={form.model}
                spellCheck={false}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        <div className="sheet-actions">
          <button type="submit" className="send">
            保存
          </button>
        </div>
      </form>
    </dialog>
  )
}
