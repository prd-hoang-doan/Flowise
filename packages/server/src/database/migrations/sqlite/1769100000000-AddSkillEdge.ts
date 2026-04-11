import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillEdge1769100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_edge" (
                "id" varchar PRIMARY KEY NOT NULL,
                "skillFileId" varchar NOT NULL,
                "folderId" varchar NOT NULL,
                "fromNodeId" varchar NOT NULL,
                "toNodeId" varchar NOT NULL,
                "relation" varchar NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "workspaceId" text NOT NULL,
                FOREIGN KEY ("skillFileId") REFERENCES "skill_file" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("fromNodeId") REFERENCES "skill_node" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("toNodeId") REFERENCES "skill_node" ("id") ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_file" ON "skill_edge" ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_from" ON "skill_edge" ("fromNodeId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_to" ON "skill_edge" ("toNodeId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_edge"`)
    }
}
