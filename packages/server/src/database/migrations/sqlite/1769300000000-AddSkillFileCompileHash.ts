import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFileCompileHash1769300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_file')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'compileHash')
            if (!hasColumn) {
                await queryRunner.query(`ALTER TABLE "skill_file" ADD COLUMN "compileHash" text;`)
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('skill_file')
        if (table) {
            const hasColumn = table.columns.find((col) => col.name === 'compileHash')
            if (hasColumn) {
                // SQLite doesn't support DROP COLUMN directly in older versions,
                // but TypeORM handles this through recreation
                await queryRunner.query(`ALTER TABLE "skill_file" DROP COLUMN "compileHash"`)
            }
        }
    }
}
