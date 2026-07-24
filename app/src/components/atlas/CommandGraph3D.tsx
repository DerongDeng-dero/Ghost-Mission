import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { X, Maximize2 } from 'lucide-react'
import { commands } from '@/data/commands'

interface CommandNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  domain: string
  color: string
  riskLevel: string
  summary: string
}

interface CommandLink extends d3.SimulationLinkDatum<CommandNode> {
  source: string | CommandNode
  target: string | CommandNode
  value: number
}

interface CommandGraph3DProps {
  onCommandSelect?: (commandName: string) => void
}

function getNodeId(endpoint: CommandLink['source']): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function getNodeCoordinate(endpoint: CommandLink['source'], axis: 'x' | 'y'): number {
  return typeof endpoint === 'string' ? 0 : endpoint[axis] ?? 0
}

// Domain colors matching the existing theme
const DOMAIN_COLORS: Record<string, string> = {
  File: '#00FF88',
  Text: '#00E5FF',
  Process: '#FFD166',
  Network: '#C77DFF',
  Git: '#FF6B35',
  Editor: '#FF4757',
  Runtime: '#2A9D8F',
  Package: '#4488FF',
  Container: '#2496ED',
  Database: '#E8EDF2',
  Services: '#FF6B6B',
  Shell: '#A0E7E5',
}

// Risk level colors for node glow effect
const RISK_COLORS: Record<string, string> = {
  green: '#00FF88',
  blue: '#00E5FF',
  yellow: '#FFD166',
  red: '#FF4757',
  purple: '#C77DFF',
  black: '#FF0000',
}

export default function CommandGraph3D({ onCommandSelect }: CommandGraph3DProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<CommandNode | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [isExpanded, setIsExpanded] = useState(false)

  // Build graph data from commands
  const { nodes, links } = useMemo(() => {
    const nodes: CommandNode[] = commands.map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      domain: cmd.domain,
      color: DOMAIN_COLORS[cmd.domain] || '#8B9EB0',
      riskLevel: cmd.riskLevel,
      summary: cmd.summary,
    }))

    const linkSet = new Set<string>()
    const links: CommandLink[] = []
    commands.forEach(cmd => {
      cmd.related.forEach(relatedName => {
        // Find the related command by name or id
        const relatedCmd = commands.find(c => c.name === relatedName || c.id === relatedName)
        if (relatedCmd) {
          const key = [cmd.id, relatedCmd.id].sort().join('-')
          if (!linkSet.has(key)) {
            linkSet.add(key)
            links.push({ source: cmd.id, target: relatedCmd.id, value: 1 })
          }
        }
      })
    })

    return { nodes, links }
  }, [])

  // Get connected nodes for highlighting
  const getConnectedNodes = useCallback((nodeId: string): Set<string> => {
    const connected = new Set<string>([nodeId])
    links.forEach(link => {
      const sourceId = getNodeId(link.source)
      const targetId = getNodeId(link.target)
      if (sourceId === nodeId) connected.add(targetId)
      if (targetId === nodeId) connected.add(sourceId)
    })
    return connected
  }, [links])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // D3 simulation setup
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = dimensions.width
    const height = dimensions.height

    // Create zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    // Main group for zoomable content
    const g = svg.append('g')

    // Create simulation
    const simulation = d3.forceSimulation<CommandNode>(nodes)
      .force('link', d3.forceLink<CommandNode, CommandLink>(links)
        .id(d => d.id)
        .distance(70)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody<CommandNode>().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<CommandNode>().radius(28))
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .velocityDecay(0.3)

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll<SVGLineElement, CommandLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#1E2D3D')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1)

    // Draw nodes group
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, CommandNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')

    const dragBehavior = d3.drag<SVGGElement, CommandNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(dragBehavior)

    // Outer glow circle
    node.append('circle')
      .attr('class', 'glow')
      .attr('r', d => d.name.length > 8 ? 16 : 13)
      .attr('fill', d => d.color)
      .attr('opacity', 0.15)

    // Main circle
    node.append('circle')
      .attr('class', 'main-circle')
      .attr('r', d => d.name.length > 8 ? 11 : 9)
      .attr('fill', d => d.color)
      .attr('stroke', '#0A0E14')
      .attr('stroke-width', 2.5)

    // Inner dot
    node.append('circle')
      .attr('class', 'inner-dot')
      .attr('r', 2.5)
      .attr('fill', '#0A0E14')
      .attr('opacity', 0.6)

    // Labels
    node.append('text')
      .text(d => d.name)
      .attr('x', 16)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#E8EDF2')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px #0A0E14')

    // Hover effects
    node.on('mouseenter', function(event: MouseEvent, d: CommandNode) {
      const connected = getConnectedNodes(d.id)
      const hoveredGroup = d3.select<SVGGElement, CommandNode>(event.currentTarget as SVGGElement)

      // Dim unconnected nodes
      node.transition().duration(150)
        .style('opacity', n => connected.has(n.id) ? 1 : 0.15)

      // Highlight connected links
      link.transition().duration(150)
        .attr('stroke-opacity', l => {
          const sourceId = getNodeId(l.source)
          const targetId = getNodeId(l.target)
          return (sourceId === d.id || targetId === d.id) ? 0.9 : 0.05
        })
        .attr('stroke', l => {
          const sourceId = getNodeId(l.source)
          const targetId = getNodeId(l.target)
          return (sourceId === d.id || targetId === d.id) ? d.color : '#1E2D3D'
        })
        .attr('stroke-width', l => {
          const sourceId = getNodeId(l.source)
          const targetId = getNodeId(l.target)
          return (sourceId === d.id || targetId === d.id) ? 2 : 1
        })

      // Scale up hovered node
      hoveredGroup.select<SVGCircleElement>('.main-circle')
        .transition().duration(150)
        .attr('r', nodeDatum => nodeDatum.name.length > 8 ? 14 : 12)

      hoveredGroup.select<SVGCircleElement>('.glow')
        .transition().duration(150)
        .attr('opacity', 0.4)
        .attr('r', nodeDatum => nodeDatum.name.length > 8 ? 20 : 17)
    })

    node.on('mouseleave', function(event: MouseEvent) {
      const hoveredGroup = d3.select<SVGGElement, CommandNode>(event.currentTarget as SVGGElement)

      // Restore all nodes
      node.transition().duration(300)
        .style('opacity', 1)

      // Restore links
      link.transition().duration(300)
        .attr('stroke-opacity', 0.5)
        .attr('stroke', '#1E2D3D')
        .attr('stroke-width', 1)

      // Scale down
      hoveredGroup.select<SVGCircleElement>('.main-circle')
        .transition().duration(300)
        .attr('r', nodeDatum => nodeDatum.name.length > 8 ? 11 : 9)

      hoveredGroup.select<SVGCircleElement>('.glow')
        .transition().duration(300)
        .attr('opacity', 0.15)
        .attr('r', nodeDatum => nodeDatum.name.length > 8 ? 16 : 13)
    })

    // Click handler
    node.on('click', (event: MouseEvent, d: CommandNode) => {
      event.stopPropagation()
      setSelectedNode(d)
      onCommandSelect?.(d.name)
    })

    // Click background to deselect
    svg.on('click', () => {
      setSelectedNode(null)
    })

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => getNodeCoordinate(d.source, 'x'))
        .attr('y1', d => getNodeCoordinate(d.source, 'y'))
        .attr('x2', d => getNodeCoordinate(d.target, 'x'))
        .attr('y2', d => getNodeCoordinate(d.target, 'y'))

      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      simulation.on('tick', null)
      simulation.stop()
      svg.on('.zoom', null)
      svg.on('click', null)
      svg.selectAll('*').interrupt()
    }
  }, [nodes, links, dimensions, onCommandSelect, getConnectedNodes])

  // Get related commands for selected node
  const relatedCommands = useMemo(() => {
    if (!selectedNode) return []
    return commands.filter(cmd => {
      const isRelated = cmd.related.some(r => {
        const relatedCmd = commands.find(c => c.name === r || c.id === r)
        return relatedCmd?.id === selectedNode.id
      })
      const isSourceRelated = commands
        .find(c => c.id === selectedNode.id)
        ?.related.some(r => {
          const relatedCmd = commands.find(c => c.name === r || c.id === r)
          return relatedCmd?.id === cmd.id
        })
      return isRelated || isSourceRelated
    }).slice(0, 6)
  }, [selectedNode])

  return (
    <div
      ref={containerRef}
      className="w-full relative overflow-hidden rounded-lg border"
      style={{
        height: isExpanded ? '85vh' : 520,
        backgroundColor: '#0A0E14',
        borderColor: '#1E2D3D',
        transition: 'height 0.3s ease',
      }}
    >
      {/* Header */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="font-jetbrains text-[11px] text-[#4A6072] bg-[#0F1419] px-2 py-1 rounded border border-[#1E2D3D]">
          {nodes.length} nodes · {links.length} links
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-[#0F1419] border border-[#1E2D3D] text-[#4A6072] hover:text-[#E8EDF2] p-1 rounded transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* SVG */}
      <svg ref={svgRef} className="w-full h-full" style={{ backgroundColor: '#0A0E14' }} />

      {/* Selected node detail panel */}
      {selectedNode && (
        <div
          className="absolute top-3 right-3 w-64 rounded-lg border p-4 z-10"
          style={{ backgroundColor: '#0F1419EE', borderColor: '#1E2D3D', backdropFilter: 'blur(8px)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <code className="font-jetbrains text-code-lg" style={{ color: selectedNode.color }}>
              {selectedNode.name}
            </code>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-[#4A6072] hover:text-[#E8EDF2] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <p className="font-inter text-body-xs text-[#8B9EB0] mb-1">{selectedNode.summary}</p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="font-jetbrains text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${selectedNode.color}20`,
                color: selectedNode.color,
              }}
            >
              {selectedNode.domain}
            </span>
            <span
              className="font-jetbrains text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${RISK_COLORS[selectedNode.riskLevel] || '#8B9EB0'}20`,
                color: RISK_COLORS[selectedNode.riskLevel] || '#8B9EB0',
              }}
            >
              {selectedNode.riskLevel}
            </span>
          </div>

          {relatedCommands.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#1E2D3D]">
              <p className="font-jetbrains text-[10px] text-[#4A6072] mb-1.5">Related</p>
              <div className="flex flex-wrap gap-1">
                {relatedCommands.map(cmd => (
                  <span
                    key={cmd.id}
                    className="font-jetbrains text-[10px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      backgroundColor: `${DOMAIN_COLORS[cmd.domain] || '#8B9EB0'}15`,
                      color: DOMAIN_COLORS[cmd.domain] || '#8B9EB0',
                      border: `1px solid ${DOMAIN_COLORS[cmd.domain] || '#8B9EB0'}30`,
                    }}
                    onClick={() => {
                      const node = nodes.find(n => n.id === cmd.id)
                      if (node) {
                        setSelectedNode(node)
                        onCommandSelect?.(cmd.name)
                      }
                    }}
                  >
                    {cmd.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {onCommandSelect && (
            <button
              onClick={() => onCommandSelect(selectedNode.name)}
              className="mt-3 w-full py-1.5 rounded font-jetbrains text-body-sm transition-opacity hover:opacity-80"
              style={{
                backgroundColor: `${selectedNode.color}20`,
                color: selectedNode.color,
                border: `1px solid ${selectedNode.color}40`,
              }}
            >
              View Details
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 max-w-[80%]"
        style={{ pointerEvents: 'none' }}
      >
        {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
          <div key={domain} className="flex items-center gap-1" style={{ pointerEvents: 'auto' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-jetbrains text-[9px] text-[#8B9EB0]">{domain}</span>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-3 right-3 font-jetbrains text-[9px] text-[#4A6072]">
        drag · scroll to zoom · click to select
      </div>
    </div>
  )
}
