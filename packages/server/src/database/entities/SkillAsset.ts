import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import { ISkillAsset } from '../../Interface'

@Entity()
export class SkillAsset implements ISkillAsset {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    folderId: string

    @Column()
    fileId: string

    @Column()
    filename: string

    @Column()
    mimeType: string

    @Column({ type: 'text' })
    storagePath: string

    @Column({ nullable: true, type: 'text' })
    caption?: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string
}
