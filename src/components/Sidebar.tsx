import { NavLink } from 'react-router-dom'
import { Zap, Image, LayoutDashboard } from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/image-engine', label: 'Image Engine', icon: Image },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-flare-gray border-r border-flare-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-flare-border">
        <Zap className="text-flare-orange" size={22} />
        <span className="font-bold text-lg tracking-tight">Flare</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-flare-orange/10 text-flare-orange'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-flare-border">
        <p className="text-xs text-gray-500">Flare MK1 · Image Engine</p>
      </div>
    </aside>
  )
}
