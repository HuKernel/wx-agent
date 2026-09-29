import type { ReactNode } from 'react'
import Sidebar, { type View } from './Sidebar'

interface AppShellProps {
  view: View
  onNavigate: (view: View) => void
  children: ReactNode
}

export default function AppShell({ view, onNavigate, children }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex h-full bg-background text-foreground">
      <Sidebar view={view} onNavigate={onNavigate} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
