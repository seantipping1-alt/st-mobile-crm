import { useAuth } from '../contexts/AuthContext'
import { Calendar, Users, Car, Wrench, FileText, Settings, LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: Calendar, label: 'Schedule' },
  { to: '/jobs', icon: Wrench, label: 'Jobs' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/vehicles', icon: Car, label: 'Vehicles' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/team', icon: Settings, label: 'Team' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth()

  return (
    <div className="flex h-screen bg-[var(--color-bg)]">
      {/* Sidebar */}
      <aside className="w-16 bg-[var(--color-surface)] flex flex-col items-center py-4 gap-2 border-r border-gray-800">
        <div className="mb-4">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center text-white font-bold text-xs">ST</div>
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-lg transition ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted)] hover:text-white hover:bg-gray-800'
              }`
            }
            title={item.label}
          >
            <item.icon size={18} />
          </NavLink>
        ))}

        <div className="flex-1" />

        <button
          onClick={signOut}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-gray-800 transition"
          title="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
