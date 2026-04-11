import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillEdge1769100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_edge (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "skillFileId" uuid NOT NULL,
                "folderId" uuid NOT NULL,
                "fromNodeId" uuid NOT NULL,
                "toNodeId" uuid NOT NULL,
                "relation" varchar NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_edge_id" PRIMARY KEY (id),
                CONSTRAINT "FK_skill_edge_file" FOREIGN KEY ("skillFileId") REFERENCES skill_file(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_edge_folder" FOREIGN KEY ("folderId") REFERENCES skill_folder(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_edge_from" FOREIGN KEY ("fromNodeId") REFERENCES skill_node(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_edge_to" FOREIGN KEY ("toNodeId") REFERENCES skill_node(id) ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_file" ON skill_edge ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_from" ON skill_edge ("fromNodeId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_edge_to" ON skill_edge ("toNodeId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill_edge`)
    }
}
