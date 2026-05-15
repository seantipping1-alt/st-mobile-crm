import { useAuth } from '../contexts/AuthContext'
import { Calendar, Users, Car, Wrench, FileText, Settings, LogOut, ClipboardList, Plug } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: Calendar, label: 'Schedule' },
  { to: '/jobs', icon: Wrench, label: 'Jobs' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/vehicles', icon: Car, label: 'Vehicles' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/team', icon: Settings, label: 'Team' },
  { to: '/services', icon: ClipboardList, label: 'Services' },
  { to: '/settings', icon: Plug, label: 'Settings' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth()

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-bg)]">
      {/* Sidebar - left on desktop, bottom bar on mobile */}
      <aside className="
        fixed bottom-0 left-0 right-0 z-50
        flex flex-row items-center justify-around
        h-14 px-2
        bg-[var(--color-surface)] border-t border-gray-800
        md:static md:z-auto
        md:flex-col md:items-center md:justify-start
        md:w-16 md:h-auto
        md:py-4 md:px-0 md:gap-2
        md:border-t-0 md:border-r
      ">
        {/* Logo - hidden on mobile, visible on desktop */}
        <div className="hidden md:block mb-4">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center text-white font-bold text-xs">ST</div>
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center rounded-lg transition
              w-12 h-10 md:w-10 md:h-10 ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted)] hover:text-white hover:bg-gray-800'
              }`
            }
            title={item.label}
          >
            <item.icon size={18} />
            <span className="text-[9px] mt-0.5 md:hidden">{item.label}</span>
          </NavLink>
        ))}

        {/* Spacer - desktop only */}
        <div className="hidden md:block flex-1" />

        {/* Sign out - desktop only (in sidebar); on mobile it's in team/settings */}
        <button
          onClick={signOut}
          className="hidden md:flex w-10 h-10 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-gray-800 transition"
          title="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </aside>

      {/* Main content - padding-bottom on mobile for bottom bar clearance */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
