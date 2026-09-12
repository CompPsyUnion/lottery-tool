import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type UserRole = 'super_admin' | 'admin'
export type UserStatus = 'active' | 'inactive'

@Entity({ name: 'users' })
@Index('uq_users_username', ['username'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_users',
  })
  id!: number

  @Column({ name: 'username', type: 'varchar', length: 50, nullable: false })
  username!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: false })
  password_hash!: string

  @Column({ name: 'email', type: 'varchar', length: 100, nullable: true })
  email!: string | null

  @Column({
    name: 'role',
    type: 'enum',
    enum: ['super_admin', 'admin'],
    enumName: 'user_role_enum',
    nullable: false,
    default: 'admin',
  })
  role!: UserRole

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['active', 'inactive'],
    enumName: 'user_status_enum',
    nullable: false,
    default: 'active',
  })
  status!: UserStatus

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date
}
