import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddEmbeddingModelConfig1770100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_folder')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'embeddingModelConfig')
            if (!hasColumn) {
                await queryRunner.query(`ALTER TABLE "skill_folder" ADD COLUMN "embeddingModelConfig" text;`)
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_folder')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'embeddingModelConfig')
            if (hasColumn) {
                await queryRunner.query(`ALTER TABLE "skill_folder" DROP COLUMN "embeddingModelConfig"`)
            }
        }
    }
}
