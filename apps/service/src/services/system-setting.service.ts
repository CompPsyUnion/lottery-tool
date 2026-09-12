import { AppDataSource } from '../utils/database'
import { SystemSetting } from '../entities/system-setting.entity'

/** 系统注册开关（默认开启；无记录视为 true） */
export const REGISTRATION_ENABLED_KEY = 'registration_enabled'

export async function isRegistrationEnabled(): Promise<boolean> {
  const setting = await AppDataSource.getRepository(SystemSetting).findOneBy({
    key: REGISTRATION_ENABLED_KEY,
  })
  if (!setting) {
    return true
  }
  return setting.value !== 'false'
}

export async function setRegistrationEnabled(enabled: boolean): Promise<void> {
  await AppDataSource.getRepository(SystemSetting).save({
    key: REGISTRATION_ENABLED_KEY,
    value: enabled ? 'true' : 'false',
  })
}
