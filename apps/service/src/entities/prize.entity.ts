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

@Entity({ name: 'prizes' })
@Index('idx_prizes_activity', ['activity_id'])
export class Prize {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_prizes',
  })
  id!: number;

  @Column({ name: 'activity_id', type: 'integer', nullable: false })
  activity_id!: number;

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id', foreignKeyConstraintName: 'fk_prizes_activity' })
  activity!: Activity;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'total_quantity', type: 'integer', nullable: false, default: 0 })
  total_quantity!: number;

  @Column({ name: 'remaining_quantity', type: 'integer', nullable: false, default: 0 })
  remaining_quantity!: number;

  /** numeric 经 pg 驱动返回字符串，业务层 parseFloat */
  @Column({
    name: 'probability',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: false,
    default: 0,
  })
  probability!: string;

  @Column({ name: 'sort_order', type: 'integer', nullable: true, default: 0 })
  sort_order!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date;
}
