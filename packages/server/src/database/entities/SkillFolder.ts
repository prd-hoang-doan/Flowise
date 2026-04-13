/* eslint-disable */
import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillFolder } from '../../Interface'

@Entity()
export class SkillFolder implements ISkillFolder {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    name: string

    @Column()
    color: string

    @Column({ nullable: true })
    iconSrc?: string

    @Column({ nullable: true, type: 'text' })
    description?: string

    @Column({ nullable: true, default: 'simple' })
    mode?: string

    @Column({ nullable: true, type: 'text' })
    captionModelConfig?: string

    @Column({ nullable: true, type: 'text' })
    embeddingModelConfig?: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
