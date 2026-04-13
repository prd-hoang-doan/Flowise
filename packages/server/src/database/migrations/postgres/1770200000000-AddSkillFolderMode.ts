import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFolderMode1770200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_folder')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'mode')
            if (!hasColumn) {
                await queryRunner.query(`ALTER TABLE skill_folder ADD COLUMN "mode" varchar DEFAULT 'simple';`)
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_folder')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'mode')
            if (hasColumn) {
                await queryRunner.query(`ALTER TABLE skill_folder DROP COLUMN "mode"`)
            }
        }
    }
}
