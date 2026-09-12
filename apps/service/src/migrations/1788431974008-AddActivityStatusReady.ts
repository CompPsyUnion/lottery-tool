import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * activity_status_enum 加 'ready' 值（draft → ready → active → ended 状态机）。
 *
 * 手写迁移（migration:generate 对 enum 加值检测不可靠）。事务约束：
 * 启动自动应用走 runMigrations({ transaction: 'each' })，PG≥12 下
 * ADD VALUE 在事务内合法的前提是同一事务不使用新值——本迁移 UP 仅此
 * 一条语句，安全；**不得**在此迁移中回填 status='ready'（会触发上述限制）。
 * 存量数据无需回填：draft 保持 draft、active 保持 active，语义不变。
 */
export class AddActivityStatusReady1788431974008 implements MigrationInterface {
  name = 'AddActivityStatusReady1788431974008'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql)
  }
}

const UP: string[] = [
  'ALTER TYPE "public"."activity_status_enum" ADD VALUE IF NOT EXISTS \'ready\'',
]

// PG 不支持 DROP VALUE：重建类型。先回填 ready→draft，否则 USING cast 残留 'ready' 行会失败；
// 列带 DEFAULT 'draft'，改类型前必须 DROP DEFAULT（PG 无法自动 cast default），完成后 SET 回
const DOWN: string[] = [
  'UPDATE "activities" SET "status" = \'draft\' WHERE "status" = \'ready\'',
  'ALTER TYPE "public"."activity_status_enum" RENAME TO "activity_status_enum_old"',
  "CREATE TYPE \"public\".\"activity_status_enum\" AS ENUM('draft', 'active', 'ended')",
  'ALTER TABLE "activities" ALTER COLUMN "status" DROP DEFAULT',
  'ALTER TABLE "activities" ALTER COLUMN "status" TYPE "public"."activity_status_enum" USING "status"::text::public."activity_status_enum"',
  'ALTER TABLE "activities" ALTER COLUMN "status" SET DEFAULT \'draft\'',
  'DROP TYPE "public"."activity_status_enum_old"',
]
