import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDebugVariableSnapshots1777010000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS debug_variable_snapshot (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "chatflowId" uuid NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" uuid NOT NULL,
                "runId" uuid NOT NULL,
                "nodeId" varchar(255) NOT NULL,
                "nodeLabel" varchar(255) NOT NULL,
                "status" varchar(16) NOT NULL,
                "durationMs" integer,
                "variables" jsonb NOT NULL,
                "missingVariables" jsonb,
                "runArgs" jsonb,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_debug_variable_snapshot" PRIMARY KEY (id),
                CONSTRAINT "FK_debug_variable_snapshot_chatflow" FOREIGN KEY ("chatflowId") REFERENCES chat_flow(id) ON DELETE CASCADE
            );
        `)

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_variable_snapshot_scope" ON debug_variable_snapshot ("workspaceId", "chatflowId", "userId", "createdDate");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_variable_snapshot_chatflowId" ON debug_variable_snapshot ("chatflowId");`
        )
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_debug_variable_snapshot_workspaceId" ON debug_variable_snapshot ("workspaceId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_debug_variable_snapshot_userId" ON debug_variable_snapshot ("userId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS debug_variable_snapshot`)
    }
}
