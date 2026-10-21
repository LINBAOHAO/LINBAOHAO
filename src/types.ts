export type Role = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: Role
  content: string
  createdAt: number
}

export type Provider = 'free' | 'custom'

export type Settings = {
  displayName: string
  provider: Provider
  baseUrl: string
  apiKey: string
  model: string
}

export type Store = {
  settings: Settings
  activeBotId: string
  threads: Record<string, ChatMessage[]>
}

export type HistoryTurn = {
  role: Role
  content: string
}
