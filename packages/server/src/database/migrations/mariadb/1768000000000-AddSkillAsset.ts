import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillAsset1768000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_asset\` (
                \`id\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`fileId\` varchar(36) NOT NULL,
                \`filename\` varchar(255) NOT NULL,
                \`mimeType\` varchar(255) NOT NULL,
                \`storagePath\` text NOT NULL,
                \`caption\` text,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                CONSTRAINT \`FK_skill_asset_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_asset_file\` FOREIGN KEY (\`fileId\`) REFERENCES \`skill_file\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_asset\``)
    }
}
