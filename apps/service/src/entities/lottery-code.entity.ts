import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Activity } from './activity.entity'

// 参与者信息
export interface ParticipantInfo {
  name?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export type LotteryCodeStatus = 'unused' | 'used' | 'invalid'

@Entity({ name: 'lottery_codes' })
@Index('uq_lottery_codes_activity_code', ['activity_id', 'code'], { unique: true })
// 部分唯一索引：声明进实体元数据，migration:generate 才不会因元数据缺失而想 DROP 它
// （谓词须与 1788417306770 迁移建索引的原文一致）
@Index('uq_lottery_codes_activity_is_test', ['activity_id'], {
  unique: true,
  where: '"is_test" = true',
})
export class LotteryCode {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_lottery_codes',
  })
  id!: number

  @Column({ name: 'activity_id', type: 'integer', nullable: false })
  activity_id!: number

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id', foreignKeyConstraintName: 'fk_lottery_codes_activity' })
  activity!: Activity

  @Column({ name: 'code', type: 'varchar', length: 50, nullable: false })
  code!: string

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['unused', 'used', 'invalid'],
    enumName: 'lottery_code_status_enum',
    nullable: false,
    default: 'unused',
  })
  status!: LotteryCodeStatus

  /** 测试专用码：抽奖走完整流程但不扣库存/不置 used/不写记录（一活动至多一个，DB 部分唯一索引保证） */
  @Column({ name: 'is_test', type: 'boolean', nullable: false, default: false })
  is_test!: boolean

  /** 参与者信息：name, phone, email 等 */
  @Column({ name: 'participant_info', type: 'jsonb', nullable: true })
  participant_info!: ParticipantInfo | null

  /**
   * 邮箱即抽的提交方凭证（CSPRNG hex）：发给提交页（大屏）随请求返回、不落邮件。
   * 撤销时可作为记录归属的替代凭证（邮箱可被他人枚举，抽奖码只发本人邮箱——
   * 提交页没有码，凭本 token 撤销自己发起的那次请求）。普通码为 null。
   */
  @Column({ name: 'request_token', type: 'varchar', length: 64, nullable: true })
  request_token!: string | null

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  used_at!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date
}
