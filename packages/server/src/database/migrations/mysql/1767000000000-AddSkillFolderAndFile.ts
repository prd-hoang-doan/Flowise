import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillFolderAndFile1767000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_folder\` (
                \`id\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`color\` varchar(255) NOT NULL,
                \`iconSrc\` varchar(255),
                \`description\` text,
                \`captionModelConfig\` text,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_file\` (
                \`id\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`content\` text,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                CONSTRAINT \`FK_skill_file_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_file\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_folder\``)
    }
}
