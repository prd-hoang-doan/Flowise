import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillV21771000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_v2" (
                "id" varchar PRIMARY KEY NOT NULL,
                "workspaceId" text NOT NULL,
                "name" varchar(255) NOT NULL,
                "description" text,
                "iconSrc" varchar(255),
                "color" varchar(16),
                "fileTree" text NOT NULL,
                "contentDigest" varchar(64) NOT NULL,
                "publishedBundleId" varchar(64),
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_skill_v2_workspaceId" ON "skill_v2" ("workspaceId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skill_v2_workspaceId"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_v2"`)
    }
}
