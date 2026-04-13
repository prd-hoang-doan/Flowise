import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillNodeEmbedding1770000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_node_embedding\` (
                \`id\` varchar(36) NOT NULL,
                \`nodeId\` varchar(36) NOT NULL,
                \`skillFileId\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`embedding\` longtext NOT NULL,
                \`dimension\` int NOT NULL,
                \`modelId\` varchar(255) NOT NULL,
                \`contentHash\` varchar(255) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                UNIQUE INDEX \`idx_embedding_node\` (\`nodeId\`),
                INDEX \`idx_embedding_file\` (\`skillFileId\`),
                INDEX \`idx_embedding_folder\` (\`folderId\`),
                INDEX \`idx_embedding_model\` (\`modelId\`),
                CONSTRAINT \`FK_embedding_node\` FOREIGN KEY (\`nodeId\`) REFERENCES \`skill_node\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_embedding_file\` FOREIGN KEY (\`skillFileId\`) REFERENCES \`skill_file\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_embedding_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_node_embedding\``)
    }
}
