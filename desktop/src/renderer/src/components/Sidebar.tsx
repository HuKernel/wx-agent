import { Heart, MessagesSquare, Settings } from 'lucide-react'

export type View = 'conversation' | 'settings'

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
}

const navItems: { id: View; label: string; icon: typeof MessagesSquare }[] = [
  { id: 'conversation', label: '对话', icon: MessagesSquare },
  { id: 'settings', label: '设置', icon: Settings }
]

export default function Sidebar({ view, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-border bg-card py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Heart className="h-5 w-5" aria-hidden />
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2" aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-label={label}
            aria-current={view === id ? 'page' : undefined}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors duration-200 ${
              view === id
                ? 'bg-muted text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        ))}
      </nav>
    </aside>
  )
}
