import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillAsset1768000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "skill_asset" (
                "id" varchar PRIMARY KEY NOT NULL,
                "folderId" varchar NOT NULL,
                "fileId" varchar NOT NULL,
                "filename" varchar NOT NULL,
                "mimeType" varchar NOT NULL,
                "storagePath" text NOT NULL,
                "caption" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')),
                "workspaceId" text NOT NULL,
                FOREIGN KEY ("folderId") REFERENCES "skill_folder" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("fileId") REFERENCES "skill_file" ("id") ON DELETE CASCADE
            );`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "skill_asset"`)
    }
}
