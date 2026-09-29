import type { Conversation } from '../types/analysis'

// Mock 数据：场景与三风格回复取自 /docs/AI_PROMPT.md §7 官方示例。
// Phase 3 接入真实 LLM 分析后移除。
export const mockConversations: Conversation[] = [
  {
    id: 'c1',
    contactName: '小林',
    relationship: '好友',
    messages: [
      { id: 'm1', role: 'them', text: '好烦啊，这个老板什么都让我做。', time: '21:02' },
      { id: 'm2', role: 'me', text: '怎么了，又加班了？', time: '21:03' },
      {
        id: 'm3',
        role: 'them',
        text: '是啊，方案让我写，客户让我对接，连打印文件都叫我。感觉我就是个工具人。',
        time: '21:04'
      }
    ],
    analysis: {
      emotion_analysis: {
        emotion: '挫败 / 委屈',
        intensity: '高',
        hidden_need: '情绪认同，希望被理解，而非马上收到建议'
      },
      communication_strategy: '先承接情绪，表达理解，再顺势提问让她继续倾诉',
      risk_warning: '避免直接给"辞职"类建议，会让她感觉不被理解',
      reply_options: [
        { style: 'warm', reply: '感觉你真的挺累的🥲 怎么什么事情都压到你身上了？' },
        { style: 'casual', reply: '救命😂 你老板是不是把你当万能员工用了。' },
        { style: 'deep', reply: '他一直这样给你安排事情吗？还是最近突然特别多？' }
      ],
      reason: '对方处于情绪宣泄期，最需要的是被看见和被认同'
    }
  },
  {
    id: 'c2',
    contactName: '陈姐',
    relationship: '同事',
    messages: [
      { id: 'm1', role: 'them', text: '明天那个评审会议你能来吗？想让你帮忙把把关。', time: '17:40' },
      { id: 'm2', role: 'me', text: '几点开始？我看下日程。', time: '17:45' }
    ]
  },
  {
    id: 'c3',
    contactName: '妈妈',
    relationship: '家人',
    messages: [
      { id: 'm1', role: 'them', text: '这周回来吃饭吗？给你炖了汤。', time: '09:15' }
    ]
  }
]
