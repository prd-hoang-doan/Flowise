/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm'
import { INodeExecutionData } from 'flowise-components'
import { ExecutionState, IDebugNodeExecution } from '../../Interface'
import { ChatFlow } from './ChatFlow'

/**
 * Same idempotent JSON transformer pattern as DebugVariable. Each driver migration
 * picks the native column type (jsonb on postgres, json on mysql/mariadb, text on
 * sqlite); the transformer takes care of object <-> string conversion uniformly.
 *
 * The `to` side ALWAYS emits a valid JSON literal so Postgres `jsonb` accepts
 * scalar payloads (e.g. a bare error message string) without raising
 * "invalid input syntax for type json".
 */
export const jsonDataTransformer: ValueTransformer = {
    to: (value: unknown): string | null => {
        if (value === undefined || value === null) return null
        try {
            const encoded = JSON.stringify(value)
            return encoded === undefined ? null : encoded
        } catch {
            return null
        }
    },
    from: (raw: unknown): unknown => {
        if (raw === undefined || raw === null) return null
        if (typeof raw !== 'string') return raw
        try {
            return JSON.parse(raw)
        } catch {
            return raw
        }
    }
}

@Entity('debug_node_execution')
@Index(['workspaceId', 'chatflowId', 'userId', 'nodeId'])
export class DebugNodeExecution implements IDebugNodeExecution {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    chatflowId: string

    @Index()
    @Column({ type: 'varchar' })
    workspaceId: string

    @Index()
    @Column({ type: 'uuid' })
    userId: string

    @Column({ type: 'varchar', length: 255 })
    nodeId: string

    @Column({ type: 'varchar', length: 255 })
    nodeLabel: string

    // Full IAgentflowExecutedData['data'] payload — input, output, state, error,
    // timeMetadata, usageMetadata, usedTools — verbatim as the full-flow viewer expects.
    @Column({ type: 'text', transformer: jsonDataTransformer })
    data: INodeExecutionData

    @Column({ type: 'varchar', length: 16 })
    status: ExecutionState

    @Column({ type: 'int', nullable: true })
    durationMs?: number | null

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date

    @ManyToOne(() => ChatFlow, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow
}
