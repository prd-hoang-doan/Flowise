import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillNode } from '../../Interface'

@Entity()
export class SkillNode implements ISkillNode {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    skillFileId: string

    @Column()
    folderId: string

    @Column()
    type: string

    @Column({ type: 'text' })
    title: string

    @Column({ type: 'text' })
    content: string

    @Column({ type: 'int', default: 70 })
    priority: number

    @Column({ nullable: true, type: 'text' })
    triggers?: string

    @Column({ nullable: true })
    cluster?: string

    @Column({ nullable: true, type: 'text' })
    embeddingText?: string

    @Column({ type: 'int', default: 0 })
    orderIndex: number

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
