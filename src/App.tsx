import { useMemo, useState } from 'react'
import { CAPITAL_PRESETS, INDUSTRIES } from './engine/industries'
import {
  advanceMonth,
  availableActions,
  createInitialState,
  quitGame,
  resolvePending,
} from './engine/simulation'
import type {
  ActionId,
  CompanySetup,
  EndingKind,
  GameState,
  IndustryId,
  Phase,
} from './engine/types'

const ENDING_LABEL: Record<EndingKind, string> = {
  bankrupt: '破产清算',
  quit: '主动止损',
  zombie: '僵尸公司',
  profitable: '接近自洽',
  acquired: '被收购',
  scale: '可扩张生意',
}

function money(n: number) {
  const sign = n < 0 ? '-' : ''
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('zh-CN')}`
}

function Skyline() {
  const buildings = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${i * 3.6 + (i % 3) * 0.4}%`,
        width: `${1.8 + ((i * 17) % 5) * 0.55}%`,
        height: `${28 + ((i * 37) % 55)}%`,
        delay: `${0.05 * i}s`,
      })),
    [],
  )
  return (
    <div className="hero-skyline" aria-hidden>
      {buildings.map((b, i) => (
        <span
          key={i}
          style={{
            left: b.left,
            width: b.width,
            height: b.height,
            animationDelay: b.delay,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  )
}

function Sparkline({
  history,
}: {
  history: GameState['history']
}) {
  if (history.length < 2) {
    return <svg className="spark" viewBox="0 0 200 64" />
  }
  const values = history.map((h) => h.cash)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 200
      const y = 56 - ((v - min) / span) * 48
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox="0 0 200 64" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="#e8a54b"
        strokeWidth="2"
        points={points}
      />
    </svg>
  )
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="landing">
      <Skyline />
      <div className="landing-inner">
        <h1 className="brand">
          超真实<em>公司</em>模拟器
        </h1>
        <p className="tagline">
          不是爽文经营游戏。用残酷但真实的获客成本、转化漏斗与跑道压力，检验一个创业想法能不能活过 24
          个月。
        </p>
        <div className="cta-row">
          <button type="button" className="btn" onClick={onStart}>
            开始压力测试
          </button>
        </div>
        <p className="meta-line">Runway · CAC · Churn · MRR</p>
      </div>
    </section>
  )
}

function Setup({
  onBack,
  onSubmit,
}: {
  onBack: () => void
  onSubmit: (setup: CompanySetup) => void
}) {
  const [name, setName] = useState('未命名公司')
  const [industryId, setIndustryId] = useState<IndustryId>('saas')
  const [idea, setIdea] = useState('')
  const [capital, setCapital] = useState(200000)
  const [founders, setFounders] = useState(2)

  return (
    <div className="panel-page">
      <header className="page-head">
        <div>
          <h1>登记你的公司</h1>
          <p>先写清楚赛道与本钱。幻想留给融资 BP，这里只认单位经济。</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          返回
        </button>
      </header>

      <div className="setup-grid">
        <div className="glass">
          <div className="field">
            <label htmlFor="name">公司名称</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
            />
          </div>
          <div className="field">
            <label htmlFor="idea">一句话想法</label>
            <textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="例如：给独立开发者做低价监控告警订阅…"
              maxLength={200}
            />
          </div>
          <div className="field">
            <label>初始资金</label>
            <div className="capital-row">
              {CAPITAL_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`chip ${capital === p.value ? 'active' : ''}`}
                  onClick={() => setCapital(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="founders">创始团队人数</label>
            <input
              id="founders"
              type="number"
              min={1}
              max={6}
              value={founders}
              onChange={(e) =>
                setFounders(clampInt(Number(e.target.value), 1, 6))
              }
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onSubmit({
                name: name.trim() || '未命名公司',
                industryId,
                idea: idea.trim() || INDUSTRIES[industryId].blurb,
                capital,
                founders,
              })
            }
          >
            进入模拟
          </button>
        </div>

        <div>
          <div className="field">
            <label>赛道</label>
            <div className="industry-grid">
              {(Object.keys(INDUSTRIES) as IndustryId[]).map((id, idx) => {
                const ind = INDUSTRIES[id]
                return (
                  <button
                    key={id}
                    type="button"
                    className={`industry-option ${industryId === id ? 'active' : ''}`}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                    onClick={() => setIndustryId(id)}
                  >
                    <strong>{ind.name}</strong>
                    <span>{ind.blurb}</span>
                    <div className="diff">难度 · {ind.difficulty}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

function Play({
  state,
  setState,
  onExit,
}: {
  state: GameState
  setState: (s: GameState) => void
  onExit: () => void
}) {
  const m = state.metrics
  const actions = availableActions(state)
  const industry = INDUSTRIES[state.setup.industryId]

  return (
    <div className="panel-page">
      <header className="page-head">
        <div>
          <h1>{state.setup.name}</h1>
          <p>
            {industry.name} · 第 {m.month} / 24 月
            {m.launched ? ' · 已上线' : ' · 尚未上线'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setState(quitGame(state))}
        >
          止损退出
        </button>
      </header>

      <div className="metrics">
        <div className={`metric ${m.cash < m.burn * 2 ? 'danger' : ''}`}>
          <div className="label">现金</div>
          <div className="value">{money(m.cash)}</div>
        </div>
        <div className={`metric ${m.runway < 3 ? 'danger' : m.runway < 6 ? 'warn' : ''}`}>
          <div className="label">跑道</div>
          <div className="value">{m.runway.toFixed(1)} 月</div>
        </div>
        <div className="metric">
          <div className="label">月烧钱</div>
          <div className="value">{money(m.burn)}</div>
        </div>
        <div className={`metric ${m.mrr > 0 ? 'good' : ''}`}>
          <div className="label">MRR</div>
          <div className="value">{money(m.mrr)}</div>
        </div>
        <div className="metric">
          <div className="label">用户 / 付费</div>
          <div className="value">
            {m.users} / {m.paidUsers}
          </div>
        </div>
        <div className="metric">
          <div className="label">CAC</div>
          <div className="value">{money(m.cac)}</div>
        </div>
        <div className="metric">
          <div className="label">月流失</div>
          <div className="value">{(m.churn * 100).toFixed(1)}%</div>
        </div>
        <div className="metric">
          <div className="label">产品 / 匹配</div>
          <div className="value">
            {m.productScore} / {m.marketFit}
          </div>
        </div>
      </div>

      <Sparkline history={state.history} />

      <div className="play-layout" style={{ marginTop: '1.25rem' }}>
        <div className="glass">
          <h2 style={{ margin: '0 0 0.85rem', fontFamily: 'var(--font-brand)', fontWeight: 400 }}>
            本月决策
          </h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
            {state.setup.idea}
          </p>
          <div className="actions">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="action"
                disabled={!!state.pendingDecision}
                onClick={() => setState(advanceMonth(state, a.id as ActionId))}
              >
                <strong>{a.label}</strong>
                <span>
                  {a.detail}
                  {a.cost ? ` · 约 ${money(a.cost)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass">
          <h2 style={{ margin: '0 0 0.85rem', fontFamily: 'var(--font-brand)', fontWeight: 400 }}>
            经营日志
          </h2>
          <div className="log-list">
            {[...state.log].reverse().map((entry, i) => (
              <article key={`${entry.month}-${entry.title}-${i}`} className={`log-item ${entry.tone}`}>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      {state.pendingDecision && (
        <div className="modal-backdrop" role="dialog" aria-modal>
          <div className="modal">
            <h2>{state.pendingDecision.title}</h2>
            <p>{state.pendingDecision.narrative}</p>
            <div className="actions">
              {state.pendingDecision.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="action"
                  onClick={() => setState(resolvePending(state, o.id))}
                >
                  <strong>{o.label}</strong>
                  <span>{o.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onExit}>
          回首页
        </button>
      </div>
    </div>
  )
}

function EndingView({
  state,
  onRestart,
}: {
  state: GameState
  onRestart: () => void
}) {
  const ending = state.ending!
  return (
    <section className="ending">
      <div className="ending-card glass">
        <div className="kind">{ENDING_LABEL[ending]}</div>
        <h1>{state.setup.name}</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{state.endingSummary}</p>
        <div className="ending-stats">
          <div className="metric">
            <div className="label">存活月数</div>
            <div className="value">{state.metrics.month}</div>
          </div>
          <div className="metric">
            <div className="label">最终现金</div>
            <div className="value">{money(state.metrics.cash)}</div>
          </div>
          <div className="metric">
            <div className="label">最终 MRR</div>
            <div className="value">{money(state.metrics.mrr)}</div>
          </div>
          <div className="metric">
            <div className="label">用户</div>
            <div className="value">{state.metrics.users}</div>
          </div>
        </div>
        <Sparkline history={state.history} />
        <div className="cta-row" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="btn" onClick={onRestart}>
            带着伤疤重来
          </button>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [state, setState] = useState<GameState | null>(null)

  return (
    <div className="app-shell">
      <div className="atmosphere" />
      <div className="content">
        {phase === 'landing' && (
          <Landing onStart={() => setPhase('setup')} />
        )}
        {phase === 'setup' && (
          <Setup
            onBack={() => setPhase('landing')}
            onSubmit={(setup) => {
              setState(createInitialState(setup))
              setPhase('play')
            }}
          />
        )}
        {phase === 'play' && state && !state.ending && (
          <Play
            state={state}
            setState={(s) => {
              setState(s)
              if (s.ending) setPhase('ended')
            }}
            onExit={() => {
              setState(null)
              setPhase('landing')
            }}
          />
        )}
        {(phase === 'ended' || (state && state.ending)) && state && (
          <EndingView
            state={state}
            onRestart={() => {
              setState(null)
              setPhase('setup')
            }}
          />
        )}
      </div>
    </div>
  )
}
