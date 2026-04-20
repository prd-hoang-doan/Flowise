import PropTypes from 'prop-types'
import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'

import { Alert, Box, ButtonGroup, Skeleton, Stack } from '@mui/material'
import { IconPlus } from '@tabler/icons-react'

import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import { gridSpacing } from '@/store/constant'
import ToolEmptySVG from '@/assets/images/tools_empty.svg'

import skillsV2Api from '@/api/skillsv2'

import SkillV2Card from './SkillV2Card'
import SkillV2CreateDialog from './SkillV2CreateDialog'
import SkillV2EditorDrawer from './SkillV2EditorDrawer'

const filterSkills = (search) => (s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.slug || '').toLowerCase().includes(q)
    )
}

// Tab body shown under the `Skills V2` tab in the Tools view. Renders the
// list of workspace-scoped SkillV2 rows as cards, and hosts the Create /
// Edit dialog + full-screen editor drawer.
const SkillV2Workspace = ({ search }) => {
    const user = useSelector((state) => state.auth.user)
    const workspaceId = user?.activeWorkspaceId || ''

    const [skills, setSkills] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [createOpen, setCreateOpen] = useState(false)
    const [createProps, setCreateProps] = useState({ type: 'ADD' })
    const [editorOpen, setEditorOpen] = useState(false)
    const [editorSkillId, setEditorSkillId] = useState(null)

    const refresh = useCallback(async () => {
        if (!workspaceId) return
        setLoading(true)
        setError('')
        try {
            const resp = await skillsV2Api.listSkills(workspaceId)
            // The list endpoint returns an array when no pagination params.
            const data = Array.isArray(resp.data) ? resp.data : resp.data?.data || []
            setSkills(data)
        } catch (err) {
            const msg = typeof err?.response?.data === 'object' ? err.response.data.message : err?.response?.data || err?.message
            setError(msg || 'Failed to load skills')
        } finally {
            setLoading(false)
        }
    }, [workspaceId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const onCreate = () => {
        setCreateProps({ type: 'ADD', workspaceId })
        setCreateOpen(true)
    }

    const onOpen = (skill) => {
        setEditorSkillId(skill.id)
        setEditorOpen(true)
    }

    const visible = skills.filter(filterSkills(search))

    if (!workspaceId) {
        return (
            <Alert severity='warning' sx={{ my: 2 }}>
                You must belong to an active workspace to manage skills.
            </Alert>
        )
    }

    return (
        <>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
                <ButtonGroup disableElevation>
                    <StyledPermissionButton
                        permissionId='tools:create'
                        variant='contained'
                        onClick={onCreate}
                        startIcon={<IconPlus />}
                        sx={{ borderRadius: 2, height: 40 }}
                    >
                        Create Skill V2
                    </StyledPermissionButton>
                </ButtonGroup>
            </Box>

            {error && (
                <Alert severity='error' sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {loading && (
                <Box display='grid' gridTemplateColumns='repeat(3, 1fr)' gap={gridSpacing}>
                    <Skeleton variant='rounded' height={160} />
                    <Skeleton variant='rounded' height={160} />
                    <Skeleton variant='rounded' height={160} />
                </Box>
            )}

            {!loading && visible.length > 0 && (
                <Box display='grid' gridTemplateColumns='repeat(3, 1fr)' gap={gridSpacing}>
                    {visible.map((s) => (
                        <SkillV2Card key={s.id} data={s} onClick={() => onOpen(s)} />
                    ))}
                </Box>
            )}

            {!loading && visible.length === 0 && (
                <Stack sx={{ alignItems: 'center', justifyContent: 'center' }} flexDirection='column'>
                    <Box sx={{ p: 2, height: 'auto' }}>
                        <img style={{ objectFit: 'cover', height: '20vh', width: 'auto' }} src={ToolEmptySVG} alt='ToolEmptySVG' />
                    </Box>
                    <div>{search ? 'No skills match your search.' : 'No Skills V2 created yet.'}</div>
                </Stack>
            )}

            <SkillV2CreateDialog
                show={createOpen}
                dialogProps={createProps}
                onCancel={() => setCreateOpen(false)}
                onConfirm={(created) => {
                    setCreateOpen(false)
                    if (created?.id) {
                        refresh()
                        setEditorSkillId(created.id)
                        setEditorOpen(true)
                    } else {
                        refresh()
                    }
                }}
            />

            <SkillV2EditorDrawer
                open={editorOpen}
                workspaceId={workspaceId}
                skillId={editorSkillId}
                onClose={() => {
                    setEditorOpen(false)
                    setEditorSkillId(null)
                    refresh()
                }}
            />

            <ConfirmDialog />
        </>
    )
}

SkillV2Workspace.propTypes = {
    search: PropTypes.string
}

export default SkillV2Workspace
