import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillCompileCache } from '../../Interface'

@Entity()
export class SkillCompileCache implements ISkillCompileCache {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    skillFileId: string

    @Column()
    folderId: string

    @Column()
    hash: string

    @Column({ type: 'text' })
    compiledPrompt: string

    @Column({ type: 'int', default: 0 })
    tokenCount: number

    @Column()
    executionMode: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
