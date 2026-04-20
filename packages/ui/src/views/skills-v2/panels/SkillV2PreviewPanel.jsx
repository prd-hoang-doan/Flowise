import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { IconRefresh } from '@tabler/icons-react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

import skillsV2Api from '@/api/skillsv2'

import { BROKEN_REF_MARKER } from '../constants'

// Renders the *compiled* draft bundle for the currently-selected skill node.
// Calls GET /bundle?mode=draft on demand — there is no local compiler.
const SkillV2PreviewPanel = ({ workspaceId, skillId, selectedNodeId }) => {
    const [loading, setLoading] = useState(false)
    const [bundle, setBundle] = useState(null)
    const [error, setError] = useState('')

    const reload = async () => {
        if (!workspaceId || !skillId) return
        setLoading(true)
        setError('')
        try {
            const resp = await skillsV2Api.getBundle(workspaceId, skillId, 'draft')
            setBundle(resp.data)
        } catch (err) {
            const msg = typeof err?.response?.data === 'object' ? err.response.data.message : err?.response?.data || err?.message
            setError(msg || 'Failed to compile draft bundle')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, skillId])

    const entry = bundle && selectedNodeId ? bundle.entries?.[selectedNodeId] : null
    const firstSkillEntry = !entry && bundle ? Object.values(bundle.entries || {}).find((e) => e.kind === 'skill') : null
    const displayEntry = entry || firstSkillEntry

    const brokenCount = displayEntry?.content
        ? (displayEntry.content.match(new RegExp(BROKEN_REF_MARKER.replace(/[[\]]/g, '\\$&'), 'g')) || []).length
        : 0

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Stack direction='row' spacing={1} alignItems='center' sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant='subtitle2' sx={{ flex: 1 }}>
                    Compiled preview (draft)
                </Typography>
                <Button
                    size='small'
                    variant='text'
                    startIcon={loading ? <CircularProgress size={12} /> : <IconRefresh size={14} />}
                    onClick={reload}
                    disabled={loading}
                    sx={{ textTransform: 'none' }}
                >
                    Recompile
                </Button>
            </Stack>
            {error ? (
                <Alert severity='error' sx={{ m: 2 }}>
                    {error}
                </Alert>
            ) : loading && !displayEntry ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <CircularProgress size={20} />
                </Box>
            ) : !displayEntry ? (
                <Box sx={{ p: 3 }}>
                    <Typography variant='body2' color='text.secondary'>
                        Nothing to preview yet. Select a markdown file or add content to the skill.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {brokenCount > 0 && (
                        <Alert severity='warning' sx={{ m: 2 }}>
                            {brokenCount} unresolved reference{brokenCount === 1 ? '' : 's'} in this node. The compiler replaced them with{' '}
                            <code>{BROKEN_REF_MARKER}</code>.
                        </Alert>
                    )}
                    <Box sx={{ px: 2, pt: 1 }}>
                        <Typography variant='caption' color='text.secondary'>
                            {displayEntry.path}
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            p: 3,
                            '& pre': {
                                background: (t) => (t.palette.mode === 'dark' ? '#1e1e1e' : '#f7f7f7'),
                                p: 1.5,
                                borderRadius: 1,
                                overflowX: 'auto'
                            },
                            '& code': { fontFamily: 'monospace', fontSize: '0.875rem' },
                            '& table': { borderCollapse: 'collapse', width: '100%' },
                            '& th, & td': { border: '1px solid', borderColor: 'divider', p: 1 }
                        }}
                    >
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {displayEntry.content || ''}
                        </ReactMarkdown>
                    </Box>
                </Box>
            )}
        </Box>
    )
}

SkillV2PreviewPanel.propTypes = {
    workspaceId: PropTypes.string,
    skillId: PropTypes.string,
    selectedNodeId: PropTypes.string
}

export default SkillV2PreviewPanel
