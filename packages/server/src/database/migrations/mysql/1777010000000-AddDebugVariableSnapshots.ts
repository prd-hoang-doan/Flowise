import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDebugVariableSnapshots1777010000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`debug_variable_snapshot\` (
                \`id\` varchar(36) NOT NULL,
                \`chatflowId\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`userId\` varchar(36) NOT NULL,
                \`runId\` varchar(36) NOT NULL,
                \`nodeId\` varchar(255) NOT NULL,
                \`nodeLabel\` varchar(255) NOT NULL,
                \`status\` varchar(16) NOT NULL,
                \`durationMs\` int,
                \`variables\` json NOT NULL,
                \`missingVariables\` json,
                \`runArgs\` json,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                CONSTRAINT \`FK_debug_variable_snapshot_chatflow\` FOREIGN KEY (\`chatflowId\`) REFERENCES \`chat_flow\`(\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        `)

        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_variable_snapshot_scope\` ON \`debug_variable_snapshot\` (\`workspaceId\`, \`chatflowId\`, \`userId\`, \`createdDate\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_debug_variable_snapshot_chatflowId\` ON \`debug_variable_snapshot\` (\`chatflowId\`);`)
        await queryRunner.query(
            `CREATE INDEX \`IDX_debug_variable_snapshot_workspaceId\` ON \`debug_variable_snapshot\` (\`workspaceId\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_debug_variable_snapshot_userId\` ON \`debug_variable_snapshot\` (\`userId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`debug_variable_snapshot\``)
    }
}
