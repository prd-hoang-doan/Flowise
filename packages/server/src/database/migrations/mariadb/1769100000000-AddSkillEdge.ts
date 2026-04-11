import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillEdge1769100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_edge\` (
                \`id\` varchar(36) NOT NULL,
                \`skillFileId\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`fromNodeId\` varchar(36) NOT NULL,
                \`toNodeId\` varchar(36) NOT NULL,
                \`relation\` varchar(255) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                INDEX \`idx_skill_edge_file\` (\`skillFileId\`),
                INDEX \`idx_skill_edge_from\` (\`fromNodeId\`),
                INDEX \`idx_skill_edge_to\` (\`toNodeId\`),
                CONSTRAINT \`FK_skill_edge_file\` FOREIGN KEY (\`skillFileId\`) REFERENCES \`skill_file\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_edge_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_edge_from\` FOREIGN KEY (\`fromNodeId\`) REFERENCES \`skill_node\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_edge_to\` FOREIGN KEY (\`toNodeId\`) REFERENCES \`skill_node\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_edge\``)
    }
}
