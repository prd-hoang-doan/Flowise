import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillNodeEmbedding } from '../../Interface'

@Entity()
export class SkillNodeEmbedding implements ISkillNodeEmbedding {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    nodeId: string

    @Column()
    skillFileId: string

    @Column()
    folderId: string

    @Column({ type: 'text' })
    embedding: string

    @Column({ type: 'int' })
    dimension: number

    @Column()
    modelId: string

    @Column()
    contentHash: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
