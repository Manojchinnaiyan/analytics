'use client'

import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react'

/**
 * Reveal — fade/slide a section in when it scrolls into view. One tiny
 * IntersectionObserver, no animation library, so the page stays fast.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  as?: ElementType
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`iu-reveal ${shown ? 'iu-in' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}
