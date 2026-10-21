import { findBot } from './bots'
import type { ChatMessage, Settings, Store } from './types'

const KEY = 'yetan.chat.v1'

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  provider: 'free',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
}

function defaultStore(): Store {
  return {
    settings: DEFAULT_SETTINGS,
    activeBotId: 'wantang',
    threads: {},
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as ChatMessage
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string' &&
    typeof msg.createdAt === 'number'
  )
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultStore()
    const parsed = JSON.parse(raw) as Partial<Store>
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
    if (settings.provider !== 'free' && settings.provider !== 'custom') {
      settings.provider = 'free'
    }
    const threads: Store['threads'] = {}
    if (parsed.threads && typeof parsed.threads === 'object') {
      for (const [id, list] of Object.entries(parsed.threads)) {
        if (!Array.isArray(list)) continue
        threads[id] = list.filter(isMessage).slice(-80)
      }
    }
    return {
      settings,
      activeBotId: findBot(parsed.activeBotId ?? '').id,
      threads,
    }
  } catch {
    return defaultStore()
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}
