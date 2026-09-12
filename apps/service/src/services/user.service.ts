import bcrypt from 'bcryptjs';
import { AppDataSource } from '../utils/database';
import { User, UserRole } from '../entities/user.entity';

/**
 * 启动时按环境变量播种超级管理员（可选）。
 *
 * 仅当 SUPER_ADMIN_USERNAME 与 SUPER_ADMIN_PASSWORD 同时设置、且用户表为空时生效；
 * 与 /auth/register 的首位注册互斥（同一把 advisory lock），返回是否已播种。
 */
export async function seedSuperAdminFromEnv(): Promise<boolean> {
  const username = process.env.SUPER_ADMIN_USERNAME?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const email = process.env.SUPER_ADMIN_EMAIL?.trim() || null;

  if (!username || !password) {
    return false; // 未配置，走首位注册引导
  }

  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
    console.warn('[bootstrap] SUPER_ADMIN_USERNAME 不合法（3-50位字母/数字/下划线），已跳过播种');
    return false;
  }

  return AppDataSource.transaction(async (manager) => {
    // 与首位注册共用锁，防止并发引导产生两个超管
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('auth_register_bootstrap'))`);

    const userCount = await manager.getRepository(User).count();
    if (userCount > 0) {
      return false; // 已有用户：env 播种仅作为空库引导，不覆盖既有账号
    }

    await manager.getRepository(User).save({
      username,
      email,
      password_hash: await hashPassword(password),
      role: 'super_admin',
      status: 'active',
    });

    return true;
  });
}

export interface SafeUser {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  status: string;
  created_at: Date;
  updated_at: Date;
}

// 剥离密码哈希的安全视图（原 User.toSafeJSON）
export const toSafeUser = (user: User): SafeUser => {
  const { password_hash, ...safe } = user;
  return safe as SafeUser;
};

export const findById = (id: number): Promise<User | null> =>
  AppDataSource.getRepository(User).findOneBy({ id });

export const findByUsername = (username: string): Promise<User | null> =>
  AppDataSource.getRepository(User).findOneBy({ username });

export const findByEmail = (email: string): Promise<User | null> =>
  AppDataSource.getRepository(User).findOneBy({ email });

export const validatePassword = (user: User, password: string): Promise<boolean> =>
  bcrypt.compare(password, user.password_hash);

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 12);

// 原User.createUser：创建后哈希密码
export async function createUser(userData: {
  username: string;
  email: string | null;
  password: string;
  role?: UserRole;
}): Promise<User> {
  const { username, email, password, role = 'admin' } = userData;
  const user = await AppDataSource.getRepository(User).save({
    username,
    email,
    role,
    status: 'active',
    password_hash: await hashPassword(password),
  });
  return user;
}

// 修改密码（原 setPassword + save）
export async function updatePassword(user: User, newPassword: string): Promise<void> {
  user.password_hash = await hashPassword(newPassword);
  await AppDataSource.getRepository(User).save(user);
}
