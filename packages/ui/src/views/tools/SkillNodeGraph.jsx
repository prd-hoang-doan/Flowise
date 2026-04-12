import { useMemo, useCallback } from 'react'
import ReactFlow, { Controls, Background, MiniMap, useNodesState, useEdgesState, MarkerType, Handle, Position } from 'reactflow'
import 'reactflow/dist/style.css'
import { Box, Typography, Chip } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// ─── Node Type Colors ────────────────────────────────────────────

const TYPE_COLORS = {
    role: '#9c27b0',
    rule: '#f44336',
    behavior: '#2196f3',
    knowledge: '#4caf50',
    asset: '#ff9800'
}

const TYPE_LABELS = {
    role: 'Role',
    rule: 'Rule',
    behavior: 'Instruction',
    knowledge: 'Knowledge',
    asset: 'Asset'
}

// ─── Custom Node Component ───────────────────────────────────────

const SkillGraphNode = ({ data }) => {
    const theme = useTheme()
    const color = TYPE_COLORS[data.type] || '#999'
    const isDark = theme.palette.mode === 'dark'

    return (
        <Box
            sx={{
                border: `2px solid ${color}`,
                borderRadius: 2,
                bgcolor: isDark ? '#1e1e1e' : '#fff',
                width: 240,
                overflow: 'hidden',
                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
                cursor: 'grab',
                position: 'relative'
            }}
        >
            <Handle type='target' position={Position.Left} style={{ background: color, width: 8, height: 8 }} />
            <Handle type='source' position={Position.Right} style={{ background: color, width: 8, height: 8 }} />
            {/* Header */}
            <Box
                sx={{
                    px: 1.25,
                    py: 0.5,
                    bgcolor: color,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75
                }}
            >
                <Typography variant='caption' sx={{ color: '#fff', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6rem' }}>
                    {TYPE_LABELS[data.type] || data.type}
                </Typography>
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.6rem', fontFamily: 'monospace' }}>
                    P:{data.priority}
                </Typography>
                {data.cluster && (
                    <Typography
                        variant='caption'
                        sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.55rem', ml: 'auto', fontStyle: 'italic' }}
                    >
                        {data.cluster}
                    </Typography>
                )}
            </Box>

            {/* Body */}
            <Box sx={{ px: 1.25, py: 1 }}>
                <Typography
                    variant='caption'
                    sx={{
                        fontWeight: 600,
                        display: 'block',
                        mb: 0.25,
                        fontSize: '0.7rem',
                        lineHeight: 1.3,
                        color: theme.palette.text.primary
                    }}
                >
                    {data.title}
                </Typography>
                <Typography
                    variant='caption'
                    sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.65rem',
                        lineHeight: 1.4,
                        color: theme.palette.text.secondary,
                        wordBreak: 'break-word'
                    }}
                >
                    {data.content}
                </Typography>

                {/* Triggers */}
                {data.triggers?.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.5 }}>
                        {data.triggers.slice(0, 4).map((t, i) => (
                            <Chip
                                key={i}
                                label={t}
                                size='small'
                                sx={{
                                    height: 14,
                                    fontSize: '0.5rem',
                                    bgcolor: color + '18',
                                    color: color,
                                    border: `1px solid ${color}30`,
                                    '& .MuiChip-label': { px: 0.5 }
                                }}
                            />
                        ))}
                        {data.triggers.length > 4 && (
                            <Typography variant='caption' sx={{ fontSize: '0.5rem', color: theme.palette.text.disabled }}>
                                +{data.triggers.length - 4}
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    )
}

const nodeTypes = { skillNode: SkillGraphNode }

// ─── Layout Helpers ──────────────────────────────────────────────

const TYPE_ORDER = ['role', 'rule', 'behavior', 'knowledge', 'asset']

const NODE_WIDTH = 260
const NODE_HEIGHT = 140
const COLUMN_GAP = 80
const ROW_GAP = 30
const HEADER_HEIGHT = 40

/**
 * Simple grouped layout: nodes are arranged in columns by type,
 * ordered left-to-right: role → rule → behavior → knowledge → asset
 */
function layoutNodes(skillNodes) {
    const groups = {}
    for (const type of TYPE_ORDER) {
        groups[type] = skillNodes.filter((n) => n.type === type)
    }

    const flowNodes = []
    let colX = 0

    for (const type of TYPE_ORDER) {
        const typeNodes = groups[type]
        if (!typeNodes || typeNodes.length === 0) continue

        const color = TYPE_COLORS[type] || '#999'

        // Column header (group label node)
        flowNodes.push({
            id: `header-${type}`,
            type: 'default',
            position: { x: colX + NODE_WIDTH / 2 - 40, y: 0 },
            data: { label: `${TYPE_LABELS[type] || type} (${typeNodes.length})` },
            selectable: false,
            draggable: false,
            style: {
                background: 'transparent',
                border: 'none',
                color: color,
                fontWeight: 700,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                width: 'auto',
                padding: 0,
                boxShadow: 'none'
            }
        })

        // Nodes in this column
        for (let i = 0; i < typeNodes.length; i++) {
            const node = typeNodes[i]
            let triggers = []
            try {
                triggers = node.triggers ? JSON.parse(node.triggers) : []
            } catch {
                triggers = []
            }

            flowNodes.push({
                id: node.id,
                type: 'skillNode',
                position: {
                    x: colX,
                    y: HEADER_HEIGHT + i * (NODE_HEIGHT + ROW_GAP)
                },
                data: {
                    ...node,
                    triggers
                }
            })
        }

        colX += NODE_WIDTH + COLUMN_GAP
    }

    return flowNodes
}

function layoutEdges(skillEdges) {
    return skillEdges.map((edge) => ({
        id: edge.id,
        source: edge.fromNodeId,
        target: edge.toNodeId,
        label: edge.relation,
        type: 'smoothstep',
        animated: edge.relation === 'supports',
        style: {
            stroke: edge.relation === 'supports' ? '#4caf50' : edge.relation === 'extends' ? '#ff9800' : '#999',
            strokeWidth: 1.5
        },
        labelStyle: {
            fontSize: '0.6rem',
            fontWeight: 500,
            fill: '#888'
        },
        labelBgStyle: {
            fill: 'transparent'
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: edge.relation === 'supports' ? '#4caf50' : edge.relation === 'extends' ? '#ff9800' : '#999'
        }
    }))
}

// ─── Main Component ──────────────────────────────────────────────

const SkillNodeGraph = ({ nodes: skillNodes, edges: skillEdges }) => {
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'

    const initialNodes = useMemo(() => layoutNodes(skillNodes), [skillNodes])
    const initialEdges = useMemo(() => layoutEdges(skillEdges), [skillEdges])

    const [rfNodes, , onNodesChange] = useNodesState(initialNodes)
    const [rfEdges, , onEdgesChange] = useEdgesState(initialEdges)

    const minimapNodeColor = useCallback((node) => {
        if (node.type === 'skillNode') return TYPE_COLORS[node.data?.type] || '#999'
        return 'transparent'
    }, [])

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                '& .react-flow__node-default': {
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.7rem'
                }
            }}
        >
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                defaultEdgeOptions={{
                    type: 'smoothstep'
                }}
            >
                <Controls
                    position='bottom-right'
                    style={{
                        borderRadius: 8,
                        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                />
                <Background color={isDark ? '#333' : '#ddd'} gap={20} size={1} />
                <MiniMap
                    nodeColor={minimapNodeColor}
                    nodeStrokeWidth={2}
                    zoomable
                    pannable
                    style={{
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: isDark ? '#1a1a1a' : '#f5f5f5'
                    }}
                />
            </ReactFlow>
        </Box>
    )
}

export default SkillNodeGraph
