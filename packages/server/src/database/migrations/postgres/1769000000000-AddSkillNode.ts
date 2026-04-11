import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillNode1769000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_node (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "skillFileId" uuid NOT NULL,
                "folderId" uuid NOT NULL,
                "type" varchar NOT NULL,
                "title" text NOT NULL,
                "content" text NOT NULL,
                "priority" integer NOT NULL DEFAULT 70,
                "triggers" text,
                "cluster" varchar,
                "embeddingText" text,
                "orderIndex" integer NOT NULL DEFAULT 0,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_node_id" PRIMARY KEY (id),
                CONSTRAINT "FK_skill_node_file" FOREIGN KEY ("skillFileId") REFERENCES skill_file(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_node_folder" FOREIGN KEY ("folderId") REFERENCES skill_folder(id) ON DELETE CASCADE
            );`
        )
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file" ON skill_node ("skillFileId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_folder" ON skill_node ("folderId");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_type" ON skill_node ("type");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file_type" ON skill_node ("skillFileId", "type");`)
        await queryRunner.query(`CREATE INDEX "idx_skill_node_file_priority" ON skill_node ("skillFileId", "priority");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill_node`)
    }
}
