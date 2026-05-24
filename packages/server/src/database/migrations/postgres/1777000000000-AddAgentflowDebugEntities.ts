import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentflowDebugEntities1777000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS debug_variable (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowId" uuid NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" uuid NOT NULL,
                "nodeId" varchar(255) NOT NULL,
                "name" varchar(255) NOT NULL,
                "valueType" varchar(16) NOT NULL,
                "value" jsonb,
                "description" text,
                "visible" boolean NOT NULL DEFAULT true,
                "editable" boolean NOT NULL DEFAULT true,
                "edited" boolean NOT NULL DEFAULT false,
                "sizeBytes" integer NOT NULL DEFAULT 0,
                "lastRunAt" timestamp,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_debug_variable" PRIMARY KEY (id),
                CONSTRAINT "UQ_debug_variable_scope" UNIQUE ("chatflowId", "userId", "nodeId", "name"),
                CONSTRAINT "FK_debug_variable_chatflow" FOREIGN KEY ("chatflowId") REFERENCES chat_flow(id) ON DELETE CASCADE
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_variable_scope" ON debug_variable ("workspaceId", "chatflowId", "userId", "nodeId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_chatflowId" ON debug_variable ("chatflowId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_workspaceId" ON debug_variable ("workspaceId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_userId" ON debug_variable ("userId");`)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS debug_node_execution (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowId" uuid NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" uuid NOT NULL,
                "nodeId" varchar(255) NOT NULL,
                "nodeLabel" varchar(255) NOT NULL,
                "data" jsonb NOT NULL,
                "status" varchar(16) NOT NULL,
                "durationMs" integer,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_debug_node_execution" PRIMARY KEY (id),
                CONSTRAINT "FK_debug_node_execution_chatflow" FOREIGN KEY ("chatflowId") REFERENCES chat_flow(id) ON DELETE CASCADE
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_scope" ON debug_node_execution ("workspaceId", "chatflowId", "userId", "nodeId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_chatflowId" ON debug_node_execution ("chatflowId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_workspaceId" ON debug_node_execution ("workspaceId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_node_execution_userId" ON debug_node_execution ("userId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS debug_node_execution`)
        await queryRunner.query(`DROP TABLE IF EXISTS debug_variable`)
    }
}
