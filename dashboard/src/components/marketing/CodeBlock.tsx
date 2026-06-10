'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-xl overflow-hidden border border-[#1f2733] bg-[#0d1117] my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2733]">
        <span className="text-[11px] uppercase tracking-wide text-[#7d8590]">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="text-[#7d8590] hover:text-white transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] leading-relaxed"><code className="text-[#c9d1d9] font-mono whitespace-pre">{code}</code></pre>
    </div>
  )
}
