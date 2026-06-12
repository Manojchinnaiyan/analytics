// Deterministic visitor avatar + country flag — shared by Live Events, Users, etc.

/** A unique, stable digital avatar generated from a seed (device_id / user_id). */
export function Avatar({ seed, size = 30 }: { seed: string; size?: number }) {
  const s = encodeURIComponent(seed || 'anonymous')
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${s}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      className="rounded-full flex-shrink-0 bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-border)]"
      style={{ width: size, height: size }}
    />
  )
}

/** 2-letter ISO country code → flag emoji (US → 🇺🇸). Falls back to a globe. */
export function countryFlag(code?: string): string {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return '🌐'
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
}
