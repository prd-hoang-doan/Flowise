/* eslint-disable */
import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
    ValueTransformer
} from 'typeorm'
import { DebugVariableValueType, IDebugVariable } from '../../Interface'
import { ChatFlow } from './ChatFlow'

/**
 * JSON transformer: sqlite stores `jsonb`/`json` as TEXT. Postgres / MySQL / MariaDB
 * use native JSON columns. Keeping a single transformer in code lets all drivers
 * agree on `value: unknown` at the entity level.
 *
 * The `to` side ALWAYS emits a valid JSON literal — even for raw strings,
 * numbers and booleans. Postgres `jsonb` rejects bare tokens like `pro` or
 * `42` (it needs `"pro"` / `42`), so the previous "pass strings through
 * unchanged" branch was producing `invalid input syntax for type json`
 * whenever a debug variable's value was a non-JSON string.
 *
 * `from` is symmetric and idempotent: parse if string, return as-is otherwise.
 */
export const jsonValueTransformer: ValueTransformer = {
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

@Entity('debug_variable')
@Index(['workspaceId', 'chatflowId', 'userId', 'nodeId'])
@Unique('UQ_debug_variable_scope', ['chatflowId', 'userId', 'nodeId', 'name'])
export class DebugVariable implements IDebugVariable {
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

    // Real ReactFlow node id (e.g. `llmAgentflow_2`) OR a DEBUG_NODE_SENTINELS value.
    @Column({ type: 'varchar', length: 255 })
    nodeId: string

    @Column({ type: 'varchar', length: 255 })
    name: string

    @Column({ type: 'varchar', length: 16 })
    valueType: DebugVariableValueType

    @Column({ type: 'text', nullable: true, transformer: jsonValueTransformer })
    value: unknown

    @Column({ nullable: true, type: 'text' })
    description?: string | null

    @Column({ type: 'boolean', default: true })
    visible: boolean

    @Column({ type: 'boolean', default: true })
    editable: boolean

    @Column({ type: 'boolean', default: false })
    edited: boolean

    @Column({ type: 'int', default: 0 })
    sizeBytes: number

    @Column({ type: 'timestamp', nullable: true })
    lastRunAt?: Date | null

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date

    @UpdateDateColumn({ type: 'timestamp' })
    updatedDate: Date

    @ManyToOne(() => ChatFlow, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow
}
