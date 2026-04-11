import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSkillCompileCache1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`skill_compile_cache\` (
                \`id\` varchar(36) NOT NULL,
                \`skillFileId\` varchar(36) NOT NULL,
                \`folderId\` varchar(36) NOT NULL,
                \`hash\` varchar(255) NOT NULL,
                \`compiledPrompt\` text NOT NULL,
                \`tokenCount\` int NOT NULL DEFAULT 0,
                \`executionMode\` varchar(255) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`),
                INDEX \`idx_skill_cache_file\` (\`skillFileId\`),
                INDEX \`idx_skill_cache_hash\` (\`skillFileId\`, \`hash\`),
                CONSTRAINT \`FK_skill_cache_file\` FOREIGN KEY (\`skillFileId\`) REFERENCES \`skill_file\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_skill_cache_folder\` FOREIGN KEY (\`folderId\`) REFERENCES \`skill_folder\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`skill_compile_cache\``)
    }
}
