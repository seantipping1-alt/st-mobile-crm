import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Calendar, Users, Wrench, LogOut, ClipboardList, Settings, TrendingUp, HelpCircle, DollarSign, Bell, MoreHorizontal, X, ListChecks } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'
const MIKE_ID = '15233adf-756f-4704-a905-ba8c723a364b'

// Primary nav — always visible on bottom bar
const primaryNavItems = [
  { to: '/', icon: Calendar, label: 'Schedule' },
  { to: '/jobs', icon: Wrench, label: 'Jobs' },
  { to: '/follow-ups', icon: Bell, label: 'Follow-Ups' },
  { to: '/bonus', icon: TrendingUp, label: 'Bonus' },
]

// Items behind the "More" menu
const moreNavItems = [
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/services', icon: ClipboardList, label: 'Services' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/help', icon: HelpCircle, label: 'Help' },
]

const ownerNavItems = [
  { to: '/advisor', icon: DollarSign, label: 'Advisor', ownerOnly: true },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()

  const isOwner = user?.id === OWNER_ID
  const isMikeOrOwner = user?.id === OWNER_ID || user?.id === MIKE_ID

  // All items for desktop sidebar (no "More" menu needed)
  const allNavItems = [
    ...primaryNavItems,
    ...(isMikeOrOwner ? [{ to: '/tasks', icon: ListChecks, label: 'Tasks' }] : []),
    ...moreNavItems,
    ...(isOwner ? ownerNavItems : []),
  ]

  // Mobile primary + conditional items
  const mobilePrimary = [
    ...primaryNavItems,
    ...(isMikeOrOwner ? [{ to: '/tasks', icon: ListChecks, label: 'Tasks' }] : []),
    ...(isOwner ? ownerNavItems : []),
  ]

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-bg)]">
      {/* Sidebar - left on desktop, bottom bar on mobile */}
      <aside className="
        fixed bottom-0 left-0 right-0 z-50
        flex flex-row items-center justify-around
        px-2
        bg-[var(--color-surface)] border-t border-gray-800
        md:static md:z-auto
        md:flex-col md:items-center md:justify-start
        md:w-16 md:h-auto
        md:py-4 md:px-0 md:gap-2
        md:border-t-0 md:border-r
      " style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* Logo - hidden on mobile, visible on desktop */}
        <div className="hidden md:block mb-4">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center text-white font-bold text-xs">ST</div>
        </div>

        {/* Desktop: show all nav items */}
        <div className="hidden md:flex md:flex-col md:items-center md:gap-2">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center rounded-lg transition
                w-10 h-10 ${
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
        </div>

        {/* Mobile: primary items + More button */}
        <div className="flex md:hidden flex-row items-center justify-around w-full">
          {mobilePrimary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center rounded-lg transition
                w-12 h-10 ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-muted)] hover:text-white hover:bg-gray-800'
                }`
              }
              title={item.label}
            >
              <item.icon size={18} />
              <span className="text-[9px] mt-0.5">{item.label}</span>
            </NavLink>
          ))}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center rounded-lg transition w-12 h-10 text-[var(--color-muted)] hover:text-white hover:bg-gray-800`}
          >
            <MoreHorizontal size={18} />
            <span className="text-[9px] mt-0.5">More</span>
          </button>
        </div>

        {/* Spacer - desktop only */}
        <div className="hidden md:block flex-1" />

        {/* Sign out - desktop only (in sidebar); on mobile it's in More menu */}
        <button
          onClick={signOut}
          className="hidden md:flex w-10 h-10 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-gray-800 transition"
          title="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </aside>

      {/* More menu overlay — mobile only */}
      {moreOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--color-surface)] rounded-t-2xl border-t border-gray-700"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>

            {/* Close button */}
            <div className="flex justify-between items-center px-5 pb-2">
              <span className="text-sm font-medium text-white">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-white hover:bg-gray-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Menu items */}
            <div className="px-3 pb-2">
              {moreNavItems.map((item) => (
                <button
                  key={item.to}
                  onClick={() => { navigate(item.to); setMoreOpen(false) }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg text-[var(--color-muted)] hover:text-white hover:bg-gray-800 transition min-h-[44px]"
                >
                  <item.icon size={20} />
                  <span className="text-[15px] font-medium">{item.label}</span>
                </button>
              ))}

              {/* Sign out in More menu */}
              <div className="border-t border-gray-800 mt-2 pt-2">
                <button
                  onClick={() => { signOut(); setMoreOpen(false) }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-gray-800 transition min-h-[44px]"
                >
                  <LogOut size={20} />
                  <span className="text-[15px] font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content - padding-bottom on mobile for bottom bar clearance */}
      <main className="flex-1 overflow-auto md:pb-0" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {children}
      </main>
    </div>
  )
}