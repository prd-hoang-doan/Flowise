import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillCompileCache1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_compile_cache" (
                "id" varchar PRIMARY KEY NOT NULL,
                "skillFileId" varchar NOT NULL,
                "folderId" varchar NOT NULL,
                "hash" varchar NOT NULL,
                "compiledPrompt" text NOT NULL,
                "tokenCount" integer NOT NULL DEFAULT 0,
                "executionMode" varchar NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "workspaceId" text NOT NULL,
                FOREIGN KEY ("skillFileId") REFERENCES "skill_file" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_cache_file" ON "skill_compile_cache" ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_cache_hash" ON "skill_compile_cache" ("skillFileId", "hash");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_compile_cache"`)
    }
}
