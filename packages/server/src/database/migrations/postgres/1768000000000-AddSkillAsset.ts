import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillAsset1768000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS skill_asset (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "folderId" uuid NOT NULL,
                "fileId" uuid NOT NULL,
                "filename" varchar NOT NULL,
                "mimeType" varchar NOT NULL,
                "storagePath" text NOT NULL,
                "caption" text,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_skill_asset_id" PRIMARY KEY (id),
                CONSTRAINT "FK_skill_asset_folder" FOREIGN KEY ("folderId") REFERENCES skill_folder(id) ON DELETE CASCADE,
                CONSTRAINT "FK_skill_asset_file" FOREIGN KEY ("fileId") REFERENCES skill_file(id) ON DELETE CASCADE
            );`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS skill_asset`)
    }
}
