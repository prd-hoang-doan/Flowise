import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFolderAndFile1767000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_folder" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "color" varchar NOT NULL, "iconSrc" varchar, "description" text, "createdDate" datetime NOT NULL DEFAULT (datetime('now')), "updatedDate" datetime NOT NULL DEFAULT (datetime('now')), "workspaceId" text NOT NULL);`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_file" ("id" varchar PRIMARY KEY NOT NULL, "folderId" varchar NOT NULL, "name" varchar NOT NULL, "content" text, "createdDate" datetime NOT NULL DEFAULT (datetime('now')), "updatedDate" datetime NOT NULL DEFAULT (datetime('now')), "workspaceId" text NOT NULL, FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE);`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_file"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_folder"`)
    }
}
