import { INDUSTRIES } from './industries'
import type {
  ActionId,
  CompanySetup,
  DecisionOption,
  DecisionPoint,
  EndingKind,
  GameState,
  LogEntry,
  Metrics,
} from './types'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function round(n: number) {
  return Math.round(n)
}

function rng(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function createInitialState(setup: CompanySetup): GameState {
  const industry = INDUSTRIES[setup.industryId]
  const teamSize = setup.founders
  const salaryBurn = teamSize * industry.salaryPerHead
  const fixedBurn = Math.max(3000, round(setup.capital * 0.01))
  const burn = salaryBurn + fixedBurn
  const metrics: Metrics = {
    month: 0,
    cash: setup.capital,
    burn,
    runway: burn > 0 ? setup.capital / burn : 99,
    users: 0,
    paidUsers: 0,
    mrr: 0,
    churn: industry.monthlyChurn,
    cac: industry.baseCac,
    productScore: 35,
    marketFit: 20,
    reputation: 40,
    morale: 70,
    teamSize,
    marketingSpend: 0,
    price: industry.avgPrice,
    launched: false,
    competitors: 3 + Math.floor(rng(setup.capital) * 8),
  }

  return {
    setup,
    metrics,
    log: [
      {
        month: 0,
        title: '压力测试启动',
        body: `「${setup.name}」登记成立。赛道：${industry.name}。初始现金 ¥${setup.capital.toLocaleString('zh-CN')}，团队 ${teamSize} 人。忘掉一夜暴富——现金流才是生命线。`,
        tone: 'neutral',
      },
    ],
    pendingDecision: null,
    history: [{ month: 0, cash: setup.capital, mrr: 0, users: 0 }],
    ending: null,
    endingSummary: '',
  }
}

function recomputeBurn(m: Metrics, setup: CompanySetup): number {
  const industry = INDUSTRIES[setup.industryId]
  const salary = m.teamSize * industry.salaryPerHead
  const office = Math.max(2000, round(setup.capital * 0.008))
  const modelCost =
    setup.industryId === 'ai_tool' ? Math.max(2000, round(m.users * 1.2)) : 0
  const inventory =
    setup.industryId === 'hardware' && m.launched
      ? Math.max(8000, round(m.paidUsers * 40))
      : 0
  return salary + office + m.marketingSpend + modelCost + inventory
}

function refreshDerived(m: Metrics, setup: CompanySetup): Metrics {
  const burn = recomputeBurn(m, setup)
  const runway = burn > 0 ? m.cash / burn : 99
  return { ...m, burn, runway }
}

export function availableActions(state: GameState): DecisionOption[] {
  const { metrics: m, setup } = state
  const industry = INDUSTRIES[setup.industryId]
  const actions: DecisionOption[] = []

  if (!m.launched) {
    if (m.month + 1 >= industry.buildMonths || m.productScore >= 55) {
      actions.push({
        id: 'ship_mvp',
        label: '上线 MVP',
        detail: '把半成品扔进市场。准备好迎接冷漠。',
      })
    }
    actions.push({
      id: 'polish',
      label: '继续打磨产品',
      detail: `产品完成度 → 约 ${clamp(m.productScore + 8, 0, 100)}`,
      cost: round(m.burn * 0.15),
    })
  } else {
    actions.push({
      id: 'ads',
      label: '烧钱获客',
      detail: `投入约 ¥${Math.max(10000, round(m.cash * 0.12)).toLocaleString('zh-CN')} 买流量`,
      cost: Math.max(10000, round(m.cash * 0.12)),
    })
    actions.push({
      id: 'organic',
      label: '社区冷启动',
      detail: '低成本曝光，转化率惨淡但真实',
    })
    actions.push({
      id: 'polish',
      label: '根据反馈改产品',
      detail: '提升留存与付费转化，短期几乎没收入',
    })
    actions.push({
      id: 'pivot',
      label: '小幅转型',
      detail: '砍掉伪需求，重选人群。士气与进度会受伤',
    })
    if (m.price < industry.avgPrice * 2.5) {
      actions.push({
        id: 'raise_price',
        label: '涨价',
        detail: `定价 → ¥${round(m.price * 1.35)}/月`,
      })
    }
    if (m.price > industry.avgPrice * 0.4) {
      actions.push({
        id: 'cut_price',
        label: '降价换量',
        detail: `定价 → ¥${round(m.price * 0.75)}/月`,
      })
    }
  }

  if (m.teamSize < 18) {
    actions.push({
      id: 'hire',
      label: '招人',
      detail: `+1 人，月薪约 ¥${industry.salaryPerHead.toLocaleString('zh-CN')}`,
    })
  }
  if (m.teamSize > setup.founders) {
    actions.push({
      id: 'fire',
      label: '裁员控成本',
      detail: '烧钱下降，士气与产能同步下滑',
    })
  }

  actions.push({
    id: 'cut_burn',
    label: '全面节流',
    detail: '砍营销与杂费，增长几乎停摆',
  })

  if (m.month >= 4 && m.reputation >= 35 && m.cash < setup.capital * 0.45) {
    actions.push({
      id: 'fundraise',
      label: '尝试融资',
      detail: '成功率取决于数据，失败会损声誉',
    })
  }

  actions.push({
    id: 'wait',
    label: '观望一个月',
    detail: '少折腾，让数据自己说话',
  })

  return actions.slice(0, 6)
}

function applyAction(
  state: GameState,
  actionId: ActionId,
): { metrics: Metrics; logs: LogEntry[] } {
  const industry = INDUSTRIES[state.setup.industryId]
  let m = { ...state.metrics }
  const logs: LogEntry[] = []
  const month = m.month
  const roll = rng(month * 97 + actionId.length * 13 + m.cash)

  switch (actionId) {
    case 'ship_mvp': {
      m.launched = true
      m.productScore = clamp(m.productScore + 5, 0, 100)
      const impressions = 20000 + round(roll * 25000)
      const clicks = round(impressions * (0.008 + roll * 0.012))
      const visits = round(clicks * 0.85)
      const signups = Math.max(
        2,
        round(visits * industry.visitToSignup * (0.7 + m.productScore / 200)),
      )
      m.users += signups
      logs.push({
        month,
        title: `第 ${month} 月 · MVP 上线`,
        body: `社区冷启动：曝光 ${impressions.toLocaleString('zh-CN')}，点击 ${clicks}，访客 ${visits}，注册 ${signups} 人（转化约 ${((signups / Math.max(visits, 1)) * 100).toFixed(1)}%）。这就是全部初始用户。`,
        tone: signups >= 8 ? 'warn' : 'bad',
      })
      break
    }
    case 'polish': {
      const gain = 6 + round(roll * 6)
      m.productScore = clamp(m.productScore + gain, 0, 100)
      m.marketFit = clamp(m.marketFit + 3 + round(roll * 4), 0, 100)
      m.cash -= round(m.burn * 0.08)
      m.churn = clamp(m.churn - 0.01, industry.monthlyChurn * 0.4, 0.35)
      logs.push({
        month,
        title: `第 ${month} 月 · 产品迭代`,
        body: `完成度 ${m.productScore}，市场匹配 ${m.marketFit}。用户未必会感谢你——但糟糕的产品一定会被立刻遗忘。`,
        tone: 'neutral',
      })
      break
    }
    case 'ads': {
      const spend = Math.max(10000, round(m.cash * 0.12))
      m.cash -= spend
      m.marketingSpend = round(m.marketingSpend * 0.5 + spend * 0.35)
      const effectiveCac =
        industry.baseCac *
        (1.1 - m.marketFit / 400) *
        (1 + m.competitors * 0.03)
      m.cac = round(effectiveCac)
      const newUsers = Math.max(1, round(spend / effectiveCac))
      m.users += newUsers
      logs.push({
        month,
        title: `第 ${month} 月 · 付费获客`,
        body: `砸下 ¥${spend.toLocaleString('zh-CN')}，拿回 ${newUsers} 个注册用户。有效 CAC ≈ ¥${m.cac}。广告平台从不打折。`,
        tone: newUsers > 40 ? 'warn' : 'bad',
      })
      break
    }
    case 'organic': {
      const signups = Math.max(
        1,
        round((3 + roll * 12) * (0.6 + m.reputation / 100) * (0.5 + m.productScore / 120)),
      )
      m.users += signups
      m.reputation = clamp(m.reputation + 2, 0, 100)
      logs.push({
        month,
        title: `第 ${month} 月 · 社区运营`,
        body: `发帖、私信、答疑。本月自然增长 ${signups} 人。慢，但是真的。`,
        tone: signups >= 8 ? 'good' : 'neutral',
      })
      break
    }
    case 'hire': {
      m.teamSize += 1
      m.morale = clamp(m.morale + 3, 0, 100)
      m.productScore = clamp(m.productScore + 2, 0, 100)
      logs.push({
        month,
        title: `第 ${month} 月 · 扩招`,
        body: `团队扩至 ${m.teamSize} 人。产能上升，烧钱同步上升。`,
        tone: 'neutral',
      })
      break
    }
    case 'fire': {
      m.teamSize = Math.max(state.setup.founders, m.teamSize - 1)
      m.morale = clamp(m.morale - 12, 0, 100)
      m.productScore = clamp(m.productScore - 3, 0, 100)
      m.reputation = clamp(m.reputation - 4, 0, 100)
      logs.push({
        month,
        title: `第 ${month} 月 · 裁员`,
        body: `编制收至 ${m.teamSize} 人。省下了工资，也折损了信任。`,
        tone: 'warn',
      })
      break
    }
    case 'raise_price': {
      const old = m.price
      m.price = round(m.price * 1.35)
      m.paidUsers = Math.max(0, round(m.paidUsers * 0.82))
      logs.push({
        month,
        title: `第 ${month} 月 · 涨价`,
        body: `定价从 ¥${old} 调至 ¥${m.price}。部分用户离开，留下的人更「贵」。`,
        tone: 'warn',
      })
      break
    }
    case 'cut_price': {
      const old = m.price
      m.price = Math.max(1, round(m.price * 0.75))
      m.users += round(m.users * 0.08 + 5)
      logs.push({
        month,
        title: `第 ${month} 月 · 降价`,
        body: `定价从 ¥${old} 调至 ¥${m.price}。量起来一点，利润空间被挤压。`,
        tone: 'neutral',
      })
      break
    }
    case 'pivot': {
      m.marketFit = clamp(20 + roll * 40, 15, 70)
      m.productScore = clamp(m.productScore - 10, 20, 100)
      m.morale = clamp(m.morale - 8, 0, 100)
      m.users = round(m.users * 0.55)
      m.paidUsers = round(m.paidUsers * 0.4)
      m.churn = industry.monthlyChurn
      logs.push({
        month,
        title: `第 ${month} 月 · 转型`,
        body: `砍掉旧叙事，重选人群。市场匹配重置为 ${m.marketFit}。用户资产大幅折损。`,
        tone: 'warn',
      })
      break
    }
    case 'cut_burn': {
      m.marketingSpend = round(m.marketingSpend * 0.25)
      m.morale = clamp(m.morale - 5, 0, 100)
      logs.push({
        month,
        title: `第 ${month} 月 · 节流`,
        body: '砍掉广告与可选项支出。账户喘了口气，增长几乎停摆。',
        tone: 'neutral',
      })
      break
    }
    case 'fundraise': {
      const traction =
        m.mrr / 10000 + m.marketFit / 50 + m.users / 500 + (roll > 0.72 ? 1 : 0)
      if (traction > 2.2 && m.mrr >= 8000) {
        const raise = round(180000 + m.mrr * 18 + roll * 400000)
        m.cash += raise
        m.reputation = clamp(m.reputation + 10, 0, 100)
        logs.push({
          month,
          title: `第 ${month} 月 · 融资成功`,
          body: `投资人看了数据，打款 ¥${raise.toLocaleString('zh-CN')}。稀释发生了，公司还活着。`,
          tone: 'good',
        })
      } else {
        m.reputation = clamp(m.reputation - 6, 0, 100)
        m.morale = clamp(m.morale - 6, 0, 100)
        logs.push({
          month,
          title: `第 ${month} 月 · 融资失败`,
          body: '路演了三家。回复是：再看看数据。现金没有增加，士气下降了。',
          tone: 'bad',
        })
      }
      break
    }
    case 'wait':
    default: {
      logs.push({
        month,
        title: `第 ${month} 月 · 观望`,
        body: '本月没有大动作。固定成本照常扣款，市场不会等你。',
        tone: 'neutral',
      })
      break
    }
  }

  return { metrics: m, logs }
}

function simulateEconomy(m: Metrics, setup: CompanySetup, month: number): Metrics {
  const industry = INDUSTRIES[setup.industryId]
  const next = { ...m }
  const roll = rng(month * 41 + next.users + next.cash)

  if (next.launched && next.users > 0) {
    const fitFactor = 0.55 + next.marketFit / 180
    const productFactor = 0.6 + next.productScore / 200
    const pricePressure = clamp(industry.avgPrice / Math.max(next.price, 1), 0.5, 1.4)

    const conversion =
      industry.signupToPaid * fitFactor * productFactor * pricePressure * (0.85 + roll * 0.3)
    const freePool = Math.max(0, next.users - next.paidUsers)
    const newPaid = Math.max(0, round(freePool * conversion * 0.35))
    next.paidUsers += newPaid

    const churnRate = clamp(
      next.churn * (1.15 - next.productScore / 250) * (1.1 - next.morale / 300),
      0.03,
      0.4,
    )
    const churnedPaid = round(next.paidUsers * churnRate)
    const churnedUsers = round(next.users * (churnRate * 1.2))
    next.paidUsers = Math.max(0, next.paidUsers - churnedPaid)
    next.users = Math.max(next.paidUsers, next.users - churnedUsers)
    next.churn = churnRate

    // organic drip
    if (next.reputation > 45) {
      next.users += round((1 + roll * 4) * (next.reputation / 50))
    }

    next.mrr = round(next.paidUsers * next.price)

    // hardware one-time purchase approximation
    if (setup.industryId === 'hardware') {
      next.mrr = round(next.paidUsers * next.price * 0.15)
    }
  } else {
    next.mrr = 0
  }

  next.marketingSpend = round(next.marketingSpend * 0.92)
  next.competitors += roll > 0.82 ? 1 : 0
  next.cash += next.mrr
  next.cash -= recomputeBurn(next, setup)

  // random shock
  if (roll > 0.9 && next.launched) {
    const loss = round(next.users * 0.08)
    next.users = Math.max(next.paidUsers, next.users - loss)
    next.reputation = clamp(next.reputation - 5, 0, 100)
  }

  if (next.morale < 35) {
    next.productScore = clamp(next.productScore - 2, 0, 100)
  }

  return refreshDerived(next, setup)
}

function maybeEvent(state: GameState): DecisionPoint | null {
  const m = state.metrics
  const roll = rng(m.month * 17 + m.cash * 0.001 + m.users)

  if (m.month === 1 && !m.launched) {
    return {
      id: 'segment',
      title: '选择你真正愿意服务的人群',
      narrative:
        '「有需求」和「愿意付钱」是两件事。请在不完美的选项里做决定——市场不会给你完美答案。',
      options: [
        {
          id: 'seg_niche',
          label: '窄人群 · 高付费',
          detail: '难获客，但客单与留存更好',
        },
        {
          id: 'seg_mass',
          label: '大人群 · 低付费',
          detail: '流量看起来很大，转化会折磨你',
        },
        {
          id: 'seg_pro',
          label: '专业用户 · 挑剔',
          detail: '他们懂行，也更容易离开',
        },
      ],
    }
  }

  if (m.launched && m.month >= 4 && roll > 0.78 && m.users > 0) {
    return {
      id: 'crisis',
      title: '突发：核心用户公开吐槽',
      narrative:
        '一位种子用户在社区发帖：功能缺、客服慢、定价虚高。评论区开始站队。你怎么回？',
      options: [
        {
          id: 'crisis_own',
          label: '公开认错并排期修复',
          detail: '短期伤声誉，长期换信任',
        },
        {
          id: 'crisis_ignore',
          label: '冷处理，继续迭代',
          detail: '省事，但可能被放大',
        },
        {
          id: 'crisis_discount',
          label: '发补偿券挽留',
          detail: '现金与定价权双输一点',
        },
      ],
    }
  }

  if (m.runway < 3 && m.cash > 0 && roll > 0.55) {
    return {
      id: 'runway_alarm',
      title: '跑道告急',
      narrative: `剩余跑道约 ${m.runway.toFixed(1)} 个月。投资人还没回消息。必须立刻选一条路。`,
      options: [
        {
          id: 'alarm_cut',
          label: '激进裁员与砍预算',
          detail: '求生第一',
        },
        {
          id: 'alarm_push',
          label: '孤注一掷加投放',
          detail: '赌转化能救现金流',
        },
        {
          id: 'alarm_side',
          label: '接外包活续命',
          detail: '偏离主线，但能进账',
        },
      ],
    }
  }

  return null
}

function resolveDecision(
  state: GameState,
  optionId: string,
): { metrics: Metrics; logs: LogEntry[] } {
  let m = { ...state.metrics }
  const logs: LogEntry[] = []
  const month = m.month

  switch (optionId) {
    case 'seg_niche':
      m.marketFit = clamp(m.marketFit + 18, 0, 100)
      m.cac = round(m.cac * 1.35)
      m.churn = clamp(m.churn - 0.03, 0.03, 0.4)
      logs.push({
        month,
        title: '人群选择 · 窄而贵',
        body: '你押注小而确定的付费人群。获客更贵，但留存预期改善。',
        tone: 'good',
      })
      break
    case 'seg_mass':
      m.marketFit = clamp(m.marketFit + 6, 0, 100)
      m.cac = round(m.cac * 0.85)
      m.churn = clamp(m.churn + 0.04, 0.03, 0.45)
      logs.push({
        month,
        title: '人群选择 · 大而薄',
        body: '赛道看起来很宽。免费替代品也很多。转化会是长期折磨。',
        tone: 'warn',
      })
      break
    case 'seg_pro':
      m.marketFit = clamp(m.marketFit + 12, 0, 100)
      m.productScore = clamp(m.productScore - 5, 0, 100)
      m.price = round(m.price * 1.2)
      logs.push({
        month,
        title: '人群选择 · 专业玩家',
        body: '他们对产品要求极高。定价空间更大，容错率更低。',
        tone: 'neutral',
      })
      break
    case 'crisis_own':
      m.reputation = clamp(m.reputation + 8, 0, 100)
      m.morale = clamp(m.morale + 4, 0, 100)
      m.productScore = clamp(m.productScore + 4, 0, 100)
      m.cash -= 3000
      logs.push({
        month,
        title: '公关 · 认错修复',
        body: '你公开排期并兑现了两周内的修复。吐槽帖反成了信任资产。',
        tone: 'good',
      })
      break
    case 'crisis_ignore':
      m.reputation = clamp(m.reputation - 12, 0, 100)
      m.users = round(m.users * 0.9)
      logs.push({
        month,
        title: '公关 · 冷处理',
        body: '帖子被更多人看到。你省了时间，丢了口碑。',
        tone: 'bad',
      })
      break
    case 'crisis_discount':
      m.cash -= round(Math.max(2000, m.paidUsers * m.price * 0.5))
      m.reputation = clamp(m.reputation + 2, 0, 100)
      m.price = round(m.price * 0.95)
      logs.push({
        month,
        title: '公关 · 发券挽留',
        body: '用户暂时消气了。你也悄悄教会了市场：抱怨有折扣。',
        tone: 'warn',
      })
      break
    case 'alarm_cut':
      m.teamSize = Math.max(state.setup.founders, round(m.teamSize * 0.6))
      m.marketingSpend = 0
      m.morale = clamp(m.morale - 18, 0, 100)
      logs.push({
        month,
        title: '求生 · 激进节流',
        body: `编制压到 ${m.teamSize} 人，营销归零。公司变轻了，也变钝了。`,
        tone: 'warn',
      })
      break
    case 'alarm_push': {
      const spend = Math.min(m.cash * 0.55, Math.max(15000, m.cash * 0.4))
      m.cash -= spend
      const gained = Math.max(2, round(spend / (m.cac * 1.1)))
      m.users += gained
      logs.push({
        month,
        title: '求生 · 孤注一掷',
        body: `砸下 ¥${round(spend).toLocaleString('zh-CN')}，换来 ${gained} 个用户。要么破局，要么加速燃尽。`,
        tone: 'bad',
      })
      break
    }
    case 'alarm_side': {
      const income = round(25000 + rng(month) * 40000)
      m.cash += income
      m.productScore = clamp(m.productScore - 4, 0, 100)
      m.morale = clamp(m.morale - 3, 0, 100)
      logs.push({
        month,
        title: '求生 · 外包续命',
        body: `接项目进账 ¥${income.toLocaleString('zh-CN')}。主线进度被打断，但工资发得出去了。`,
        tone: 'neutral',
      })
      break
    }
    default:
      break
  }

  return { metrics: refreshDerived(m, state.setup), logs }
}

function evaluateEnding(state: GameState): {
  ending: EndingKind
  summary: string
} | null {
  const m = state.metrics
  const maxMonths = 24

  if (m.cash <= 0) {
    return {
      ending: 'bankrupt',
      summary: `第 ${m.month} 月，账户归零。「${state.setup.name}」停止运转。不是因为不够努力，而是单位经济模型从未跑通：获客成本吞噬了毛利，流失快过增长。`,
    }
  }

  if (m.month >= maxMonths) {
    if (m.mrr >= 80000 && m.runway > 6) {
      return {
        ending: 'scale',
        summary: `24 个月后，MRR ¥${m.mrr.toLocaleString('zh-CN')}，公司仍有跑道。你没有神话，但做成了一家可扩张的生意。这已经超过绝大多数创业叙事。`,
      }
    }
    if (m.mrr >= 20000 && m.cash > m.burn * 3) {
      return {
        ending: 'profitable',
        summary: `24 个月后，业务接近自洽。不算爆发，但能养活团队。真实的胜利往往看起来很朴素。`,
      }
    }
    if (m.mrr >= 5000 && m.reputation >= 55) {
      return {
        ending: 'acquired',
        summary: `一家大厂看中了你的用户与场景，开出了不够浪漫但足够理性的收购。你退出了战场——带着伤疤与支票。`,
      }
    }
    return {
      ending: 'zombie',
      summary: `24 个月过去了。公司还在，像一具还在呼吸的躯壳：有用户、没增长、有加班、没叙事。你可以继续耗着，也可以体面地停。`,
    }
  }

  // early success acquisition offer
  if (m.month >= 12 && m.mrr >= 50000 && m.marketFit >= 70) {
    return {
      ending: 'acquired',
      summary: `战略买家上门。他们要的不是你的梦想，是你的渠道与数据。你选择出售，「${state.setup.name}」并入更大的机器。`,
    }
  }

  return null
}

export function advanceMonth(state: GameState, actionId: ActionId): GameState {
  if (state.ending) return state

  let next: GameState = {
    ...state,
    metrics: { ...state.metrics, month: state.metrics.month + 1 },
    log: [...state.log],
    history: [...state.history],
    pendingDecision: null,
  }

  const applied = applyAction(next, actionId)
  next.metrics = { ...applied.metrics, month: next.metrics.month }
  next.log.push(...applied.logs)

  next.metrics = simulateEconomy(next.metrics, next.setup, next.metrics.month)
  next.history.push({
    month: next.metrics.month,
    cash: round(next.metrics.cash),
    mrr: next.metrics.mrr,
    users: next.metrics.users,
  })

  if (next.metrics.cash <= 0) {
    next.metrics.cash = 0
    const end = evaluateEnding(next)!
    next.ending = end.ending
    next.endingSummary = end.summary
    next.log.push({
      month: next.metrics.month,
      title: '公司解散',
      body: end.summary,
      tone: 'bad',
    })
    return next
  }

  const event = maybeEvent(next)
  if (event) {
    next.pendingDecision = event
    return next
  }

  const end = evaluateEnding(next)
  if (end) {
    next.ending = end.ending
    next.endingSummary = end.summary
    next.log.push({
      month: next.metrics.month,
      title: '模拟结束',
      body: end.summary,
      tone: end.ending === 'bankrupt' || end.ending === 'zombie' ? 'bad' : 'good',
    })
  }

  return next
}

export function resolvePending(
  state: GameState,
  optionId: string,
): GameState {
  if (!state.pendingDecision || state.ending) return state
  const resolved = resolveDecision(state, optionId)
  let next: GameState = {
    ...state,
    metrics: resolved.metrics,
    log: [...state.log, ...resolved.logs],
    pendingDecision: null,
  }

  const end = evaluateEnding(next)
  if (end) {
    next = {
      ...next,
      ending: end.ending,
      endingSummary: end.summary,
      log: [
        ...next.log,
        {
          month: next.metrics.month,
          title: '模拟结束',
          body: end.summary,
          tone: end.ending === 'bankrupt' || end.ending === 'zombie' ? 'bad' : 'good',
        },
      ],
    }
  }
  return next
}

export function quitGame(state: GameState): GameState {
  return {
    ...state,
    ending: 'quit',
    endingSummary: `你在第 ${state.metrics.month} 月主动停手。有时候，止损是最专业的决策。`,
    pendingDecision: null,
  }
}
