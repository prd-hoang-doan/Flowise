import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDeepAgentEntities1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "deep_agent_session" ("id" varchar PRIMARY KEY NOT NULL, "title" text NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'ACTIVE', "createdDate" datetime NOT NULL DEFAULT (datetime('now')), "updatedDate" datetime NOT NULL DEFAULT (datetime('now')), "workspaceId" text NOT NULL);`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "deep_agent_message" ("id" varchar PRIMARY KEY NOT NULL, "sessionId" varchar NOT NULL, "role" varchar(20) NOT NULL, "content" text NOT NULL, "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_message_sessionId" ON "deep_agent_message" ("sessionId");`)

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "deep_agent_step" ("id" varchar PRIMARY KEY NOT NULL, "sessionId" varchar NOT NULL, "stepIndex" integer NOT NULL, "description" text NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'PENDING', "toolName" varchar, "toolInput" text, "toolOutput" text, "error" text, "startedAt" datetime, "completedAt" datetime);`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_step_sessionId" ON "deep_agent_step" ("sessionId");`)

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "deep_agent_artifact" ("id" varchar PRIMARY KEY NOT NULL, "sessionId" varchar NOT NULL, "type" varchar(20) NOT NULL DEFAULT 'markdown', "content" text NOT NULL, "version" integer NOT NULL DEFAULT 1, "status" varchar(20) NOT NULL DEFAULT 'DRAFTING', "createdDate" datetime NOT NULL DEFAULT (datetime('now')), "updatedDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_artifact_sessionId" ON "deep_agent_artifact" ("sessionId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "deep_agent_artifact"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "deep_agent_step"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "deep_agent_message"`)
        await queryRunner.query(`DROP TABLE IF EXISTS "deep_agent_session"`)
    }
}
