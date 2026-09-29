// 微信表情渲染映射。
// 经典 105 个：官方 CDN 编号 0-104（已下载到 assets/emotions/，顺序表经视觉抽查验证）。
// 新版表情（破涕为笑等）官方 CDN 无对应编号，用 Unicode emoji 兜底。

const CLASSIC_NAMES = [
  '微笑', '撇嘴', '色', '发呆', '得意', '流泪', '害羞', '闭嘴', '睡', '大哭',
  '尴尬', '发怒', '调皮', '呲牙', '惊讶', '难过', '酷', '冷汗', '抓狂', '吐',
  '偷笑', '可爱', '白眼', '傲慢', '饥饿', '困', '惊恐', '流汗', '憨笑', '大兵',
  '奋斗', '咒骂', '疑问', '嘘', '晕', '折磨', '衰', '骷髅', '敲打', '再见',
  '擦汗', '抠鼻', '鼓掌', '糗大了', '坏笑', '左哼哼', '右哼哼', '哈欠', '鄙视', '委屈',
  '快哭了', '阴险', '亲亲', '吓', '可怜', '菜刀', '西瓜', '啤酒', '篮球', '乒乓',
  '咖啡', '饭', '猪头', '玫瑰', '凋谢', '示爱', '爱心', '心碎', '蛋糕', '闪电',
  '炸弹', '刀', '足球', '瓢虫', '便便', '月亮', '太阳', '礼物', '拥抱', '强',
  '弱', '握手', '胜利', '抱拳', '勾引', '拳头', '差劲', '爱你', 'NO', 'OK',
  '爱情', '飞吻', '跳跳', '发抖', '怄火', '转圈', '磕头', '回头', '跳绳', '挥手',
  '激动', '街舞', '献吻', '左太极', '右太极'
]

const NEW_EMOJI: Record<string, string> = {
  破涕为笑: '😂', 捂脸: '🤦', 奸笑: '🤭', 机智: '🤓', 皱眉: '🙁', 耶: '✌️',
  吃瓜: '🍉', 加油: '💪', 汗: '😓', 天啊: '😱', Emm: '😐', 社会社会: '😎',
  旺柴: '🐶', 好的: '👌', 打脸: '😵', 哇: '😮', 翻白眼: '🙄', '666': '👍',
  让我看看: '👀', 叹气: '😔', 苦涩: '🥲', 裂开: '💥', 嘴唇: '👄', doge: '🐕',
  红包: '🧧', 转发: '↗️'
}

// vite 静态资源：编号 → 构建后的 url
const gifModules = import.meta.glob('../../assets/emotions/*.gif', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const gifById: Record<number, string> = {}
for (const [path, url] of Object.entries(gifModules)) {
  const m = path.match(/(\d+)\.gif$/)
  if (m) gifById[Number(m[1])] = url
}

const gifByName: Record<string, string> = {}
CLASSIC_NAMES.forEach((name, i) => {
  if (gifById[i]) gifByName[name] = gifById[i]
})

/** 微信消息里的非表情系统标记，渲染为徽章 */
const SYSTEM_TAGS = new Set([
  '动画表情', '语音', '图片', '视频通话', '语音通话', '文件', '链接', '音乐',
  '视频', '位置', '名片', '转账', '语音输入', '拍一拍'
])

export type EmotionPiece =
  | { kind: 'text'; value: string }
  | { kind: 'gif'; name: string; url: string }
  | { kind: 'emoji'; name: string; char: string }
  | { kind: 'tag'; name: string }

/** 把文本拆成 文本/经典表情/新表情/系统标记 片段 */
export function parseEmotionText(text: string): EmotionPiece[] {
  const pieces: EmotionPiece[] = []
  const re = /\[([^\[\]]{1,12})\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pieces.push({ kind: 'text', value: text.slice(last, m.index) })
    const name = m[1]
    if (gifByName[name]) {
      pieces.push({ kind: 'gif', name, url: gifByName[name] })
    } else if (NEW_EMOJI[name]) {
      pieces.push({ kind: 'emoji', name, char: NEW_EMOJI[name] })
    } else if (SYSTEM_TAGS.has(name)) {
      pieces.push({ kind: 'tag', name })
    } else {
      pieces.push({ kind: 'text', value: m[0] })
    }
    last = re.lastIndex
  }
  if (last < text.length) pieces.push({ kind: 'text', value: text.slice(last) })
  return pieces
}
