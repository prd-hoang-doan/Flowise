import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillNode1769000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_node\` (
                \`id\` varchar(36) NOT NULL,
                \`skillFileId\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`type\` varchar(255) NOT NULL,
                \`title\` text NOT NULL,
                \`content\` text NOT NULL,
                \`priority\` int NOT NULL DEFAULT 70,
                \`triggers\` text,
                \`cluster\` varchar(255),
                \`embeddingText\` text,
                \`orderIndex\` int NOT NULL DEFAULT 0,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                INDEX \`idx_skill_node_file\` (\`skillFileId\`),
                INDEX \`idx_skill_node_folder\` (\`folderId\`),
                INDEX \`idx_skill_node_type\` (\`type\`),
                INDEX \`idx_skill_node_file_type\` (\`skillFileId\`, \`type\`),
                INDEX \`idx_skill_node_file_priority\` (\`skillFileId\`, \`priority\`),
                CONSTRAINT \`FK_skill_node_file\` FOREIGN KEY (\`skillFileId\`) REFERENCES \`skill_file\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_node_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_node\``)
    }
}
