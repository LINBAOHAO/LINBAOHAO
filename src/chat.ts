import type { HistoryTurn, Settings } from './types'

const FREE_URL = 'https://text.pollinations.ai/openai'
const FREE_MODEL = 'openai'

export class ChatError extends Error {
  retryAfterMs?: number
  partial?: string

  constructor(message: string, extra?: { retryAfterMs?: number; partial?: string }) {
    super(message)
    this.name = 'ChatError'
    this.retryAfterMs = extra?.retryAfterMs
    this.partial = extra?.partial
  }
}

export function visibleText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
}

function endpoint(settings: Settings): { url: string; model: string; apiKey: string } {
  if (settings.provider === 'free') {
    return { url: FREE_URL, model: FREE_MODEL, apiKey: '' }
  }
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new ChatError('先在设置里填接口地址。')
  if (!settings.apiKey.trim()) throw new ChatError('这个接口需要密钥。密钥只保存在这台浏览器里。')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const model = settings.model.trim() || 'gpt-4o-mini'
  return { url, model, apiKey: settings.apiKey.trim() }
}

function retryAfterMs(header: string | null): number {
  if (!header) return 30_000
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(1, seconds) * 1000
  const when = Date.parse(header)
  if (Number.isFinite(when)) return Math.max(1000, when - Date.now())
  return 30_000
}

function messageContent(json: {
  choices?: Array<{ message?: { content?: string }; text?: string }>
}): string {
  const choice = json.choices?.[0]
  return choice?.message?.content ?? choice?.text ?? ''
}

function deltaFromLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return ''
  const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
  if (!payload || payload === '[DONE]' || !payload.startsWith('{')) return ''
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>
    }
    return json.choices?.[0]?.delta?.content ?? ''
  } catch {
    return ''
  }
}

async function readBody(res: Response, onDelta?: (text: string) => void): Promise<string> {
  if (!res.body) {
    const json = (await res.json()) as Parameters<typeof messageContent>[0]
    const text = visibleText(messageContent(json)).trim()
    onDelta?.(text)
    return text
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  let full = ''
  let raw = ''

  const push = (piece: string) => {
    if (!piece) return
    full += piece
    onDelta?.(visibleText(full))
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    raw += chunk
    carry += chunk
    const lines = carry.split(/\r?\n/)
    carry = lines.pop() ?? ''
    for (const line of lines) push(deltaFromLine(line))
  }
  carry += decoder.decode()
  if (carry.trim()) push(deltaFromLine(carry))

  if (!full.trim()) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const text = visibleText(
          messageContent(JSON.parse(trimmed) as Parameters<typeof messageContent>[0]),
        ).trim()
        onDelta?.(text)
        return text
      } catch {
        return ''
      }
    }
  }
  return visibleText(full).trim()
}

async function failFrom(res: Response): Promise<ChatError> {
  const wait = retryAfterMs(res.headers.get('Retry-After'))
  let detail = ''
  try {
    const text = await res.text()
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
        if (typeof json.error === 'string') detail = json.error
        else detail = json.error?.message || json.message || text.slice(0, 180)
      } catch {
        detail = text.slice(0, 180)
      }
    }
  } catch {
    detail = ''
  }

  if (res.status === 402 || res.status === 429) {
    const seconds = Math.ceil(wait / 1000)
    return new ChatError(
      detail && !/payment|pollen|retry/i.test(detail)
        ? detail
        : `免费线路要歇一会儿，大约 ${seconds} 秒后再说。`,
      { retryAfterMs: wait },
    )
  }
  if (res.status === 401 || res.status === 403) {
    return new ChatError(detail || '接口拒绝了这次请求。检查密钥，或换一条允许浏览器访问的地址。')
  }
  return new ChatError(detail || `模型没有接上（${res.status}）。再试一次，或到设置里换接口。`)
}

export async function completeChat(options: {
  settings: Settings
  system: string
  history: HistoryTurn[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
}): Promise<string> {
  const { url, model, apiKey } = endpoint(options.settings)
  const recent = options.history.slice(-16)
  const timeout = AbortSignal.timeout(70_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        stream: true,
        messages: [{ role: 'system', content: options.system }, ...recent],
      }),
      signal,
    })
  } catch (err) {
    if (options.signal?.aborted) throw err
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ChatError('模型太久没有回应，再试一次。')
    }
    throw new ChatError('连不上模型。检查网络，或在设置里换一条接口。')
  }

  if (!res.ok) throw await failFrom(res)

  try {
    const text = await readBody(res, options.onDelta)
    if (!text) throw new ChatError('模型这次没把话说出来。')
    return text
  } catch (err) {
    if (err instanceof ChatError) throw err
    if (options.signal?.aborted) throw err
    throw new ChatError('话说到一半断了。')
  }
}
