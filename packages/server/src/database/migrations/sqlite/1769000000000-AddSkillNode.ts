import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillNode1769000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_node" (
                "id" varchar PRIMARY KEY NOT NULL,
                "skillFileId" varchar NOT NULL,
                "folderId" varchar NOT NULL,
                "type" varchar NOT NULL,
                "title" text NOT NULL,
                "content" text NOT NULL,
                "priority" integer NOT NULL DEFAULT 70,
                "triggers" text,
                "cluster" varchar,
                "embeddingText" text,
                "orderIndex" integer NOT NULL DEFAULT 0,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')),
                "workspaceId" text NOT NULL,
                FOREIGN KEY ("skillFileId") REFERENCES "skill_file" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file" ON "skill_node" ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_folder" ON "skill_node" ("folderId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_type" ON "skill_node" ("type");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file_type" ON "skill_node" ("skillFileId", "type");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file_priority" ON "skill_node" ("skillFileId", "priority");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_node"`)
    }
}
