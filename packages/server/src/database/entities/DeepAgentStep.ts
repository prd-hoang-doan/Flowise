/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm'
import { IDeepAgentStep, DeepAgentStepStatus } from '../../Interface'
import { DeepAgentSession } from './DeepAgentSession'

@Entity()
export class DeepAgentStep implements IDeepAgentStep {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'varchar' })
    sessionId: string

    @Column({ type: 'int' })
    stepIndex: number

    @Column({ type: 'text' })
    description: string

    @Column({ type: 'varchar', length: 20, default: 'PENDING' })
    status: DeepAgentStepStatus

    @Column({ nullable: true, type: 'varchar' })
    toolName?: string

    @Column({ nullable: true, type: 'text' })
    toolInput?: string

    @Column({ nullable: true, type: 'text' })
    toolOutput?: string

    @Column({ nullable: true, type: 'text' })
    error?: string

    @Column({ nullable: true, type: 'timestamp' })
    startedAt?: Date

    @Column({ nullable: true, type: 'timestamp' })
    completedAt?: Date

    @ManyToOne(() => DeepAgentSession)
    @JoinColumn({ name: 'sessionId' })
    session: DeepAgentSession
}
