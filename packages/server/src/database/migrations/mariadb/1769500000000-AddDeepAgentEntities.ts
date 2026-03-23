import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDeepAgentEntities1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`deep_agent_session\` (
                \`id\` varchar(36) NOT NULL,
                \`title\` text NOT NULL,
                \`status\` varchar(20) NOT NULL DEFAULT 'ACTIVE',
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`workspaceId\` text NOT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`deep_agent_message\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(255) NOT NULL,
                \`role\` varchar(20) NOT NULL,
                \`content\` text NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                INDEX \`IDX_deep_agent_message_sessionId\` (\`sessionId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`deep_agent_step\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(255) NOT NULL,
                \`stepIndex\` int NOT NULL,
                \`description\` text NOT NULL,
                \`status\` varchar(20) NOT NULL DEFAULT 'PENDING',
                \`toolName\` varchar(255),
                \`toolInput\` text,
                \`toolOutput\` text,
                \`error\` text,
                \`startedAt\` datetime(6),
                \`completedAt\` datetime(6),
                PRIMARY KEY (\`id\`),
                INDEX \`IDX_deep_agent_step_sessionId\` (\`sessionId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`deep_agent_artifact\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(255) NOT NULL,
                \`type\` varchar(20) NOT NULL DEFAULT 'markdown',
                \`content\` text NOT NULL,
                \`version\` int NOT NULL DEFAULT 1,
                \`status\` varchar(20) NOT NULL DEFAULT 'DRAFTING',
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                INDEX \`IDX_deep_agent_artifact_sessionId\` (\`sessionId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`deep_agent_artifact\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`deep_agent_step\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`deep_agent_message\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`deep_agent_session\``)
    }
}
