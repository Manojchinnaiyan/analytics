'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Rocket, Sparkles, RefreshCw, BarChart2, GitMerge,
  Radio, Link2, Users, Users2, Settings, LayoutDashboard,
  Activity, Megaphone, Wrench, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Repeat, Zap, Route, Tags, Globe, Bell, FlaskConical, PlayCircle, Terminal, Sigma, Gauge, DollarSign, ScrollText, DatabaseZap,
} from 'lucide-react'
import { clsx } from 'clsx'
import { brand } from '@/config/brand'
import { useUIStore } from '@/stores/ui'
import { usePermission } from '@/stores/project'

type Icon = typeof LayoutGrid
type NavItem = { href: string; label: string; icon: Icon; perm?: string }
type Group = { heading: string; icon: Icon; items: NavItem[] }

const groups: Group[] = [
  {
    heading: 'Product Analytics', icon: LayoutDashboard,
    items: [
      { href: '/overview',          label: 'Product Overview',   icon: LayoutGrid },
      { href: '/web',                label: 'Website Analytics',  icon: Globe },
      { href: '/replay',             label: 'Session Replay',     icon: PlayCircle, perm: 'replay.view' },
      { href: '/onboarding',         label: 'Onboarding',         icon: Rocket },
      { href: '/feature-engagement', label: 'Feature Engagement', icon: Sparkles },
      { href: '/retention',          label: 'Retention',          icon: RefreshCw },
      { href: '/lifecycle',          label: 'Lifecycle',          icon: Repeat },
      { href: '/revenue',            label: 'Revenue',            icon: DollarSign },
    ],
  },
  {
    heading: 'Behavior', icon: Activity,
    items: [
      { href: '/charts',  label: 'Segmentation', icon: BarChart2 },
      { href: '/funnels', label: 'Funnels',       icon: GitMerge },
      { href: '/formula', label: 'Formulas',      icon: Sigma },
      { href: '/paths',   label: 'User Paths',    icon: Route },
      { href: '/live',    label: 'Live Events',   icon: Zap },
    ],
  },
  {
    heading: 'Marketing', icon: Megaphone,
    items: [
      { href: '/acquisition', label: 'Acquisition', icon: Radio },
      { href: '/links',       label: 'Smart Links', icon: Link2 },
    ],
  },
  {
    heading: 'Build', icon: Wrench,
    items: [
      { href: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
      { href: '/cohorts',    label: 'Cohorts',    icon: Users2 },
      { href: '/experiments', label: 'Experiments', icon: FlaskConical, perm: 'flags.view' },
      { href: '/sql',        label: 'SQL / Notebooks', icon: Terminal, perm: 'sql.run' },
      { href: '/alerts',     label: 'Alerts',     icon: Bell },
      { href: '/taxonomy',   label: 'Event Taxonomy', icon: Tags },
    ],
  },
  {
    heading: 'People', icon: Users,
    items: [
      { href: '/users',    label: 'Users',    icon: Users },
      { href: '/usage',    label: 'Usage & Billing', icon: Gauge, perm: 'billing.view' },
      { href: '/audit',    label: 'Audit Log', icon: ScrollText, perm: 'team.manage' },
      { href: '/export',   label: 'Data Export', icon: DatabaseZap, perm: 'settings.manage' },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { pinned, togglePinned, collapsedGroups, toggleGroup } = useUIStore()
  const [hovering, setHovering] = useState(false)
  const can = usePermission()

  // Hide nav entries the user lacks permission for; drop groups left empty.
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(it => !it.perm || can(it.perm)) }))
    .filter(g => g.items.length > 0)

  // Rail (icons-only) when collapsed and not hovered. Hover temporarily expands.
  const expanded = pinned || hovering

  // Collapsing should take effect immediately even while the cursor is over the bar.
  const handleToggle = () => {
    if (pinned) setHovering(false)
    togglePinned()
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/overview' && pathname.startsWith(href))

  return (
    <aside
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={clsx(
        'bg-white border-r border-[var(--color-border)] flex flex-col flex-shrink-0 transition-[width] duration-200 ease-out',
        expanded ? 'w-[244px]' : 'w-[60px]',
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-7 h-7 rounded-md bg-[#0052F2] flex items-center justify-center text-white type-caption flex-shrink-0">
            {brand.name.slice(0, 1)}
          </div>
          {expanded && <span className="type-h3-16 text-[var(--color-text)] truncate">{brand.name}</span>}
        </div>
        {expanded && (
          <button
            onClick={handleToggle}
            title={pinned ? 'Collapse sidebar' : 'Keep expanded'}
            className="p-1.5 rounded-md text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors flex-shrink-0"
          >
            {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {visibleGroups.map(group => {
          const open = !collapsedGroups[group.heading]
          const GroupIcon = group.icon
          return (
            <div key={group.heading} className="px-2 mb-0.5">
              {expanded ? (
                /* ── Group header (Amplitude style: icon + label, chevron on the right) ── */
                <button
                  onClick={() => toggleGroup(group.heading)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  <GroupIcon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="type-small-body-14 truncate flex-1 text-left">{group.heading}</span>
                  <ChevronRight className={clsx('h-4 w-4 text-[var(--color-text-subtle)] transition-transform flex-shrink-0', open && 'rotate-90')} />
                </button>
              ) : (
                /* Rail mode: just a faint divider between groups */
                <div className="h-px bg-[var(--color-border)] mx-1.5 my-2" />
              )}

              {/* Items */}
              {(open || !expanded) && (
                <div className={clsx(expanded && 'mt-0.5 space-y-0.5')}>
                  {group.items.map(({ href, label, icon: ItemIcon }) => {
                    const active = isActive(href)
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={!expanded ? label : undefined}
                        className={clsx(
                          'flex items-center rounded-md transition-colors',
                          expanded ? 'gap-2.5 pl-[26px] pr-2 py-1.5' : 'justify-center py-2',
                          active
                            ? 'bg-[#EEF3FD] text-[#0052F2]'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]',
                        )}
                      >
                        <ItemIcon className={clsx('h-[18px] w-[18px] flex-shrink-0', active && 'text-[#0052F2]')} />
                        {expanded && <span className="type-small-body-14 truncate">{label}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
        {expanded
          ? <p className="type-body-12-400 text-[var(--color-text-subtle)] truncate">{brand.name} · v0.1.0</p>
          : <button onClick={handleToggle} title="Expand sidebar" className="mx-auto p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"><PanelLeftOpen className="h-4 w-4" /></button>
        }
      </div>
    </aside>
  )
}
