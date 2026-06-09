// Safe arithmetic evaluator (shunting-yard → RPN) for formula metrics.
// Supports + - * / ( ) , numbers, and single-letter variables (A, B, C…).
// No eval/Function — tokenized and computed manually.

type Token = { t: 'num' | 'var' | 'op' | 'lp' | 'rp'; v: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (ch === ' ') { i++; continue }
    if (ch >= '0' && ch <= '9' || ch === '.') {
      let n = ''
      while (i < expr.length && (/[0-9.]/.test(expr[i]))) { n += expr[i++] }
      tokens.push({ t: 'num', v: n })
      continue
    }
    if (/[a-zA-Z]/.test(ch)) { tokens.push({ t: 'var', v: ch.toUpperCase() }); i++; continue }
    if ('+-*/'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue }
    if (ch === '(') { tokens.push({ t: 'lp', v: ch }); i++; continue }
    if (ch === ')') { tokens.push({ t: 'rp', v: ch }); i++; continue }
    throw new Error(`Unexpected character: ${ch}`)
  }
  return tokens
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = []
  const ops: Token[] = []
  for (const tk of tokens) {
    if (tk.t === 'num' || tk.t === 'var') out.push(tk)
    else if (tk.t === 'op') {
      while (ops.length && ops[ops.length - 1].t === 'op' && PREC[ops[ops.length - 1].v] >= PREC[tk.v]) out.push(ops.pop()!)
      ops.push(tk)
    } else if (tk.t === 'lp') ops.push(tk)
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop()!)
      ops.pop() // discard '('
    }
  }
  while (ops.length) out.push(ops.pop()!)
  return out
}

export function evalFormula(expr: string, vars: Record<string, number>): number {
  if (!expr.trim()) return 0
  const rpn = toRPN(tokenize(expr))
  const stack: number[] = []
  for (const tk of rpn) {
    if (tk.t === 'num') stack.push(Number(tk.v))
    else if (tk.t === 'var') stack.push(vars[tk.v] ?? 0)
    else if (tk.t === 'op') {
      const b = stack.pop() ?? 0
      const a = stack.pop() ?? 0
      switch (tk.v) {
        case '+': stack.push(a + b); break
        case '-': stack.push(a - b); break
        case '*': stack.push(a * b); break
        case '/': stack.push(b === 0 ? 0 : a / b); break
      }
    }
  }
  const r = stack.pop() ?? 0
  return Number.isFinite(r) ? r : 0
}
