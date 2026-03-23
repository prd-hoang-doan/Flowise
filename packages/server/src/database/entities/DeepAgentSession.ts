/* eslint-disable */
import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { IDeepAgentSession, DeepAgentSessionStatus } from '../../Interface'

@Entity()
export class DeepAgentSession implements IDeepAgentSession {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'text' })
    title: string

    @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
    status: DeepAgentSessionStatus

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
