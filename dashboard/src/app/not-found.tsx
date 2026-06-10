import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-white px-6 text-center">
      <div>
        <div className="text-[80px] font-bold iu-gradient-text leading-none">404</div>
        <h1 className="text-[22px] font-semibold text-[var(--color-text)] mt-3">Page not found</h1>
        <p className="text-[15px] text-[var(--color-text-muted)] mt-2 max-w-sm">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link
          href="/"
          className="inline-block mt-7 px-5 py-2.5 rounded-xl bg-[var(--color-brand)] text-white text-[15px] font-medium hover:bg-[var(--color-brand-hover)] transition-colors"
        >
          Back home
        </Link>
      </div>
    </div>
  )
}
