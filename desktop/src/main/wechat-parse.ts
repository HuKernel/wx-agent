// 微信 PC 端复制格式解析器。按真实样本驱动，按优先级支持四种格式：
//
// ⓪ 4.x 三行一组（实测真实剪贴板格式）——组间空行分隔：
//   abandon
//   2026年09月28日 13:02
//   你吃啥
//   （注意：个位数小时前为两个空格，如「2026年09月29日  9:22」）
//
// ① 4.x 单行（无换行的场景）——消息间仅空格：
//   abandon 2026年09月28日 14:30 我昨天坐地铁回来也是 琪兄 2026年09月28日 14:32 [语音] 4"
//
// ② 4.x 每行一条「昵称 日期 时间 内容」。
//
// ③ 旧版多行——段间空行，段首行「昵称 时间」，内容在后续行。

export interface ParsedWechatImport {
  contactName: string
  messages: { role: 'them' | 'me'; text: string }[]
}

export interface AmbiguousWechatImport {
  ambiguous: true
  names: string[]
}

export type WechatParseResult = ParsedWechatImport | AmbiguousWechatImport | null

// ⓪ 的日期行（独立一行）：2026年09月28日 13:02（小时前空格数不定，\s+ 兜住）
const DATE_LINE = /^\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}$/
// ① 的锚点：昵称 + 日期时间。昵称不含空格（单行格式中带空格的昵称本就无法与内容区分）
const ANCHOR = /(\S+) (\d{4}年\d{1,2}月\d{1,2}日 \d{1,2}:\d{2}) /g
const LINE_WITH_DATE = /^(.+?) (\d{4}年\d{1,2}月\d{1,2}日 \d{1,2}:\d{2}) (.+)$/

// ③ 的段首行：「昵称 [日期/昨天 ]HH:MM[:SS]」
const TIME_TAIL = /(\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+)?(昨天\s+|前天\s+|星期[一二三四五六日天]\s+)?\d{1,2}:\d{2}(?::\d{2})?$/

function resolve(
  entries: { name: string; text: string }[],
  myName: string
): WechatParseResult {
  if (!entries.length) return null
  const messages = entries.map((e) => ({
    role: (myName && e.name === myName ? 'me' : 'them') as 'them' | 'me',
    text: e.text
  }))
  const names = [...new Set(entries.map((e) => e.name))]

  if (myName) {
    const contactName = names.find((n) => n !== myName)
    if (!contactName) return null // 全是自己
    return { contactName, messages }
  }
  if (names.length >= 2) {
    // 多昵称且未设置"我的昵称"，无法区分谁是谁
    return { ambiguous: true, names }
  }
  return { contactName: names[0], messages } // 单昵称，全部视为对方
}

/** 路径⓪：三行一组（昵称 / 日期时间 / 内容），组间空行分隔。 */
function parseTripleLines(raw: string): { name: string; text: string }[] {
  const entries: { name: string; text: string }[] = []
  for (const block of raw.split(/\n\s*\n+/)) {
    const lines = block
      .split('\n')
      .map((s) => s.replace(/\ufeff/, '').trim())
      .filter((s) => s !== '')
    if (lines.length < 3) continue
    const [name, date, ...content] = lines
    if (!DATE_LINE.test(date)) continue
    const text = content.join('\n').trim()
    if (text) entries.push({ name, text })
  }
  return entries
}

/** 路径①：单行全局锚点扫描（无换行的 4.x 剪贴板变体）。 */
function parseSingleLine(raw: string): { name: string; text: string }[] {
  const anchors: { name: string; start: number; end: number }[] = []
  ANCHOR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ANCHOR.exec(raw)) !== null) {
    anchors.push({ name: m[1], start: m.index, end: ANCHOR.lastIndex })
  }
  if (anchors.length < 2) return [] // 至少两个锚才能界定内容边界

  const entries: { name: string; text: string }[] = []
  for (let i = 0; i < anchors.length; i++) {
    const contentEnd = i + 1 < anchors.length ? anchors[i + 1].start : raw.length
    const text = raw.slice(anchors[i].end, contentEnd).trim()
    if (text) entries.push({ name: anchors[i].name, text })
  }
  return entries
}

/** 解析微信复制文本；不符合格式返回 null，多昵称无法归属返回 ambiguous。 */
export function parseWechatText(text: string, myName: string): WechatParseResult {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return null

  if (raw.includes('\n')) {
    // 路径⓪：三行一组（当前 4.x 真实格式）
    const triple = parseTripleLines(raw)
    if (triple.length) return resolve(triple, myName)

    // 路径②：每行一条「昵称 日期 时间 内容」
    const single: { name: string; text: string }[] = []
    for (const line of raw.split('\n')) {
      const lm = line.trim().match(LINE_WITH_DATE)
      if (lm) single.push({ name: lm[1].trim(), text: lm[3].trim() })
    }
    if (single.length) return resolve(single, myName)

    // 路径③：旧版多行格式（段间空行，段首「昵称 时间」+ 内容行）
    const multi: { name: string; text: string }[] = []
    for (const block of raw.split(/\n\s*\n+/)) {
      const lines = block.split('\n')
      const head = lines[0].trim()
      const timeMatch = head.match(TIME_TAIL)
      if (!timeMatch) continue
      const name = head.slice(0, head.length - timeMatch[0].length).trim()
      const content = lines.slice(1).join('\n').trim()
      if (name && content) multi.push({ name, text: content })
    }
    return resolve(multi, myName)
  }

  // 路径①：无换行的单行格式
  const entries = parseSingleLine(raw)
  if (entries.length) return resolve(entries, myName)
  return null
}
