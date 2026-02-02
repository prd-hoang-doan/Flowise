import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddConversationEntity1769952371344 implements MigrationInterface {
    name = 'AddConversationEntity1769952371344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "conversation" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" text NOT NULL, "chatflowId" uuid NOT NULL, "chatId" character varying NOT NULL, "workspaceId" text NOT NULL, "userId" uuid, "isPublic" boolean NOT NULL DEFAULT false, "shareToken" character varying, "sharePassword" text, "shareExpiresAt" TIMESTAMP, "lastMessageAt" TIMESTAMP, "messageCount" integer NOT NULL DEFAULT '0', "createdDate" TIMESTAMP NOT NULL DEFAULT now(), "updatedDate" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e76f8925aea00d5d07866773b4e" UNIQUE ("chatId"), CONSTRAINT "UQ_e46ffdb31f7b07fc33c8be50be1" UNIQUE ("shareToken"), CONSTRAINT "PK_864528ec4274360a40f66c29845" PRIMARY KEY ("id"))`
        )
        await queryRunner.query(`CREATE INDEX "IDX_2e26c99839ad4e1e041492b101" ON "conversation" ("chatflowId") `)
        await queryRunner.query(`CREATE INDEX "IDX_e76f8925aea00d5d07866773b4" ON "conversation" ("chatId") `)
        await queryRunner.query(`CREATE INDEX "IDX_b6be52a9412369e1e83229ef54" ON "conversation" ("workspaceId") `)
        await queryRunner.query(`CREATE INDEX "IDX_c308b1cd542522bb66430fa860" ON "conversation" ("userId") `)
        await queryRunner.query(`CREATE INDEX "IDX_e46ffdb31f7b07fc33c8be50be" ON "conversation" ("shareToken") `)
        await queryRunner.query(`CREATE INDEX "IDX_b282116c9f066598e94366f085" ON "conversation" ("lastMessageAt") `)
        await queryRunner.query(
            `ALTER TABLE "conversation" ADD CONSTRAINT "FK_2e26c99839ad4e1e041492b1016" FOREIGN KEY ("chatflowId") REFERENCES "chat_flow"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "conversation"`)
    }
}
