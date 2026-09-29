import type { Conversation } from '../types/analysis'

// Mock 会话数据（Phase 3 起分析结果由真实 LLM 生成，不再内置 mock 分析）。
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
    ]
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
    messages: [{ id: 'm1', role: 'them', text: '这周回来吃饭吗？给你炖了汤。', time: '09:15' }]
  }
]

