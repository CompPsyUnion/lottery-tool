import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Activity } from './activity.entity';
import { LotteryCode } from './lottery-code.entity';
import { Prize } from './prize.entity';
import { User } from './user.entity';

export type SignatureStatus = 'unsigned' | 'signed';

@Entity({ name: 'lottery_records' })
@Index('idx_lottery_records_activity', ['activity_id'])
@Index('idx_lottery_records_lottery_code', ['lottery_code_id'])
export class LotteryRecord {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_lottery_records',
  })
  id!: number;

  @Column({ name: 'activity_id', type: 'integer', nullable: false })
  activity_id!: number;

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id', foreignKeyConstraintName: 'fk_lottery_records_activity' })
  activity!: Activity;

  @Column({ name: 'lottery_code_id', type: 'integer', nullable: false })
  lottery_code_id!: number;

  @ManyToOne(() => LotteryCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lottery_code_id', foreignKeyConstraintName: 'fk_lottery_records_lottery_code' })
  lotteryCode!: LotteryCode;

  @Column({ name: 'prize_id', type: 'integer', nullable: true })
  prize_id!: number | null;

  @ManyToOne(() => Prize, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'prize_id', foreignKeyConstraintName: 'fk_lottery_records_prize' })
  prize!: Prize | null;

  @Column({ name: 'is_winner', type: 'boolean', nullable: false, default: false })
  is_winner!: boolean;

  /** 线下抽奖时的操作员ID */
  @Column({ name: 'operator_id', type: 'integer', nullable: true })
  operator_id!: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operator_id', foreignKeyConstraintName: 'fk_lottery_records_operator' })
  operator!: User | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  user_agent!: string | null;

  /** 签字图片（PNG data URL，直接存库，列表查询不返回此大字段） */
  @Column({ name: 'signature_data', type: 'text', nullable: true })
  signature_data!: string | null;

  /** 签字时间 */
  @Column({ name: 'signed_at', type: 'timestamp', nullable: true })
  signed_at!: Date | null;

  @Column({
    name: 'signature_status',
    type: 'enum',
    enum: ['unsigned', 'signed'],
    enumName: 'signature_status_enum',
    nullable: false,
    default: 'unsigned',
  })
  signature_status!: SignatureStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date;
}
