import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFileDescriptionAndFilename1767100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_file')
        if (table) {
            if (!table.findColumnByName('description')) {
                await queryRunner.query(`ALTER TABLE skill_file ADD COLUMN "description" text;`)
            }
            if (!table.findColumnByName('filename')) {
                await queryRunner.query(`ALTER TABLE skill_file ADD COLUMN "filename" varchar;`)
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE skill_file DROP COLUMN "filename"`)
        await queryRunner.query(`ALTER TABLE skill_file DROP COLUMN "description"`)
    }
}
