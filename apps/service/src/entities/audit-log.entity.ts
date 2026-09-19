import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Activity } from './activity.entity'

/** 审计动作枚举（varchar 存储，语义值见 AUDIT_ACTIONS） */
export type AuditAction =
  // 抽奖事件（奖品剩余库存变动）
  | 'DRAW_ONLINE'
  | 'DRAW_OFFLINE'
  | 'DRAW_TEST'
  | 'UNDO_DRAW'
  | 'RECORD_DELETE'
  // 奖品管理
  | 'PRIZE_CREATE'
  | 'PRIZE_UPDATE'
  | 'PRIZE_DELETE'
  // 抽奖码管理（quantity 为空，delta 为码量净变化）
  | 'CODE_CREATE'
  | 'CODE_IMPORT'
  | 'CODE_REPLACE'
  | 'CODE_DELETE'

/**
 * 结构化审计日志：记录每次奖品库存/码量变动的 before/after 与操作者
 * （管理员用户名或参与者邮箱），与粗粒度文本的 operation_logs 互补。
 */
@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_activity_created', ['activity_id', 'created_at'])
@Index('idx_audit_logs_action', ['action'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_audit_logs',
  })
  id!: number

  @Column({ name: 'activity_id', type: 'integer', nullable: false })
  activity_id!: number

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id', foreignKeyConstraintName: 'fk_audit_logs_activity' })
  activity!: Activity | null

  @Column({ name: 'action', type: 'varchar', length: 50, nullable: false })
  action!: AuditAction

  /** 关联抽奖码（快照值，码删除后仍可读） */
  @Column({ name: 'lottery_code', type: 'varchar', length: 50, nullable: true })
  lottery_code!: string | null

  /** 奖品名快照（奖品可能随后被删） */
  @Column({ name: 'prize_name', type: 'varchar', length: 100, nullable: true })
  prize_name!: string | null

  /** 奖品剩余库存：变动前（码类动作为 null） */
  @Column({ name: 'quantity_before', type: 'integer', nullable: true })
  quantity_before!: number | null

  /** 奖品剩余库存：变动后 */
  @Column({ name: 'quantity_after', type: 'integer', nullable: true })
  quantity_after!: number | null

  /** after - before；码类动作 = 码量净变化 */
  @Column({ name: 'delta', type: 'integer', nullable: false, default: 0 })
  delta!: number

  /** 操作者类型：admin（管理端）/ participant（线上抽奖填写的参与者）/ email（邮箱即抽）/ system */
  @Column({ name: 'actor_type', type: 'varchar', length: 20, nullable: false, default: 'system' })
  actor_type!: 'admin' | 'participant' | 'email' | 'system'

  /** 管理员用户名或参与者邮箱 */
  @Column({ name: 'actor', type: 'varchar', length: 100, nullable: true })
  actor!: string | null

  /** 管理员操作时记录其用户 id（参与者动作为 null） */
  @Column({ name: 'user_id', type: 'integer', nullable: true })
  user_id!: number | null

  /** 测试码抽奖标记（无库存副作用，前后相同） */
  @Column({ name: 'is_test', type: 'boolean', nullable: false, default: false })
  is_test!: boolean

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ip_address!: string | null

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  user_agent!: string | null

  @Column({ name: 'detail', type: 'varchar', length: 200, nullable: true })
  detail!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', nullable: false })
  created_at!: Date
}
