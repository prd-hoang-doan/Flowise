import PropTypes from 'prop-types'
import { forwardRef } from 'react'

import { Box, Typography } from '@mui/material'

import { classifyKind, isImage, isPdf, isVideo } from '../utils/extUtils'
import SkillV2BinaryViewer from './SkillV2BinaryViewer'
import SkillV2CodeEditor from './SkillV2CodeEditor'
import SkillV2MarkdownEditor from './SkillV2MarkdownEditor'
import SkillV2MediaViewer from './SkillV2MediaViewer'
import SkillV2PdfViewer from './SkillV2PdfViewer'

// Picks the correct editor/viewer for a file node based on its extension.
// Folders and the root pseudo-node are handled by the orchestrator and never
// reach this component.
const SkillV2ContentRouter = forwardRef(
    ({ node, content, onChange, onBlur, disabled, fetchBlob, onRequestInsertFile, onRequestInsertTool, resolveFileName }, ref) => {
        if (!node) {
            return (
                <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', p: 3 }}>
                    <Typography variant='body2' color='text.secondary'>
                        Select a file in the tree to start editing.
                    </Typography>
                </Box>
            )
        }

        const kind = classifyKind(node.extension)

        if (kind === 'skill') {
            return (
                <SkillV2MarkdownEditor
                    ref={ref}
                    value={content}
                    onChange={onChange}
                    onBlur={onBlur}
                    disabled={disabled}
                    placeholder='Write your skill instructions in Markdown. Use the File / Tool buttons above to insert {{skill.*}} or {{tool.*}} references.'
                    onRequestInsertFile={onRequestInsertFile}
                    onRequestInsertTool={onRequestInsertTool}
                    resolveFileName={resolveFileName}
                />
            )
        }

        if (kind === 'code' || kind === 'data') {
            return (
                <SkillV2CodeEditor
                    value={content}
                    onChange={onChange}
                    onBlur={onBlur}
                    disabled={disabled}
                    placeholder={`Edit ${node.extension || 'file'} contents`}
                />
            )
        }

        if (isPdf(node.extension)) {
            return <SkillV2PdfViewer node={node} fetchBlob={fetchBlob} />
        }

        if (isImage(node.extension) || isVideo(node.extension)) {
            return <SkillV2MediaViewer node={node} fetchBlob={fetchBlob} />
        }

        return <SkillV2BinaryViewer node={node} fetchBlob={fetchBlob} />
    }
)

SkillV2ContentRouter.displayName = 'SkillV2ContentRouter'
SkillV2ContentRouter.propTypes = {
    node: PropTypes.object,
    content: PropTypes.string,
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    disabled: PropTypes.bool,
    fetchBlob: PropTypes.func,
    onRequestInsertFile: PropTypes.func,
    onRequestInsertTool: PropTypes.func,
    resolveFileName: PropTypes.func
}

export default SkillV2ContentRouter
