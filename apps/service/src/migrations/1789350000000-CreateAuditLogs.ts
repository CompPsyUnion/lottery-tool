import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * 审计日志表：记录奖品库存/抽奖码数量的每次变动（before/after、delta）
 * 与操作者（管理员用户名或参与者邮箱），供 /admin/audit 查询。
 * 与粗粒度文本的 operation_logs 互补，不设外键约束除活动（级联删除）。
 */
export class CreateAuditLogs1789350000000 implements MigrationInterface {
  name = 'CreateAuditLogs1789350000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql)
  }
}

const UP: string[] = [
  `CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "activity_id" integer NOT NULL,
    "action" varchar(50) NOT NULL,
    "lottery_code" varchar(50),
    "prize_name" varchar(100),
    "quantity_before" integer,
    "quantity_after" integer,
    "delta" integer NOT NULL DEFAULT 0,
    "actor_type" varchar(20) NOT NULL DEFAULT 'system',
    "actor" varchar(100),
    "user_id" integer,
    "is_test" boolean NOT NULL DEFAULT false,
    "ip_address" varchar(50),
    "user_agent" varchar(255),
    "detail" varchar(200),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id"),
    CONSTRAINT "fk_audit_logs_activity" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE
  )`,
  'CREATE INDEX "idx_audit_logs_activity_created" ON "audit_logs" ("activity_id", "created_at")',
  'CREATE INDEX "idx_audit_logs_action" ON "audit_logs" ("action")',
]

const DOWN: string[] = [
  'DROP INDEX IF EXISTS "public"."idx_audit_logs_action"',
  'DROP INDEX IF EXISTS "public"."idx_audit_logs_activity_created"',
  'DROP TABLE IF EXISTS "public"."audit_logs"',
]
