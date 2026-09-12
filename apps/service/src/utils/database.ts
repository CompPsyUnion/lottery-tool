// dotenv 必须最先加载：DataSource 在模块求值时就读取 process.env，
// 而编译产物的 require 顺序会让本模块先于 app.ts 的 dotenv.config() 执行
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { Logger } from 'typeorm';
import * as entities from '../entities';
import { migrations } from '../migrations';

class StartupLogger implements Logger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string): void {
    console.error(`[db] query error: ${error}\n  ${query}`);
  }
  logQuerySlow(): void {}
  logSchemaBuild(message: string): void {
    console.log(`[db] schema · ${message}`);
  }
  logMigration(message: string): void {
    console.log(`[db] migration · ${message}`);
  }
  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') console.warn(`[db] ${message}`);
    else console.log(`[db] ${message}`);
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lottery_system',
  entities: Object.values(entities),
  migrations,
  // Schema changes go through migrations ONLY (see src/migrations/).
  // `synchronize: true` treats renames as drop+create — it must stay off.
  synchronize: false,
  logging: ['error', 'warn'],
  logger: new StartupLogger(),
});

export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return;
  await AppDataSource.initialize();
  // Auto-apply pending migrations on every boot (dev and prod alike) — this is
  // what lets `pnpm migration:generate` output take effect on the next start.
  if (await AppDataSource.showMigrations()) {
    const applied = await AppDataSource.runMigrations({ transaction: 'each' });
    for (const m of applied) console.log(`[db] migration applied · ${m.name}`);
  }
  console.log(
    `[db] ready · ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'lottery_system'}`,
  );
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
