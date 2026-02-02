/* eslint-disable */
import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm'
import { IConversation } from '../../Interface'
import { ChatFlow } from './ChatFlow'

@Entity()
export class Conversation implements IConversation {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'text' })
    title: string

    @Index()
    @Column({ type: 'uuid' })
    chatflowId: string

    @ManyToOne(() => ChatFlow)
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow

    @Index()
    @Column({ type: 'varchar', unique: true })
    chatId: string

    @Index()
    @Column({ type: 'text' })
    workspaceId: string

    @Index()
    @Column({ type: 'uuid', nullable: true })
    userId?: string

    @Column({ type: 'boolean', default: false })
    isPublic: boolean

    @Index()
    @Column({ type: 'varchar', unique: true, nullable: true })
    shareToken?: string

    @Column({ type: 'text', nullable: true })
    sharePassword?: string

    @Column({ type: 'timestamp', nullable: true })
    shareExpiresAt?: Date

    @Index()
    @Column({ type: 'timestamp', nullable: true })
    lastMessageAt?: Date

    @Column({ type: 'int', default: 0 })
    messageCount: number

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
