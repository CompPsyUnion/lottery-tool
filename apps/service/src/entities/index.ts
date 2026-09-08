/**
 * Entity barrel — the single list of TypeORM entities, shared by the runtime
 * DataSource (src/utils/database.ts) and the migration CLI scripts, so the two
 * can never drift apart. Plain relative imports only: this file must stay
 * loadable by the tsup CLI bundles outside the app.
 */
export * from './user.entity'
export * from './activity.entity'
export * from './prize.entity'
export * from './lottery-code.entity'
export * from './lottery-record.entity'
export * from './operation-log.entity'
export * from './system-setting.entity'
