import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillEdge } from '../../Interface'

@Entity()
export class SkillEdge implements ISkillEdge {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    skillFileId: string

    @Column()
    folderId: string

    @Column()
    fromNodeId: string

    @Column()
    toNodeId: string

    @Column()
    relation: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
