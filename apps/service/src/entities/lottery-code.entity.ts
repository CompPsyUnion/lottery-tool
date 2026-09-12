import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Activity } from './activity.entity';

// 参与者信息
export interface ParticipantInfo {
  name?: string;
  phone?: string;
  email?: string;
  [key: string]: unknown;
}

export type LotteryCodeStatus = 'unused' | 'used' | 'invalid';

@Entity({ name: 'lottery_codes' })
@Index('uq_lottery_codes_activity_code', ['activity_id', 'code'], { unique: true })
export class LotteryCode {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_lottery_codes',
  })
  id!: number;

  @Column({ name: 'activity_id', type: 'integer', nullable: false })
  activity_id!: number;

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id', foreignKeyConstraintName: 'fk_lottery_codes_activity' })
  activity!: Activity;

  @Column({ name: 'code', type: 'varchar', length: 50, nullable: false })
  code!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['unused', 'used', 'invalid'],
    enumName: 'lottery_code_status_enum',
    nullable: false,
    default: 'unused',
  })
  status!: LotteryCodeStatus;

  /** 参与者信息：name, phone, email 等 */
  @Column({ name: 'participant_info', type: 'jsonb', nullable: true })
  participant_info!: ParticipantInfo | null;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  used_at!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date;
}
