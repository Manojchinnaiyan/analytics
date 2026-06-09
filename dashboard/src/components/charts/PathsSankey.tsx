'use client'

import { Sankey, Tooltip, Layer, Rectangle, ResponsiveContainer } from 'recharts'

export interface SankeyNode { name: string; step: number }
export interface SankeyLink { source: number; target: number; value: number }

function nodeColor(name: string): string {
  if (name === '(exit)') return '#DC2626'
  if (name === '(other)') return '#98a0b8'
  return '#0052F2'
}

// Custom node: a colored bar with the event name + flow count, label flipped to
// the inside edge when the node sits near the right border.
function PathNode(props: any) {
  const { x, y, width, height, index, payload, containerWidth } = props
  const nearRight = x + width + 120 > containerWidth
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={nodeColor(payload.name)} fillOpacity={0.95} radius={2} />
      <text
        x={nearRight ? x - 8 : x + width + 8}
        y={y + height / 2 - 5}
        textAnchor={nearRight ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={500}
        fill="#18181B"
      >
        {payload.name}
      </text>
      <text
        x={nearRight ? x - 8 : x + width + 8}
        y={y + height / 2 + 8}
        textAnchor={nearRight ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={10}
        fill="#8A8E99"
      >
        {payload.value?.toLocaleString()} users
      </text>
    </Layer>
  )
}

function PathLink(props: any) {
  const { sourceX, sourceY, targetX, targetY, sourceControlX, targetControlX, linkWidth, index } = props
  return (
    <path
      key={`link-${index}`}
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke="#0052F2"
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.16}
      strokeLinecap="round"
    />
  )
}

export function PathsSankey({ nodes, links }: { nodes: SankeyNode[]; links: SankeyLink[] }) {
  if (!nodes.length || !links.length) {
    return (
      <div className="h-80 flex items-center justify-center type-body-15 text-[var(--color-text-subtle)]">
        Not enough sequential activity to build a flow yet
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={460}>
      <Sankey
        data={{ nodes, links }}
        nodeWidth={12}
        nodePadding={26}
        margin={{ top: 16, right: 130, bottom: 16, left: 16 }}
        node={<PathNode />}
        link={<PathLink />}
      >
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #DEDFE2', fontSize: 13 }}
          formatter={(v: number) => [`${v.toLocaleString()} users`, 'flow']}
        />
      </Sankey>
    </ResponsiveContainer>
  )
}
