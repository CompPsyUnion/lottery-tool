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
import { User } from './user.entity'

// 活动设置
export interface ActivitySettings {
  max_lottery_codes?: number
  lottery_code_format?: string
  allow_duplicate_phone?: boolean
  lottery_strategy?: 'probability' | 'guaranteed'
  require_signature?: boolean
  [key: string]: unknown
}

export type LotteryMode = 'offline' | 'online'
export type ActivityStatus = 'draft' | 'ready' | 'active' | 'ended'

@Entity({ name: 'activities' })
@Index('uq_activities_webhook_id', ['webhook_id'], { unique: true })
export class Activity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_activities',
  })
  id!: number

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({
    name: 'lottery_mode',
    type: 'enum',
    enum: ['offline', 'online'],
    enumName: 'lottery_mode_enum',
    nullable: false,
  })
  lottery_mode!: LotteryMode

  @Column({ name: 'start_time', type: 'timestamp', nullable: true })
  start_time!: Date | null

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  end_time!: Date | null

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['draft', 'ready', 'active', 'ended'],
    enumName: 'activity_status_enum',
    nullable: false,
    default: 'draft',
  })
  status!: ActivityStatus

  /** 活动设置：max_lottery_codes, lottery_code_format, allow_duplicate_phone 等 */
  @Column({ name: 'settings', type: 'jsonb', nullable: true, default: {} })
  settings!: ActivitySettings | null

  /** Webhook 唯一标识 */
  @Column({ name: 'webhook_id', type: 'varchar', length: 50, nullable: true })
  webhook_id!: string | null

  /** Webhook 访问 token */
  @Column({ name: 'webhook_token', type: 'varchar', length: 255, nullable: true })
  webhook_token!: string | null

  @Column({ name: 'created_by', type: 'integer', nullable: true })
  created_by!: number | null

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'fk_activities_created_by' })
  creator!: User | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date
}
