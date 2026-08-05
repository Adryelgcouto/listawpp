import { Link, useRouterState } from '@tanstack/react-router'
import {
  CalendarDays,
  Camera,
  ListOrdered,
  Settings,
  Users,
} from 'lucide-react'

const items = [
  { to: '/', label: 'Hoje', icon: CalendarDays },
  { to: '/escanear', label: 'Scan', icon: Camera },
  { to: '/clientes', label: 'Base', icon: Users },
  { to: '/fila', label: 'Fila', icon: ListOrdered },
  { to: '/config', label: 'Ajustes', icon: Settings },
] as const

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav className="dock" aria-label="Navegação principal">
      {items.map(({ to, label, icon: Icon }) => {
        const active =
          to === '/'
            ? pathname === '/'
            : pathname === to || pathname.startsWith(`${to}/`)
        return (
          <Link
            key={to}
            to={to}
            className="dock-item"
            data-active={active ? 'true' : 'false'}
          >
            <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
