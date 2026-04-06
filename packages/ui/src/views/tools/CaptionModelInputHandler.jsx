import PropTypes from 'prop-types'
import { useState } from 'react'

import { Box, Typography, IconButton } from '@mui/material'
import { IconRefresh } from '@tabler/icons-react'

import { Dropdown } from '@/ui-component/dropdown/Dropdown'
import { AsyncDropdown } from '@/ui-component/dropdown/AsyncDropdown'
import { Input } from '@/ui-component/input/Input'
import { SwitchInput } from '@/ui-component/switch/Switch'
import { TooltipWithParser } from '@/ui-component/tooltip/TooltipWithParser'
import CredentialInputHandler from '@/views/canvas/CredentialInputHandler'

import { FLOWISE_CREDENTIAL_ID } from '@/store/constant'

const CAPTION_RELEVANT_PARAMS = new Set(['credential', 'modelName', 'model', 'temperature', 'maxTokens'])
const CAPTION_RELEVANT_TYPES = new Set(['credential', 'asyncOptions', 'options', 'string', 'password', 'number', 'boolean'])

const CaptionModelInputHandler = ({ inputParam, data, onNodeDataChange }) => {
    const [, setRefresh] = useState(0)
    const [reloadTimestamp, setReloadTimestamp] = useState(Date.now().toString())

    if (!inputParam) return null
    const matchesName = CAPTION_RELEVANT_PARAMS.has(inputParam.type) || CAPTION_RELEVANT_PARAMS.has(inputParam.name)
    const matchesType = CAPTION_RELEVANT_TYPES.has(inputParam.type)
    if (!matchesName && !matchesType) return null

    const handleDataChange = ({ inputParam: param, newValue }) => {
        data.inputs[param.name] = newValue
        if (onNodeDataChange) {
            onNodeDataChange({ nodeId: data.id, inputParam: param, newValue })
        }
    }

    const getCredential = () => {
        const credential = data.inputs?.credential || data.inputs?.[FLOWISE_CREDENTIAL_ID]
        if (credential) return { credential }
        return {}
    }

    return (
        <div>
            <Box sx={{ p: 2 }}>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <Typography>
                        {inputParam.label}
                        {!inputParam.optional && <span style={{ color: 'red' }}>&nbsp;*</span>}
                        {inputParam.description && <TooltipWithParser style={{ marginLeft: 10 }} title={inputParam.description} />}
                    </Typography>
                </div>

                {inputParam.type === 'credential' && (
                    <CredentialInputHandler
                        key={JSON.stringify(inputParam)}
                        data={getCredential()}
                        inputParam={inputParam}
                        onSelect={(newValue) => {
                            data.credential = newValue
                            data.inputs[FLOWISE_CREDENTIAL_ID] = newValue
                            if (onNodeDataChange) {
                                onNodeDataChange({ nodeId: data.id, inputParam, newValue })
                            }
                            setRefresh((r) => r + 1)
                        }}
                    />
                )}

                {(inputParam.type === 'asyncOptions' || inputParam.type === 'asyncMultiOptions') && (
                    <div style={{ display: 'flex', flexDirection: 'row' }}>
                        <div key={reloadTimestamp} style={{ flex: 1 }}>
                            <AsyncDropdown
                                key={JSON.stringify(inputParam)}
                                name={inputParam.name}
                                nodeData={data}
                                freeSolo={inputParam.freeSolo}
                                multiple={inputParam.type === 'asyncMultiOptions'}
                                value={data.inputs[inputParam.name] ?? inputParam.default ?? 'choose an option'}
                                onSelect={(newValue) => handleDataChange({ inputParam, newValue })}
                                fullWidth={true}
                            />
                        </div>
                        {inputParam.refresh && (
                            <IconButton
                                title='Refresh'
                                color='primary'
                                size='small'
                                onClick={() => setReloadTimestamp(Date.now().toString())}
                            >
                                <IconRefresh />
                            </IconButton>
                        )}
                    </div>
                )}

                {inputParam.type === 'options' && (
                    <Dropdown
                        key={JSON.stringify(inputParam)}
                        name={inputParam.name}
                        options={inputParam.options}
                        onSelect={(newValue) => handleDataChange({ inputParam, newValue })}
                        value={data.inputs[inputParam.name] ?? inputParam.default ?? 'choose an option'}
                    />
                )}

                {(inputParam.type === 'string' || inputParam.type === 'password' || inputParam.type === 'number') && (
                    <Input
                        key={data.inputs[inputParam.name]}
                        inputParam={inputParam}
                        onChange={(newValue) => (data.inputs[inputParam.name] = newValue)}
                        onBlur={(newValue) => handleDataChange({ inputParam, newValue })}
                        value={data.inputs[inputParam.name] ?? inputParam.default ?? ''}
                        nodeId={data.id}
                    />
                )}

                {inputParam.type === 'boolean' && (
                    <SwitchInput
                        onChange={(newValue) => handleDataChange({ inputParam, newValue })}
                        value={data.inputs[inputParam.name] ?? inputParam.default ?? false}
                    />
                )}
            </Box>
        </div>
    )
}

CaptionModelInputHandler.propTypes = {
    inputParam: PropTypes.object,
    data: PropTypes.object,
    onNodeDataChange: PropTypes.func
}

export default CaptionModelInputHandler
