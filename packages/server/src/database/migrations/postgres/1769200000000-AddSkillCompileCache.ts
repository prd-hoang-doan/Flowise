import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillCompileCache1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_compile_cache (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "skillFileId" uuid NOT NULL,
                "folderId" uuid NOT NULL,
                "hash" varchar NOT NULL,
                "compiledPrompt" text NOT NULL,
                "tokenCount" integer NOT NULL DEFAULT 0,
                "executionMode" varchar NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_compile_cache_id" PRIMARY KEY (id),
                CONSTRAINT "FK_skill_cache_file" FOREIGN KEY ("skillFileId") REFERENCES skill_file(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_cache_folder" FOREIGN KEY ("folderId") REFERENCES skill_folder(id) ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_cache_file" ON skill_compile_cache ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_cache_hash" ON skill_compile_cache ("skillFileId", "hash");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill_compile_cache`)
    }
}
