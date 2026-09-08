import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * lottery_records 加 is_test 标记：测试抽奖码抽奖也写记录（支撑签字流程测试），
 * 但不计入统计与管理端列表；测试码每次抽奖复用同一条记录（upsert），不堆积。
 */
export class AddLotteryRecordIsTest1788443250000 implements MigrationInterface {
  name = 'AddLotteryRecordIsTest1788443250000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql)
  }
}

const UP: string[] = ['ALTER TABLE "lottery_records" ADD "is_test" boolean NOT NULL DEFAULT false']

const DOWN: string[] = ['ALTER TABLE "lottery_records" DROP COLUMN "is_test"']
