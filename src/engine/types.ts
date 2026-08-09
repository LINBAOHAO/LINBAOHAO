export type IndustryId =
  | 'saas'
  | 'consumer'
  | 'content'
  | 'hardware'
  | 'local'
  | 'ai_tool'

export type Phase = 'landing' | 'setup' | 'play' | 'ended'

export type EndingKind =
  | 'bankrupt'
  | 'quit'
  | 'zombie'
  | 'profitable'
  | 'acquired'
  | 'scale'

export interface Industry {
  id: IndustryId
  name: string
  blurb: string
  baseCac: number
  visitToSignup: number
  signupToPaid: number
  monthlyChurn: number
  avgPrice: number
  buildMonths: number
  salaryPerHead: number
  difficulty: string
}

export interface CompanySetup {
  name: string
  industryId: IndustryId
  idea: string
  capital: number
  founders: number
}

export interface Metrics {
  month: number
  cash: number
  burn: number
  runway: number
  users: number
  paidUsers: number
  mrr: number
  churn: number
  cac: number
  productScore: number
  marketFit: number
  reputation: number
  morale: number
  teamSize: number
  marketingSpend: number
  price: number
  launched: boolean
  competitors: number
}

export interface DecisionOption {
  id: string
  label: string
  detail: string
  cost?: number
}

export interface DecisionPoint {
  id: string
  title: string
  narrative: string
  options: DecisionOption[]
}

export interface LogEntry {
  month: number
  title: string
  body: string
  tone: 'neutral' | 'good' | 'bad' | 'warn'
}

export interface GameState {
  setup: CompanySetup
  metrics: Metrics
  log: LogEntry[]
  pendingDecision: DecisionPoint | null
  history: { month: number; cash: number; mrr: number; users: number }[]
  ending: EndingKind | null
  endingSummary: string
}

export type ActionId =
  | 'ship_mvp'
  | 'hire'
  | 'fire'
  | 'ads'
  | 'organic'
  | 'polish'
  | 'pivot'
  | 'raise_price'
  | 'cut_price'
  | 'cut_burn'
  | 'fundraise'
  | 'wait'
