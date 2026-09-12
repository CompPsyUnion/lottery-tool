import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * 系统设置（键值存储）：如 registration_enabled 等。
 * 无记录视为使用代码内默认值。
 */
@Entity({ name: 'system_settings' })
export class SystemSetting {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 100 })
  key!: string

  @Column({ name: 'value', type: 'text', nullable: false })
  value!: string

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date
}
