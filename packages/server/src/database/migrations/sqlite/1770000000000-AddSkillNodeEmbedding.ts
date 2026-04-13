import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillNodeEmbedding1770000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_node_embedding" (
                "id" varchar PRIMARY KEY NOT NULL,
                "nodeId" varchar NOT NULL,
                "skillFileId" varchar NOT NULL,
                "folderId" varchar NOT NULL,
                "embedding" text NOT NULL,
                "dimension" integer NOT NULL,
                "modelId" varchar NOT NULL,
                "contentHash" varchar NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "workspaceId" text NOT NULL,
                FOREIGN KEY ("nodeId") REFERENCES "skill_node" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("skillFileId") REFERENCES "skill_file" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_embedding_node" ON "skill_node_embedding" ("nodeId");`)
        await queryRunner.query(`CREATE INDEX "idx_embedding_file" ON "skill_node_embedding" ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_embedding_folder" ON "skill_node_embedding" ("folderId");`)
        await queryRunner.query(`CREATE INDEX "idx_embedding_model" ON "skill_node_embedding" ("modelId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_node_embedding"`)
    }
}
