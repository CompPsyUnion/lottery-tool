import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'operation_logs' })
@Index('idx_operation_logs_user', ['user_id'])
@Index('idx_operation_logs_created', ['created_at'])
export class OperationLog {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_operation_logs',
  })
  id!: number;

  @Column({ name: 'user_id', type: 'integer', nullable: true })
  user_id!: number | null;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_operation_logs_user' })
  user!: User | null;

  @Column({ name: 'operation_type', type: 'varchar', length: 50, nullable: false })
  operation_type!: string;

  @Column({ name: 'operation_detail', type: 'text', nullable: true })
  operation_detail!: string | null;

  @Column({ name: 'target_type', type: 'varchar', length: 50, nullable: true })
  target_type!: string | null;

  @Column({ name: 'target_id', type: 'integer', nullable: true })
  target_id!: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  user_agent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date;
}
