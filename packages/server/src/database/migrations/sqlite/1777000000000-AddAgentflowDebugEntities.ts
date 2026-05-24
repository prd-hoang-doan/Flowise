import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentflowDebugEntities1777000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "debug_variable" (
                "id" varchar PRIMARY KEY NOT NULL,
                "chatflowId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" varchar NOT NULL,
                "nodeId" varchar(255) NOT NULL,
                "name" varchar(255) NOT NULL,
                "valueType" varchar(16) NOT NULL,
                "value" text,
                "description" text,
                "visible" boolean NOT NULL DEFAULT 1,
                "editable" boolean NOT NULL DEFAULT 1,
                "edited" boolean NOT NULL DEFAULT 0,
                "sizeBytes" integer NOT NULL DEFAULT 0,
                "lastRunAt" datetime,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')),
                CONSTRAINT "UQ_debug_variable_scope" UNIQUE ("chatflowId", "userId", "nodeId", "name"),
                CONSTRAINT "FK_debug_variable_chatflow" FOREIGN KEY ("chatflowId") REFERENCES "chat_flow"("id") ON DELETE CASCADE
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_variable_scope" ON "debug_variable" ("workspaceId", "chatflowId", "userId", "nodeId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_chatflowId" ON "debug_variable" ("chatflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_workspaceId" ON "debug_variable" ("workspaceId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_userId" ON "debug_variable" ("userId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "debug_node_execution" (
                "id" varchar PRIMARY KEY NOT NULL,
                "chatflowId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" varchar NOT NULL,
                "nodeId" varchar(255) NOT NULL,
                "nodeLabel" varchar(255) NOT NULL,
                "data" text NOT NULL,
                "status" varchar(16) NOT NULL,
                "durationMs" integer,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                CONSTRAINT "FK_debug_node_execution_chatflow" FOREIGN KEY ("chatflowId") REFERENCES "chat_flow"("id") ON DELETE CASCADE
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_scope" ON "debug_node_execution" ("workspaceId", "chatflowId", "userId", "nodeId");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_chatflowId" ON "debug_node_execution" ("chatflowId");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_workspaceId" ON "debug_node_execution" ("workspaceId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_userId" ON "debug_node_execution" ("userId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "debug_node_execution"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "debug_variable"`)
    }
}
