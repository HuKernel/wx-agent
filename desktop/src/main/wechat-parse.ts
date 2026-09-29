// 微信 PC 端复制格式解析器。按真实样本驱动，支持两种格式：
//
// 4.x 单行格式（默认）——每条消息一行：
//   abandon 2026年09月28日 14:30 我昨天坐地铁回来也是
//   琪兄 2026年09月28日 14:32 [语音] 4"
//
// 旧版多行格式（兼容）——段间空行，段首行为「昵称 时间」：
//   小林 21:02
//   好烦啊，这个老板什么都让我做。

export interface ParsedWechatImport {
  contactName: string
  messages: { role: 'them' | 'me'; text: string }[]
}

export interface AmbiguousWechatImport {
  ambiguous: true
  names: string[]
}

export type WechatParseResult = ParsedWechatImport | AmbiguousWechatImport | null

// 4.x：「昵称 2026年09月28日 14:30 内容」——日期时间为锚点，前为昵称后为内容
const LINE_WITH_DATE = /^(.+?) (\d{4}年\d{1,2}月\d{1,2}日 \d{1,2}:\d{2}) (.+)$/

// 旧版多行格式的段首行：「昵称 [日期/昨天 ]HH:MM[:SS]」
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

/** 解析微信复制文本；不符合格式返回 null，多昵称无法归属返回 ambiguous。 */
export function parseWechatText(text: string, myName: string): WechatParseResult {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return null

  // 路径一：4.x 单行格式
  const single: { name: string; text: string }[] = []
  for (const line of raw.split('\n')) {
    const m = line.trim().match(LINE_WITH_DATE)
    if (m) single.push({ name: m[1].trim(), text: m[3].trim() })
  }
  if (single.length) return resolve(single, myName)

  // 路径二：旧版多行格式（段间空行，段首「昵称 时间」+ 内容行）
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
