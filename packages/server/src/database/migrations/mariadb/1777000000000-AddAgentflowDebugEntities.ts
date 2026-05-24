import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentflowDebugEntities1777000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`debug_variable\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowId\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`userId\` varchar(36) NOT NULL,
                \`nodeId\` varchar(255) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`valueType\` varchar(16) NOT NULL,
                \`value\` longtext,
                \`description\` text,
                \`visible\` tinyint(1) NOT NULL DEFAULT 1,
                \`editable\` tinyint(1) NOT NULL DEFAULT 1,
                \`edited\` tinyint(1) NOT NULL DEFAULT 0,
                \`sizeBytes\` int NOT NULL DEFAULT 0,
                \`lastRunAt\` datetime(6),
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`UQ_debug_variable_scope\` (\`chatflowId\`, \`userId\`, \`nodeId\`, \`name\`),
                CONSTRAINT \`FK_debug_variable_chatflow\` FOREIGN KEY (\`chatflowId\`) REFERENCES \`chat_flow\`(\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_variable_scope\` ON \`debug_variable\` (\`workspaceId\`, \`chatflowId\`, \`userId\`, \`nodeId\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_debug_variable_chatflowId\` ON \`debug_variable\` (\`chatflowId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_debug_variable_workspaceId\` ON \`debug_variable\` (\`workspaceId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_debug_variable_userId\` ON \`debug_variable\` (\`userId\`);`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`debug_node_execution\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowId\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`userId\` varchar(36) NOT NULL,
                \`nodeId\` varchar(255) NOT NULL,
                \`nodeLabel\` varchar(255) NOT NULL,
                \`data\` longtext NOT NULL,
                \`status\` varchar(16) NOT NULL,
                \`durationMs\` int,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                CONSTRAINT \`FK_debug_node_execution_chatflow\` FOREIGN KEY (\`chatflowId\`) REFERENCES \`chat_flow\`(\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)

        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_node_execution_scope\` ON \`debug_node_execution\` (\`workspaceId\`, \`chatflowId\`, \`userId\`, \`nodeId\`);`
        )
        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_node_execution_chatflowId\` ON \`debug_node_execution\` (\`chatflowId\`);`
        )
        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_node_execution_workspaceId\` ON \`debug_node_execution\` (\`workspaceId\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_debug_node_execution_userId\` ON \`debug_node_execution\` (\`userId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`debug_node_execution\``)
        await queryRunner.query(`DROP TABLE IF EXISTS \`debug_variable\``)
    }
}
