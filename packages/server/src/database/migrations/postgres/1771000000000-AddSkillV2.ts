import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillV21771000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_v2 (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspaceId" text NOT NULL,
                "name" varchar(255) NOT NULL,
                "description" text,
                "iconSrc" varchar(255),
                "color" varchar(16),
                "fileTree" text NOT NULL,
                "contentDigest" varchar(64) NOT NULL,
                "publishedBundleId" varchar(64),
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_skill_v2_id" PRIMARY KEY (id)
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_skill_v2_workspaceId" ON skill_v2 ("workspaceId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skill_v2_workspaceId"`)
        await queryRunner.query(`DROP TABLE IF EXISTS skill_v2`)
    }
}
