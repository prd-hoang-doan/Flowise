import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDeepAgentEntities1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS deep_agent_session (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" text NOT NULL,
                "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                "workspaceId" text NOT NULL,
                CONSTRAINT "PK_deep_agent_session" PRIMARY KEY (id)
            );`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS deep_agent_message (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "role" varchar(20) NOT NULL,
                "content" text NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_deep_agent_message" PRIMARY KEY (id)
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_message_sessionId" ON deep_agent_message ("sessionId");`)

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS deep_agent_step (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "stepIndex" int NOT NULL,
                "description" text NOT NULL,
                "status" varchar(20) NOT NULL DEFAULT 'PENDING',
                "toolName" varchar,
                "toolInput" text,
                "toolOutput" text,
                "error" text,
                "startedAt" timestamp,
                "completedAt" timestamp,
                CONSTRAINT "PK_deep_agent_step" PRIMARY KEY (id)
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_step_sessionId" ON deep_agent_step ("sessionId");`)

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS deep_agent_artifact (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "type" varchar(20) NOT NULL DEFAULT 'markdown',
                "content" text NOT NULL,
                "version" int NOT NULL DEFAULT 1,
                "status" varchar(20) NOT NULL DEFAULT 'DRAFTING',
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_deep_agent_artifact" PRIMARY KEY (id)
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deep_agent_artifact_sessionId" ON deep_agent_artifact ("sessionId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS deep_agent_artifact`)
        await queryRunner.query(`DROP TABLE IF EXISTS deep_agent_step`)
        await queryRunner.query(`DROP TABLE IF EXISTS deep_agent_message`)
        await queryRunner.query(`DROP TABLE IF EXISTS deep_agent_session`)
    }
}
