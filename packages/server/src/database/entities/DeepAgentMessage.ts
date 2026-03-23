/* eslint-disable */
import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm'
import { IDeepAgentMessage, DeepAgentMessageRole } from '../../Interface'
import { DeepAgentSession } from './DeepAgentSession'

@Entity()
export class DeepAgentMessage implements IDeepAgentMessage {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'varchar' })
    sessionId: string

    @Column({ type: 'varchar', length: 20 })
    role: DeepAgentMessageRole

    @Column({ type: 'text' })
    content: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @ManyToOne(() => DeepAgentSession)
    @JoinColumn({ name: 'sessionId' })
    session: DeepAgentSession
}
