import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFolderAndFile1767000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_folder (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar NOT NULL,
                "color" varchar NOT NULL,
                "iconSrc" varchar,
                "description" text,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_folder_id" PRIMARY KEY (id)
            );`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_file (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "folderId" uuid NOT NULL,
                "name" varchar NOT NULL,
                "content" text,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_file_id" PRIMARY KEY (id),
                CONSTRAINT "FK_skill_file_folder" FOREIGN KEY ("folderId") REFERENCES skill_folder(id) ON DELETE CASCADE
            );`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill_file`)
        await queryRunner.query(`DROP TABLE IF EXISTS skill_folder`)
    }
}
