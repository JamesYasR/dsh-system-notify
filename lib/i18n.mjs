/**
 * Localized notification copy (English / Simplified Chinese).
 *
 * This module is shared by the host formatter and (through a small duplicate in
 * the client bundle) the settings page. It has no Node.js or Harness imports so
 * it can be unit tested in isolation.
 */

export const LANGUAGES = ['auto', 'zh', 'en']

const ZH = {
  'event.turnComplete': '任务完成',
  'event.turnError': '任务出错',
  'event.turnBlocked': '任务受阻',
  'event.turnMaxTokens': '输出被截断',
  'event.turnAborted': '任务已取消',
  'event.needsInput': '需要你的输入',
  'event.approvalRequest': '需要你的批准',
  'event.goalComplete': '目标已完成',
  'event.goalBlocked': '目标受阻',
  'event.subagentComplete': '子任务完成',
  'event.workflowComplete': '工作流完成',
  'event.custom': '通知',
  'event.test': '测试通知',

  'meta.workspace': '项目',
  'meta.duration': '耗时 {duration}',
  'meta.session': '会话 {id}',
  'meta.turn': '第 {turn} 轮',
  'meta.workflow': '工作流 {name}',
  'meta.agents': '并行代理 {count} 个',
  'meta.subagent': '子任务 {name}',
  'meta.errorCode': '错误码 {code}',
  'meta.blocked': '原因 {reason}',
  'meta.clickHint': '点击打开 DSH',
  'action.openDsh': '打开 DSH',
  'notify.testTitle': '测试通知',
  'notify.testBody': '这是一条来自 DSH 系统通知插件的测试通知。',

  'error.unknown': '未知错误',
  'empty.detail': '打开 DSH 查看详情',

  'duration.underSecond': '不到 1 秒',
  'duration.seconds': '{n} 秒',
  'duration.minutes': '{m} 分 {s} 秒',
  'duration.hours': '{h} 小时 {m} 分',
  'duration.took': '耗时 {duration}',
  'duration.tookEn': '耗时 {duration}'
}

const EN = {
  'event.turnComplete': 'Task completed',
  'event.turnError': 'Task failed',
  'event.turnBlocked': 'Task blocked',
  'event.turnMaxTokens': 'Output truncated',
  'event.turnAborted': 'Task cancelled',
  'event.needsInput': 'Input needed',
  'event.approvalRequest': 'Approval needed',
  'event.goalComplete': 'Goal completed',
  'event.goalBlocked': 'Goal blocked',
  'event.subagentComplete': 'Subagent finished',
  'event.workflowComplete': 'Workflow finished',
  'event.custom': 'Notification',
  'event.test': 'Test notification',

  'meta.workspace': 'Project',
  'meta.duration': 'took {duration}',
  'meta.session': 'session {id}',
  'meta.turn': 'turn {turn}',
  'meta.workflow': 'workflow {name}',
  'meta.agents': '{count} agents',
  'meta.subagent': 'subagent {name}',
  'meta.errorCode': 'code {code}',
  'meta.blocked': 'reason {reason}',
  'meta.clickHint': 'Click to open DSH',
  'action.openDsh': 'Open DSH',
  'notify.testTitle': 'Test notification',
  'notify.testBody': 'This is a test notification from the DSH system-notify plugin.',

  'error.unknown': 'Unknown error',
  'empty.detail': 'Open DSH for details',

  'duration.underSecond': 'under 1s',
  'duration.seconds': '{n}s',
  'duration.minutes': '{m}m {s}s',
  'duration.hours': '{h}h {m}m'
}

export function resolveLanguage(preference = 'auto', env = process.env, localeHint = undefined) {
  if (preference === 'zh' || preference === 'en') return preference
  const raw =
    localeHint ||
    (env && (env.DSH_SYSTEM_NOTIFY_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG)) ||
    ''
  const lowered = String(raw).toLowerCase()
  if (lowered.startsWith('zh')) return 'zh'
  if (lowered.startsWith('en')) return 'en'
  // Windows does not always export LANG. Intl carries the OS UI locale there.
  try {
    const intl = new Intl.DateTimeFormat().resolvedOptions().locale
    if (typeof intl === 'string' && intl.toLowerCase().startsWith('zh')) return 'zh'
  } catch {
    // ignore: fall through to English
  }
  return 'en'
}

export function translate(language, key, values = {}) {
  const table = language === 'zh' ? ZH : EN
  let text = table[key] ?? key
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

export function formatDuration(ms, language) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000) || 0)
  if (totalSeconds < 1) return translate(language, 'duration.underSecond')
  if (totalSeconds < 60) return translate(language, 'duration.seconds', { n: totalSeconds })
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return translate(language, 'duration.minutes', {
      m: minutes,
      s: language === 'zh' ? String(seconds).padStart(2, '0') : String(seconds)
    })
  }
  const hours = Math.floor(minutes / 60)
  return translate(language, 'duration.hours', {
    h: hours,
    m: language === 'zh' ? String(minutes % 60).padStart(2, '0') : String(minutes % 60)
  })
}
