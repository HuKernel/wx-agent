// 微信 PC 端「多选消息 → 复制」的合并格式解析器。
// 格式（3.x 与 4.x 一致）：每条消息为一段，段间空行分隔，
// 段首行 = "昵称 时间"（时间可为 HH:MM / 昨天 HH:MM / 2026/09/29 HH:MM 等），其后为内容行。

export interface ParsedWechatImport {
  contactName: string
  messages: { role: 'them' | 'me'; text: string }[]
}

const TIME_TAIL = /(\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+)?(昨天\s+|前天\s+|星期[一二三四五六日天]\s+)?\d{1,2}:\d{2}(?::\d{2})?$/

/** 解析微信合并复制文本；不符合格式或无法确定联系人时返回 null。 */
export function parseWechatText(text: string, myName: string): ParsedWechatImport | null {
  const raw = text.replace(/\r\n/g, '\n').trim()
  if (!raw) return null

  const blocks = raw.split(/\n\s*\n+/)
  const messages: { role: 'them' | 'me'; text: string }[] = []
  const names = new Map<string, number>()

  for (const block of blocks) {
    const lines = block.split('\n')
    const head = lines[0].trim()
    // 首行必须是「昵称 时间」结尾；昵称可含空格（取时间前的全部）
    const timeMatch = head.match(TIME_TAIL)
    if (!timeMatch) continue // 不是消息段（普通文本块），跳过

    const name = head.slice(0, head.length - timeMatch[0].length).trim()
    const content = lines.slice(1).join('\n').trim()
    if (!name || !content) continue

    const role: 'them' | 'me' = myName && name === myName ? 'me' : 'them'
    messages.push({ role, text: content })
    names.set(name, (names.get(name) ?? 0) + 1)
  }

  if (messages.length === 0) return null

  // 联系人 = 除"我"以外出现的第一位昵称；全是自己 → 无法归属，视为解析失败
  const contactName = [...names.keys()].find((n) => n !== myName)
  if (!contactName) return null

  return { contactName, messages }
}
