import PropTypes from 'prop-types'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { alpha } from '@mui/material/styles'
import { Box, Button, Divider, Stack, Tooltip } from '@mui/material'
import { IconBracketsContain, IconEye, IconEyeOff, IconIndentIncrease, IconLink } from '@tabler/icons-react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

import { SKILL_PLACEHOLDER_RE, TOOL_PLACEHOLDER_RE, buildSkillRef } from '../utils/placeholderUtils'

const SKILLV2_FILE_REF_MIME = 'text/skillv2-file-ref'

const SEG_TEXT = 'text'
const SEG_SKILL = 'skill'
const SEG_TOOL = 'tool'

// Split raw editor text into ordered segments of plain text and placeholder
// matches. Placeholders are preserved verbatim (including the outer `{{…}}`)
// on the segment under `raw` so the renderer can stamp them onto chip nodes
// and the serializer can reproduce them byte-for-byte.
const segmentText = (text) => {
    if (!text) return []
    const matches = []
    SKILL_PLACEHOLDER_RE.lastIndex = 0
    let m
    while ((m = SKILL_PLACEHOLDER_RE.exec(text)) !== null) {
        matches.push({ kind: SEG_SKILL, start: m.index, end: m.index + m[0].length, raw: m[0], nodeId: m[1] })
    }
    TOOL_PLACEHOLDER_RE.lastIndex = 0
    while ((m = TOOL_PLACEHOLDER_RE.exec(text)) !== null) {
        matches.push({ kind: SEG_TOOL, start: m.index, end: m.index + m[0].length, raw: m[0], target: m[1] })
    }
    matches.sort((a, b) => a.start - b.start)
    const out = []
    let cursor = 0
    for (const match of matches) {
        // Defensive: skip any placeholder that overlaps a previous one.
        // Not expected with the current grammar, but keeps segmentation safe.
        if (match.start < cursor) continue
        if (match.start > cursor) out.push({ kind: SEG_TEXT, text: text.slice(cursor, match.start) })
        out.push(match)
        cursor = match.end
    }
    if (cursor < text.length) out.push({ kind: SEG_TEXT, text: text.slice(cursor) })
    return out
}

// Canonical tool grammar is `provider.toolName.uuid`. Pick the middle part so
// chips show a human-readable toolName. Anything else collapses to the raw
// target, which at least renders something.
const toolDisplayLabel = (target) => {
    const parts = (target || '').split('.')
    if (parts.length >= 3) return parts[1]
    if (parts.length === 2) return parts[1]
    return target || 'tool'
}

const skillDisplayLabel = (nodeId, resolveFileName) => {
    const resolved = resolveFileName && resolveFileName(nodeId)
    if (resolved) return resolved
    // Fallback: first octet of the UUID so unresolved chips never render
    // empty. The raw placeholder is still available on the tooltip.
    return nodeId ? `skill.${String(nodeId).slice(0, 8)}` : 'skill'
}

const makeChipNode = (segment, resolveFileName) => {
    const span = document.createElement('span')
    span.setAttribute('contenteditable', 'false')
    span.dataset.placeholder = segment.raw
    span.dataset.kind = segment.kind
    span.className = `skillv2-chip skillv2-chip-${segment.kind}`
    span.title = segment.raw
    span.textContent = segment.kind === SEG_SKILL ? skillDisplayLabel(segment.nodeId, resolveFileName) : toolDisplayLabel(segment.target)
    return span
}

// Append a run of text to `parent`, splitting on `\n` into text nodes
// separated by `<br>` so newlines render predictably regardless of CSS
// white-space handling.
const appendTextTo = (parent, text) => {
    if (!text) return
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].length > 0) parent.appendChild(document.createTextNode(parts[i]))
        if (i < parts.length - 1) parent.appendChild(document.createElement('br'))
    }
}

const renderValueTo = (element, value, resolveFileName) => {
    while (element.firstChild) element.removeChild(element.firstChild)
    const segments = segmentText(value || '')
    for (const seg of segments) {
        if (seg.kind === SEG_TEXT) appendTextTo(element, seg.text)
        else element.appendChild(makeChipNode(seg, resolveFileName))
    }
}

// Serialize a DOM subtree back to raw text. Chips are emitted as their
// original `{{…}}` placeholder (stashed on `data-placeholder`) and `<br>`
// becomes `\n`. This is the inverse of `renderValueTo`.
const serializeElement = (element) => {
    let out = ''
    const walk = (node) => {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                out += child.nodeValue || ''
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.dataset && child.dataset.placeholder) {
                    out += child.dataset.placeholder
                } else if (child.tagName === 'BR') {
                    out += '\n'
                } else {
                    walk(child)
                }
            }
        }
    }
    walk(element)
    return out
}

const placeCaretAfter = (node) => {
    if (!node) return
    const range = document.createRange()
    range.setStartAfter(node)
    range.collapse(true)
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(range)
}

// Contenteditable-backed Markdown editor. We intentionally avoid TipTap
// (v1 skills) because rich-text models are brittle around `{{skill.*}}` /
// `{{tool.*}}` placeholders. Instead, the model stays raw text: placeholders
// are rendered as atomic `contenteditable="false"` chips with the raw token
// stashed on `data-placeholder`, and `serializeElement` turns the DOM back
// into raw text 1:1 for the parent's `onChange` contract.
//
// `onRequestInsertFile` / `onRequestInsertTool` expose placeholder-insertion
// hooks to the parent. They are invoked when the user clicks the toolbar
// buttons; the parent resolves the target (file / tool) and calls
// `insertAtCursor(text)` via the forwarded ref.
const SkillV2MarkdownEditor = forwardRef(
    ({ value, onChange, onBlur, disabled, placeholder, onRequestInsertFile, onRequestInsertTool, resolveFileName }, ref) => {
        const editorRef = useRef(null)
        const [showPreview, setShowPreview] = useState(false)
        const [isDragOver, setIsDragOver] = useState(false)

        // Flag that the next `value`-driven useEffect run was caused by our
        // own onInput cascade, in which case the DOM is already correct and
        // re-rendering it would destroy the caret.
        const internalChangeRef = useRef(false)

        // `resolveFileName` may change identity on every parent render; keep
        // the latest in a ref so chip rendering sees fresh names without
        // making `value` effects depend on the function's identity.
        const resolveRef = useRef(resolveFileName)
        resolveRef.current = resolveFileName

        const emitChange = useCallback(() => {
            const el = editorRef.current
            if (!el) return
            const text = serializeElement(el)
            // When the user empties the editor, Chrome/Safari leave a
            // lingering <br> so the caret stays visible. Strip it so the
            // `:empty` placeholder rule matches again and the user sees the
            // hint text instead of a blank box.
            if (text === '' && el.childNodes.length > 0) {
                while (el.firstChild) el.removeChild(el.firstChild)
            }
            internalChangeRef.current = true
            onChange?.(text)
        }, [onChange])

        // Render on mount and whenever `value` changes externally (new file
        // loaded, undo from parent, etc.). Skip the render when the change
        // was echoed from our own onInput — the DOM already reflects it and
        // re-rendering would drop the caret mid-keystroke.
        useEffect(() => {
            const el = editorRef.current
            if (!el) return
            if (showPreview) return
            if (internalChangeRef.current) {
                internalChangeRef.current = false
                return
            }
            renderValueTo(el, value || '', resolveRef.current)
        }, [value, showPreview])

        // When the resolver changes (e.g. the workspace tree reloaded and a
        // referenced file was renamed), refresh chip labels — but only when
        // the editor is not focused, so we don't interrupt typing.
        useEffect(() => {
            const el = editorRef.current
            if (!el) return
            if (showPreview) return
            if (document.activeElement === el) return
            renderValueTo(el, value || '', resolveFileName)
            // `value` is intentionally omitted: we only want to re-render on
            // resolver identity changes here, not on plain value changes
            // (those are handled by the effect above).
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [resolveFileName])

        const insertAtCursor = useCallback(
            (text) => {
                const el = editorRef.current
                if (!el || !text) return
                if (document.activeElement !== el) el.focus()
                const sel = window.getSelection()
                let range
                if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
                    range = sel.getRangeAt(0)
                    range.deleteContents()
                } else {
                    range = document.createRange()
                    range.selectNodeContents(el)
                    range.collapse(false)
                }
                const fragment = document.createDocumentFragment()
                const segments = segmentText(text)
                for (const seg of segments) {
                    if (seg.kind === SEG_TEXT) appendTextTo(fragment, seg.text)
                    else fragment.appendChild(makeChipNode(seg, resolveRef.current))
                }
                const lastChild = fragment.lastChild
                range.insertNode(fragment)
                placeCaretAfter(lastChild)
                emitChange()
            },
            [emitChange]
        )

        useImperativeHandle(ref, () => ({ insertAtCursor }), [insertAtCursor])

        // Chromium exposes dataTransfer.types as a DOMStringList; Firefox as
        // an array. Iterate by index to work with both.
        const dragHasFileRef = (e) => {
            const types = e.dataTransfer && e.dataTransfer.types
            if (!types) return false
            for (let i = 0; i < types.length; i += 1) {
                if (types[i] === SKILLV2_FILE_REF_MIME) return true
            }
            return false
        }

        const handleDragOver = useCallback(
            (e) => {
                if (disabled) return
                if (!dragHasFileRef(e)) return
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
                setIsDragOver(true)
            },
            [disabled]
        )

        const handleDragLeave = useCallback((e) => {
            // `dragleave` fires as the pointer crosses into child elements
            // (chips, <br>s). Only clear when actually leaving the editor.
            if (e.target === e.currentTarget) setIsDragOver(false)
        }, [])

        const handleDrop = useCallback(
            (e) => {
                if (disabled) return
                if (!dragHasFileRef(e)) return
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(false)
                const nodeId = e.dataTransfer.getData(SKILLV2_FILE_REF_MIME)
                if (!nodeId) return
                const el = editorRef.current
                if (el) {
                    el.focus()
                    const sel = window.getSelection()
                    // Best-effort: seat the caret where the drop occurred.
                    // `caretPositionFromPoint` is Firefox/Chrome 128+;
                    // `caretRangeFromPoint` is the WebKit equivalent.
                    if (sel && typeof document.caretPositionFromPoint === 'function') {
                        const pos = document.caretPositionFromPoint(e.clientX, e.clientY)
                        if (pos && pos.offsetNode && el.contains(pos.offsetNode)) {
                            try {
                                const range = document.createRange()
                                range.setStart(pos.offsetNode, pos.offset)
                                range.collapse(true)
                                sel.removeAllRanges()
                                sel.addRange(range)
                            } catch (_) {
                                /* offset out of range — fall back to current selection */
                            }
                        }
                    } else if (sel && typeof document.caretRangeFromPoint === 'function') {
                        const range = document.caretRangeFromPoint(e.clientX, e.clientY)
                        if (range && el.contains(range.startContainer)) {
                            sel.removeAllRanges()
                            sel.addRange(range)
                        }
                    }
                }
                insertAtCursor(buildSkillRef(nodeId))
            },
            [disabled, insertAtCursor]
        )

        const handlePaste = useCallback(
            (e) => {
                // Always paste as plain text. This lets us re-parse any
                // pasted placeholder syntax into chips and also prevents the
                // browser from smuggling formatting HTML into the editor.
                e.preventDefault()
                const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''
                if (text) insertAtCursor(text)
            },
            [insertAtCursor]
        )

        // Copy/cut: serialize the selection back to raw text so chips round-
        // trip as `{{…}}` instead of their display label.
        const copySelectionAsRaw = (e) => {
            const sel = window.getSelection()
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
            const range = sel.getRangeAt(0)
            const el = editorRef.current
            if (!el || !el.contains(range.commonAncestorContainer)) return null
            const tmp = document.createElement('div')
            tmp.appendChild(range.cloneContents())
            const text = serializeElement(tmp)
            if (!text) return null
            e.clipboardData?.setData('text/plain', text)
            e.preventDefault()
            return range
        }

        const handleCopy = (e) => {
            copySelectionAsRaw(e)
        }

        const handleCut = (e) => {
            const range = copySelectionAsRaw(e)
            if (!range) return
            range.deleteContents()
            emitChange()
        }

        const handleKeyDown = (e) => {
            // Neutralise browser rich-text shortcuts. Plain Markdown editing
            // has no concept of bold/italic/underline — we want the user's
            // Cmd+B to be a no-op, not to wrap their selection in <b>.
            if ((e.metaKey || e.ctrlKey) && !e.altKey) {
                const k = e.key.toLowerCase()
                if (k === 'b' || k === 'i' || k === 'u') {
                    e.preventDefault()
                    return
                }
            }
            if (e.key === 'Enter') {
                // Insert a <br> on both Enter and Shift+Enter so serialization
                // consistently yields `\n`. Without this, Chrome wraps each
                // line in a <div>, producing nested blocks we'd rather avoid.
                e.preventDefault()
                document.execCommand('insertLineBreak')
            }
        }

        const handleInput = () => {
            emitChange()
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}>
                <Stack direction='row' spacing={0.5} alignItems='center' sx={{ px: 1, py: 0.5 }}>
                    <Tooltip title='Insert file reference — {{skill.<fileId>}}'>
                        <span>
                            <Button
                                size='small'
                                variant='text'
                                disabled={disabled || !onRequestInsertFile}
                                startIcon={<IconLink size={14} />}
                                onClick={() => onRequestInsertFile?.(insertAtCursor)}
                                sx={{ textTransform: 'none' }}
                            >
                                File ref
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title='Insert tool reference — {{tool.<provider>.<name>.<uuid>}}'>
                        <span>
                            <Button
                                size='small'
                                variant='text'
                                disabled={disabled || !onRequestInsertTool}
                                startIcon={<IconBracketsContain size={14} />}
                                onClick={() => onRequestInsertTool?.(insertAtCursor)}
                                sx={{ textTransform: 'none' }}
                            >
                                Tool ref
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title='Insert code block'>
                        <span>
                            <Button
                                size='small'
                                variant='text'
                                disabled={disabled}
                                startIcon={<IconIndentIncrease size={14} />}
                                onClick={() => insertAtCursor('\n```\n\n```\n')}
                                sx={{ textTransform: 'none' }}
                            >
                                Code
                            </Button>
                        </span>
                    </Tooltip>
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title={showPreview ? 'Show source' : 'Preview rendered markdown'}>
                        <Button
                            size='small'
                            variant='text'
                            startIcon={showPreview ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                            onClick={() => setShowPreview((v) => !v)}
                            sx={{ textTransform: 'none' }}
                        >
                            {showPreview ? 'Edit' : 'Preview'}
                        </Button>
                    </Tooltip>
                </Stack>
                <Divider />
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    {showPreview ? (
                        <Box
                            className='skillv2-md-preview'
                            sx={{
                                flex: 1,
                                overflow: 'auto',
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
                                {value || ''}
                            </ReactMarkdown>
                        </Box>
                    ) : (
                        <Box
                            ref={editorRef}
                            contentEditable={!disabled}
                            suppressContentEditableWarning
                            spellCheck={false}
                            data-placeholder={placeholder || ''}
                            onInput={handleInput}
                            onBlur={onBlur}
                            onPaste={handlePaste}
                            onCopy={handleCopy}
                            onCut={handleCut}
                            onKeyDown={handleKeyDown}
                            onDragOver={handleDragOver}
                            onDragEnter={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: 'auto',
                                p: 2,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                fontSize: '0.875rem',
                                lineHeight: 1.7,
                                background: 'transparent',
                                color: 'text.primary',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                outline: 'none',
                                opacity: disabled ? 0.65 : 1,
                                boxShadow: isDragOver ? (t) => `inset 0 0 0 2px ${t.palette.primary.main}` : 'none',
                                transition: 'box-shadow 0.12s ease-in-out',
                                '&:empty:before': {
                                    content: 'attr(data-placeholder)',
                                    color: 'text.disabled',
                                    pointerEvents: 'none',
                                    whiteSpace: 'pre-wrap'
                                },
                                '& .skillv2-chip': {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    px: 0.75,
                                    py: '1px',
                                    mx: '1px',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontFamily:
                                        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                    fontWeight: 500,
                                    lineHeight: 1.3,
                                    userSelect: 'none',
                                    cursor: 'default',
                                    border: '1px solid',
                                    verticalAlign: 'baseline',
                                    whiteSpace: 'nowrap'
                                },
                                '& .skillv2-chip-skill': {
                                    backgroundColor: (t) => alpha(t.palette.primary.main, 0.12),
                                    borderColor: (t) => alpha(t.palette.primary.main, 0.4),
                                    color: 'primary.main'
                                },
                                '& .skillv2-chip-tool': {
                                    backgroundColor: (t) => alpha(t.palette.warning.main, 0.14),
                                    borderColor: (t) => alpha(t.palette.warning.main, 0.45),
                                    color: (t) => (t.palette.mode === 'dark' ? t.palette.warning.light : t.palette.warning.dark)
                                }
                            }}
                        />
                    )}
                </Box>
            </Box>
        )
    }
)

SkillV2MarkdownEditor.displayName = 'SkillV2MarkdownEditor'
SkillV2MarkdownEditor.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    disabled: PropTypes.bool,
    placeholder: PropTypes.string,
    onRequestInsertFile: PropTypes.func,
    onRequestInsertTool: PropTypes.func,
    resolveFileName: PropTypes.func
}

export default SkillV2MarkdownEditor
