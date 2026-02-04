import { useState } from 'react'
import { useSelector } from 'react-redux'
import PropTypes from 'prop-types'
import { cloneDeep } from 'lodash'
import axios from 'axios'
import {
    Box,
    Stack,
    Avatar,
    Typography,
    Paper,
    Skeleton,
    Chip,
    Card,
    CardMedia,
    Button,
    IconButton,
    CircularProgress,
    OutlinedInput
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
    IconRobot,
    IconUser,
    IconTool,
    IconDownload,
    IconPaperclip,
    IconCheck,
    IconX,
    IconVolume,
    IconCircleDot
} from '@tabler/icons-react'
import robotPNG from '@/assets/images/robot.png'
import userPNG from '@/assets/images/account.png'
import multiagent_supervisorPNG from '@/assets/images/multiagent_supervisor.png'
import multiagent_workerPNG from '@/assets/images/multiagent_worker.png'

// project import
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import { SafeHTML } from '@/ui-component/safe/SafeHTML'
import SourceDocDialog from '@/ui-component/dialog/SourceDocDialog'
import AgentReasoningCard from '../chatmessage/AgentReasoningCard'
import AgentExecutedDataCard from '../chatmessage/AgentExecutedDataCard'
import CopyToClipboardButton from '@/ui-component/button/CopyToClipboardButton'
import ThumbsUpButton from '@/ui-component/button/ThumbsUpButton'
import ThumbsDownButton from '@/ui-component/button/ThumbsDownButton'

// CSS
import '../chatmessage/ChatMessage.css'

// Const
import { baseURL } from '@/store/constant'

// Utils
import { isValidURL, removeDuplicateURL } from '@/utils/genericHelper'

const messageImageStyle = {
    width: '128px',
    height: '128px',
    objectFit: 'cover'
}

// ==============================|| MESSAGE LIST ||============================== //

const MessageList = ({ messages, isLoading, messagesEndRef, chatflowid, chatId, isDialog, onSourceDialogClick, onURLClick }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
    const [sourceDialogProps, setSourceDialogProps] = useState({})
    const [isTTSLoading, setIsTTSLoading] = useState({})
    const [isTTSPlaying, setIsTTSPlaying] = useState({})
    const [ttsAudio, setTtsAudio] = useState({})

    const chatFeedbackStatus = false // TODO: get from chatflow config
    const isTTSEnabled = false // TODO: get from chatflow config
    const loading = false // TODO: get from parent

    const handleSourceDialogClick = (data, title) => {
        setSourceDialogProps({ data, title })
        setSourceDialogOpen(true)
        if (onSourceDialogClick) onSourceDialogClick(data, title)
    }

    const handleURLClick = (data) => {
        window.open(data, '_blank')
        if (onURLClick) onURLClick(data)
    }

    const getLabel = (URL, source) => {
        if (URL && typeof URL === 'object') {
            if (URL.pathname && typeof URL.pathname === 'string') {
                if (URL.pathname.substring(0, 15) === '/') {
                    return URL.host || ''
                } else {
                    return `${URL.pathname.substring(0, 15)}...`
                }
            } else if (URL.host) {
                return URL.host
            }
        }

        if (source && source.pageContent && typeof source.pageContent === 'string') {
            return `${source.pageContent.substring(0, 15)}...`
        }

        return ''
    }

    const downloadFile = async (fileAnnotation) => {
        try {
            const response = await axios.post(
                `${baseURL}/api/v1/openai-assistants-file/download`,
                { fileName: fileAnnotation.fileName, chatflowId: chatflowid, chatId: chatId },
                { responseType: 'blob' }
            )
            const blob = new Blob([response.data], { type: response.headers['content-type'] })
            const downloadUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = fileAnnotation.fileName
            document.body.appendChild(link)
            link.click()
            link.remove()
        } catch (error) {
            console.error('Download failed:', error)
        }
    }

    const getAgentIcon = (nodeName, instructions) => {
        if (nodeName) {
            return `${baseURL}/api/v1/node-icon/${nodeName}`
        } else if (instructions) {
            return multiagent_supervisorPNG
        } else {
            return multiagent_workerPNG
        }
    }

    const renderFileUploads = (item, index) => {
        if (item?.mime?.startsWith('image/')) {
            return (
                <Card
                    key={index}
                    sx={{
                        p: 0,
                        m: 0,
                        maxWidth: 128,
                        marginRight: '10px',
                        flex: '0 0 auto'
                    }}
                >
                    <CardMedia component='img' image={item.data} sx={{ height: 64 }} alt={'preview'} style={messageImageStyle} />
                </Card>
            )
        } else if (item?.mime?.startsWith('audio/')) {
            return (
                /* eslint-disable jsx-a11y/media-has-caption */
                <audio controls='controls'>
                    Your browser does not support the &lt;audio&gt; tag.
                    <source src={item.data} type={item.mime} />
                </audio>
            )
        } else {
            return (
                <Card
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: '48px',
                        width: 'max-content',
                        p: 2,
                        mr: 1,
                        flex: '0 0 auto',
                        backgroundColor: customization.isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'transparent'
                    }}
                    variant='outlined'
                >
                    <IconPaperclip size={20} />
                    <span
                        style={{
                            marginLeft: '5px',
                            color: customization.isDarkMode ? 'white' : 'inherit'
                        }}
                    >
                        {item.name}
                    </span>
                </Card>
            )
        }
    }

    const agentReasoningArtifacts = (artifacts) => {
        const newArtifacts = cloneDeep(artifacts)
        for (let i = 0; i < newArtifacts.length; i++) {
            const artifact = newArtifacts[i]
            if (artifact && (artifact.type === 'png' || artifact.type === 'jpeg')) {
                const data = artifact.data
                newArtifacts[i].data = `${baseURL}/api/v1/get-upload-file?chatflowId=${chatflowid}&chatId=${chatId}&fileName=${data.replace(
                    'FILE-STORAGE::',
                    ''
                )}`
            }
        }
        return newArtifacts
    }

    const renderArtifacts = (item, index, isAgentReasoning) => {
        if (item.type === 'png' || item.type === 'jpeg') {
            return (
                <Card
                    key={index}
                    sx={{
                        p: 0,
                        m: 0,
                        mt: 2,
                        mb: 2,
                        flex: '0 0 auto'
                    }}
                >
                    <CardMedia
                        component='img'
                        image={item.data}
                        sx={{ height: 'auto' }}
                        alt={'artifact'}
                        style={{
                            width: isAgentReasoning ? '200px' : '100%',
                            height: isAgentReasoning ? '200px' : 'auto',
                            objectFit: 'cover'
                        }}
                    />
                </Card>
            )
        } else if (item.type === 'html') {
            return (
                <div style={{ marginTop: '20px' }}>
                    <SafeHTML html={item.data} />
                </div>
            )
        } else {
            return (
                <MemoizedReactMarkdown chatflowid={chatflowid} isFullWidth={isDialog}>
                    {item.data}
                </MemoizedReactMarkdown>
            )
        }
    }

    const copyMessageToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text || '')
        } catch (error) {
            console.error('Error copying to clipboard:', error)
        }
    }

    const onThumbsUpClick = async (messageId) => {
        // TODO: implement feedback API
        console.log('Thumbs up clicked for message:', messageId)
    }

    const onThumbsDownClick = async (messageId) => {
        // TODO: implement feedback API
        console.log('Thumbs down clicked for message:', messageId)
    }

    const handleTTSClick = async (messageId, messageText) => {
        // TODO: implement TTS
        console.log('TTS clicked for message:', messageId, messageText)
    }

    const handleTTSStop = async (messageId) => {
        // TODO: implement TTS stop
        console.log('TTS stop clicked for message:', messageId)
    }

    const handleActionClick = async (elem, action) => {
        // TODO: implement action handling
        console.log('Action clicked:', elem, action)
    }

    // Render single message
    const renderMessage = (message, index) => {
        const isUser = message.role === 'userMessage'

        return (
            <Box
                sx={{
                    background:
                        message.type === 'apiMessage' || message.type === 'leadCaptureMessage'
                            ? theme.palette.asyncSelect?.main || 'transparent'
                            : ''
                }}
                key={index}
                style={{ display: 'flex' }}
                className={
                    message.type === 'userMessage' && loading && index === messages.length - 1
                        ? customization.isDarkMode
                            ? 'usermessagewaiting-dark'
                            : 'usermessagewaiting-light'
                        : message.type === 'usermessagewaiting'
                        ? 'apimessage'
                        : 'usermessage'
                }
            >
                {/* Display the correct icon depending on the message type */}
                {message.type === 'apiMessage' || message.type === 'leadCaptureMessage' ? (
                    <img src={robotPNG} alt='AI' width='30' height='30' className='boticon' />
                ) : (
                    <img src={userPNG} alt='Me' width='30' height='30' className='usericon' />
                )}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%'
                    }}
                >
                    {message.fileUploads && message.fileUploads.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                flexDirection: 'column',
                                width: '100%',
                                gap: '8px'
                            }}
                        >
                            {message.fileUploads.map((item, index) => {
                                return <>{renderFileUploads(item, index)}</>
                            })}
                        </div>
                    )}
                    {message.agentReasoning && message.agentReasoning.length > 0 && (
                        <div style={{ display: 'block', flexDirection: 'row', width: '100%' }}>
                            {message.agentReasoning.map((agent, index) => (
                                <AgentReasoningCard
                                    key={index}
                                    agent={agent}
                                    index={index}
                                    customization={customization}
                                    chatflowid={chatflowid}
                                    isDialog={isDialog}
                                    onSourceDialogClick={handleSourceDialogClick}
                                    renderArtifacts={renderArtifacts}
                                    agentReasoningArtifacts={agentReasoningArtifacts}
                                    getAgentIcon={getAgentIcon}
                                    removeDuplicateURL={removeDuplicateURL}
                                    isValidURL={isValidURL}
                                    onURLClick={handleURLClick}
                                    getLabel={getLabel}
                                />
                            ))}
                        </div>
                    )}
                    {message.agentFlowExecutedData &&
                        Array.isArray(message.agentFlowExecutedData) &&
                        message.agentFlowExecutedData.length > 0 && (
                            <AgentExecutedDataCard
                                status={message.agentFlowEventStatus}
                                execution={message.agentFlowExecutedData}
                                agentflowId={chatflowid}
                                sessionId={chatId}
                            />
                        )}
                    {message.calledTools && (
                        <div
                            style={{
                                display: 'block',
                                flexDirection: 'row',
                                width: '100%'
                            }}
                        >
                            {message.calledTools.map((tool, index) => {
                                return tool ? (
                                    <Chip
                                        size='small'
                                        key={`called-${index}`}
                                        label={tool.tool}
                                        component='a'
                                        sx={{
                                            mr: 1,
                                            mt: 1,
                                            borderColor: 'primary.main',
                                            color: 'primary.main',
                                            backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                            opacity: 0.9,
                                            '&:hover': {
                                                backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                                opacity: 1
                                            }
                                        }}
                                        variant='outlined'
                                        clickable
                                        icon={<CircularProgress size={15} color='primary' />}
                                        onClick={() => handleSourceDialogClick(tool, 'Called Tools')}
                                    />
                                ) : null
                            })}
                        </div>
                    )}
                    {message.usedTools && (
                        <div
                            style={{
                                display: 'block',
                                flexDirection: 'row',
                                width: '100%'
                            }}
                        >
                            {message.usedTools.map((tool, index) => {
                                return tool ? (
                                    <Chip
                                        size='small'
                                        key={`used-${index}`}
                                        label={tool.tool}
                                        component='a'
                                        sx={{
                                            mr: 1,
                                            mt: 1,
                                            borderColor: tool.error ? 'error.main' : undefined,
                                            color: tool.error ? 'error.main' : undefined
                                        }}
                                        variant='outlined'
                                        clickable
                                        icon={<IconTool size={15} color={tool.error ? theme.palette.error.main : undefined} />}
                                        onClick={() => handleSourceDialogClick(tool, 'Used Tools')}
                                    />
                                ) : null
                            })}
                        </div>
                    )}
                    {message.artifacts && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                flexDirection: 'column',
                                width: '100%'
                            }}
                        >
                            {message.artifacts.map((item, index) => {
                                return item !== null ? <>{renderArtifacts(item, index)}</> : null
                            })}
                        </div>
                    )}
                    <div className='markdownanswer'>
                        {message.type === 'leadCaptureMessage' ? (
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                    marginTop: 2
                                }}
                            >
                                <Typography sx={{ lineHeight: '1.5rem', whiteSpace: 'pre-line' }}>
                                    {message.message || 'Lead capture message'}
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <MemoizedReactMarkdown chatflowid={chatflowid} isFullWidth={isDialog}>
                                    {message.message || message.content}
                                </MemoizedReactMarkdown>
                            </>
                        )}
                    </div>
                    {message.fileAnnotations && (
                        <div
                            style={{
                                display: 'block',
                                flexDirection: 'row',
                                width: '100%',
                                marginBottom: '8px'
                            }}
                        >
                            {message.fileAnnotations.map((fileAnnotation, index) => {
                                return (
                                    <Button
                                        sx={{
                                            fontSize: '0.85rem',
                                            textTransform: 'none',
                                            mb: 1
                                        }}
                                        key={index}
                                        variant='outlined'
                                        onClick={() => downloadFile(fileAnnotation)}
                                        endIcon={<IconDownload color={theme.palette.primary.main} />}
                                    >
                                        {fileAnnotation.fileName}
                                    </Button>
                                )
                            })}
                        </div>
                    )}
                    {message.sourceDocuments && (
                        <div
                            style={{
                                display: 'block',
                                flexDirection: 'row',
                                width: '100%',
                                marginBottom: '8px'
                            }}
                        >
                            {removeDuplicateURL(message).map((source, index) => {
                                const URL = source.metadata && source.metadata.source ? isValidURL(source.metadata.source) : undefined
                                return (
                                    <Chip
                                        size='small'
                                        key={index}
                                        label={getLabel(URL, source) || ''}
                                        component='a'
                                        sx={{ mr: 1, mb: 1 }}
                                        variant='outlined'
                                        clickable
                                        onClick={() => (URL ? handleURLClick(source.metadata.source) : handleSourceDialogClick(source))}
                                    />
                                )
                            })}
                        </div>
                    )}
                    {message.action && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                flexDirection: 'row',
                                width: '100%',
                                gap: '8px',
                                marginBottom: '8px'
                            }}
                        >
                            {(message.action.elements || []).map((elem, index) => {
                                return (
                                    <>
                                        {(elem.type === 'approve-button' && elem.label === 'Yes') ||
                                        elem.type === 'agentflowv2-approve-button' ? (
                                            <Button
                                                sx={{
                                                    width: 'max-content',
                                                    borderRadius: '20px',
                                                    background: customization.isDarkMode ? 'transparent' : 'white'
                                                }}
                                                variant='outlined'
                                                color='success'
                                                key={index}
                                                startIcon={<IconCheck />}
                                                onClick={() => handleActionClick(elem, message.action)}
                                            >
                                                {elem.label}
                                            </Button>
                                        ) : (elem.type === 'reject-button' && elem.label === 'No') ||
                                          elem.type === 'agentflowv2-reject-button' ? (
                                            <Button
                                                sx={{
                                                    width: 'max-content',
                                                    borderRadius: '20px',
                                                    background: customization.isDarkMode ? 'transparent' : 'white'
                                                }}
                                                variant='outlined'
                                                color='error'
                                                key={index}
                                                startIcon={<IconX />}
                                                onClick={() => handleActionClick(elem, message.action)}
                                            >
                                                {elem.label}
                                            </Button>
                                        ) : (
                                            <Button
                                                sx={{ width: 'max-content', borderRadius: '20px', background: 'white' }}
                                                variant='outlined'
                                                key={index}
                                                onClick={() => handleActionClick(elem, message.action)}
                                            >
                                                {elem.label}
                                            </Button>
                                        )}
                                    </>
                                )
                            })}
                        </div>
                    )}
                    {message.type === 'apiMessage' && message.id ? (
                        <>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'start',
                                    gap: 1
                                }}
                            >
                                {isTTSEnabled && (
                                    <IconButton
                                        size='small'
                                        onClick={() =>
                                            isTTSPlaying[message.id]
                                                ? handleTTSStop(message.id)
                                                : handleTTSClick(message.id, message.message)
                                        }
                                        disabled={isTTSLoading[message.id]}
                                        sx={{
                                            backgroundColor: ttsAudio[message.id] ? 'primary.main' : 'transparent',
                                            color: ttsAudio[message.id] ? 'white' : 'inherit',
                                            '&:hover': {
                                                backgroundColor: ttsAudio[message.id] ? 'primary.dark' : 'action.hover'
                                            }
                                        }}
                                    >
                                        {isTTSLoading[message.id] ? (
                                            <CircularProgress size={16} />
                                        ) : isTTSPlaying[message.id] ? (
                                            <IconCircleDot style={{ width: '20px', height: '20px' }} color={'red'} />
                                        ) : (
                                            <IconVolume
                                                style={{ width: '20px', height: '20px' }}
                                                color={customization.isDarkMode ? 'white' : '#1e88e5'}
                                            />
                                        )}
                                    </IconButton>
                                )}
                                {chatFeedbackStatus && (
                                    <>
                                        <CopyToClipboardButton onClick={() => copyMessageToClipboard(message.message)} />
                                        {!message.feedback || message.feedback.rating === '' || message.feedback.rating === 'THUMBS_UP' ? (
                                            <ThumbsUpButton
                                                isDisabled={message.feedback && message.feedback.rating === 'THUMBS_UP'}
                                                rating={message.feedback ? message.feedback.rating : ''}
                                                onClick={() => onThumbsUpClick(message.id)}
                                            />
                                        ) : null}
                                        {!message.feedback ||
                                        message.feedback.rating === '' ||
                                        message.feedback.rating === 'THUMBS_DOWN' ? (
                                            <ThumbsDownButton
                                                isDisabled={message.feedback && message.feedback.rating === 'THUMBS_DOWN'}
                                                rating={message.feedback ? message.feedback.rating : ''}
                                                onClick={() => onThumbsDownClick(message.id)}
                                            />
                                        ) : null}
                                    </>
                                )}
                            </Box>
                        </>
                    ) : null}
                </div>
            </Box>
        )
    }

    return (
        <>
            <Box
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    p: 3,
                    bgcolor: theme.palette.background.default
                }}
            >
                {isLoading ? (
                    <Stack spacing={2}>
                        {[1, 2, 3].map((i) => (
                            <Stack key={i} direction='row' spacing={2}>
                                <Skeleton variant='circular' width={32} height={32} />
                                <Skeleton variant='rectangular' width='60%' height={80} sx={{ borderRadius: 2 }} />
                            </Stack>
                        ))}
                    </Stack>
                ) : (
                    <>
                        {messages.map(renderMessage)}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </Box>
            <SourceDocDialog show={sourceDialogOpen} dialogProps={sourceDialogProps} onCancel={() => setSourceDialogOpen(false)} />
        </>
    )
}

MessageList.propTypes = {
    messages: PropTypes.array.isRequired,
    isLoading: PropTypes.bool,
    messagesEndRef: PropTypes.object,
    chatflowid: PropTypes.string,
    chatId: PropTypes.string,
    isDialog: PropTypes.bool,
    onSourceDialogClick: PropTypes.func,
    onURLClick: PropTypes.func
}

export default MessageList
