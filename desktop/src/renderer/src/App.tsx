import { useState } from 'react'
import AppShell from './components/AppShell'
import type { View } from './components/Sidebar'
import ConversationView from './views/ConversationView'
import SettingsView from './views/SettingsView'

function App() {
  const [view, setView] = useState<View>('conversation')

  return (
    <AppShell view={view} onNavigate={setView}>
      {view === 'conversation' ? <ConversationView /> : <SettingsView />}
    </AppShell>
  )
}

export default App
