/* eslint-disable */
import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm'
import { IDeepAgentArtifact, DeepAgentArtifactType, DeepAgentArtifactStatus } from '../../Interface'
import { DeepAgentSession } from './DeepAgentSession'

@Entity()
export class DeepAgentArtifact implements IDeepAgentArtifact {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'varchar' })
    sessionId: string

    @Column({ type: 'varchar', length: 20, default: 'markdown' })
    type: DeepAgentArtifactType

    @Column({ type: 'text' })
    content: string

    @Column({ type: 'int', default: 1 })
    version: number

    @Column({ type: 'varchar', length: 20, default: 'DRAFTING' })
    status: DeepAgentArtifactStatus

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @ManyToOne(() => DeepAgentSession)
    @JoinColumn({ name: 'sessionId' })
    session: DeepAgentSession
}
