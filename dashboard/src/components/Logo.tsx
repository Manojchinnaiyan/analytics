/**
 * InspectUser logomark — a clean, SaaS-style vector mark: a magnifying lens
 * (inspect) holding a small upward trend (insight), in the brand gradient.
 * Scales crisply at any size; pass a size via className (default h-8 w-8).
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="InspectUser" fill="none">
      <defs>
        <linearGradient id="iuLogoGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052F2" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#iuLogoGrad)" />
      {/* lens */}
      <circle cx="13.5" cy="13.5" r="6.6" stroke="#fff" strokeWidth="2.4" />
      {/* handle */}
      <path d="M18.6 18.6 L24 24" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      {/* upward trend inside the lens */}
      <path d="M10.4 15.2 L12.6 12.6 L14.7 14.1 L17 11.1" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
