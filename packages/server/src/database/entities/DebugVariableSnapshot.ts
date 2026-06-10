/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { ExecutionState, IDebugVariableSnapshot, IDebugVariableSnapshotPayload, IDebugVariableSnapshotRunArgs } from '../../Interface'
import { ChatFlow } from './ChatFlow'
import { jsonValueTransformer } from './DebugVariable'

/**
 * Point-in-time copy of the Debug Variable Pool after a Step Run completes.
 *
 * Stored as a single denormalised JSON blob (`variables`) rather than per-row
 * snapshot rows — the inline cap on individual debug variables (64 KiB) plus
 * the retention cap on snapshots keeps the blob bounded, while a single
 * insert per Step Run avoids the write amplification that a fan-out schema
 * would incur on every run.
 *
 * Reuses `jsonValueTransformer` so JSON columns behave identically across
 * postgres / mysql / mariadb / sqlite (see DebugVariable.ts for the rationale).
 */
@Entity('debug_variable_snapshot')
@Index(['workspaceId', 'chatflowId', 'userId', 'createdDate'])
export class DebugVariableSnapshot implements IDebugVariableSnapshot {
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

    // Identifier of the Step Run that produced the snapshot. Distinct from
    // `id` so the UI can correlate the snapshot back to a streamed event.
    @Column({ type: 'uuid' })
    runId: string

    // The node that was step-run. May be a sentinel for whole-flow ops in
    // the future; right now always a real ReactFlow node id.
    @Column({ type: 'varchar', length: 255 })
    nodeId: string

    @Column({ type: 'varchar', length: 255 })
    nodeLabel: string

    @Column({ type: 'varchar', length: 16 })
    status: ExecutionState

    @Column({ type: 'int', nullable: true })
    durationMs?: number | null

    // Denormalised pool: { [scopeKey]: [{ id, name, valueType, value, sizeBytes, edited }] }.
    // Keyed by real nodeId or one of the DEBUG_NODE_SENTINELS values.
    @Column({ type: 'text', transformer: jsonValueTransformer })
    variables: IDebugVariableSnapshotPayload

    // Snapshot of the pre-computed missing references — surfaced in the UI so
    // users can see what blocked downstream steps at this point in time.
    @Column({ type: 'text', nullable: true, transformer: jsonValueTransformer })
    missingVariables?: string[] | null

    // Lightweight summary of the request args (do NOT store full payloads to
    // avoid bloating the snapshot blob with sensitive request bodies).
    @Column({ type: 'text', nullable: true, transformer: jsonValueTransformer })
    runArgs?: IDebugVariableSnapshotRunArgs | null

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date

    @ManyToOne(() => ChatFlow, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow
}
