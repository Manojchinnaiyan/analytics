'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBag, Plus, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { TableSkeleton } from '@/components/ui/Skeleton'

export default function IntegrationsPage() {
  const projectId = useProjectStore(s => s.projectId)
  const [shop, setShop] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['shopify-connections', projectId],
    queryFn: () => api.shopifyConnections(),
    enabled: !!projectId,
  })
  const connections = data?.connections ?? []
  const configured = data?.configured ?? false

  async function connect() {
    setError('')
    if (!shop.trim()) return
    setConnecting(true)
    try {
      const { url } = await api.shopifyConnect(shop.trim(), projectId)
      window.location.href = url // → Shopify's consent screen
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Could not start the connection')
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Integrations" subtitle="Connect your stack to InspectUser" />

      {/* Shopify connect */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-11 w-11 rounded-xl bg-[#95BF47]/15 text-[#5E8E3E] flex-shrink-0">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="type-h3-16 text-[var(--color-text)]">Shopify</h3>
            <p className="type-body-13 text-[var(--color-text-subtle)] mt-0.5">
              One-click connect — auto-captures your storefront funnel + revenue via a Web Pixel. No theme edits.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={shop}
                onChange={e => setShop(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connect()}
                placeholder="your-store.myshopify.com"
                className="ctrl w-[280px] max-w-full"
              />
              <button
                onClick={connect}
                disabled={connecting || !shop.trim()}
                className="btn-brand px-4 py-2 type-caption rounded-md inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {connecting ? 'Connecting…' : 'Connect store'}
              </button>
            </div>
            {!configured && (
              <p className="mt-2 type-body-12-400 text-[#B45309]">
                ⚠ Shopify isn’t configured on the server yet — set SHOPIFY_API_KEY / SHOPIFY_API_SECRET to enable connecting.
              </p>
            )}
            {error && <p className="mt-2 type-body-12-400 text-[#DE0202]">{error}</p>}
          </div>
        </div>
      </Card>

      {/* Connected stores */}
      <Card>
        <h3 className="type-h3-16 text-[var(--color-text)] mb-3">Connected stores</h3>
        {isLoading ? (
          <div className="px-1 py-2"><TableSkeleton rows={3} /></div>
        ) : connections.length === 0 ? (
          <p className="py-8 text-center type-body-13 text-[var(--color-text-subtle)]">No stores connected yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] type-caption text-[var(--color-text-muted)]">
                  <th className="text-left px-3 py-2">Store</th>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Connected</th>
                </tr>
              </thead>
              <tbody>
                {connections.map(c => (
                  <tr key={c.shop} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2.5">
                      <a href={`https://${c.shop}`} target="_blank" rel="noreferrer" className="type-small-body text-[#0052F2] hover:underline inline-flex items-center gap-1">
                        {c.shop} <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-3 py-2.5 type-body-13 text-[var(--color-text-muted)]">{c.project_name}</td>
                    <td className="px-3 py-2.5">
                      {c.connected
                        ? <span className="inline-flex items-center gap-1 type-body-12-400 text-[#16794C]"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span>
                        : <span className="inline-flex items-center gap-1 type-body-12-400 text-[var(--color-text-subtle)]"><XCircle className="h-3.5 w-3.5" /> Uninstalled</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right type-body-13 text-[var(--color-text-subtle)]">{new Date(c.installed_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
