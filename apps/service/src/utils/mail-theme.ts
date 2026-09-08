/**
 * 邮件 HTML 模板渲染（email-poster 内置模板，子路径 'email-poster/template'）。
 * 主题贴合 web 端：primary 即 apps/web 的 --primary（oklch 0.208 0.042 265.755 ≈ #0f172b），
 * 品牌头与登录页一致（Lottery Tool）。明暗自适应（prefers-color-scheme）。
 */
const BRAND_TITLE = 'Lottery Tool'
const BRAND_SUBTITLE = '抽奖系统'
/** web 端 --primary（oklch 0.208 0.042 265.755）≈ #0f172b，safeColor 白名单内 */
const PRIMARY_COLOR = '#0f172b'

/** email-poster EmailTheme（本地最小结构，避免 ESM 类型导入） */
interface EmailThemeLike {
  brandTitle: string
  brandSubtitle: string
  primaryColor: string
  footerHtml: string
}

interface CodeEmailContentLike {
  code: string
  title?: string
  leadHtml?: string
  hintHtml?: string
  preheader?: string
}

interface CardEmailContentLike {
  title: string
  bodyHtml: string
  preheader?: string
}

function siteTheme(): EmailThemeLike {
  const year = new Date().getUTCFullYear()
  return {
    brandTitle: BRAND_TITLE,
    brandSubtitle: BRAND_SUBTITLE,
    primaryColor: PRIMARY_COLOR,
    footerHtml: `此邮件由 ${BRAND_TITLE} 系统自动发送，请勿直接回复 · © ${year}`,
  }
}

// email-poster/template 为纯 ESM 包子路径：CJS 产物下以动态 import 加载
const templateModule: Promise<{
  renderCodeEmail: (c: CodeEmailContentLike, theme?: EmailThemeLike) => string
  renderCardEmail: (c: CardEmailContentLike, theme?: EmailThemeLike) => string
}> = import('email-poster/template')

/** 注册验证码邮件（内置 code 模板：大号字距验证码、明暗自适应） */
export async function renderCodeMail(code: string, ttlMinutes: number): Promise<string> {
  const { renderCodeEmail } = await templateModule
  return renderCodeEmail(
    {
      code,
      title: '您的验证码',
      leadHtml: `您正在注册 <strong>${BRAND_TITLE}</strong> 账户，请使用以下验证码完成邮箱验证：`,
      hintHtml: `验证码 ${ttlMinutes} 分钟内有效。如非本人操作，请忽略本邮件。`,
      preheader: `您的注册验证码，${ttlMinutes} 分钟内有效`,
    },
    siteTheme(),
  )
}

/** 测试邮件（内置 card 模板，供超管验证通道连通性） */
export async function renderTestMail(): Promise<string> {
  const { renderCardEmail } = await templateModule
  const sentAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
  return renderCardEmail(
    {
      title: '邮件通道测试',
      bodyHtml:
        '<p>这是一封测试邮件。如果您收到了它，说明邮件通道配置正确。</p>' +
        `<p>发送时间：${sentAt} UTC</p>`,
      preheader: `${BRAND_TITLE} 邮件通道测试`,
    },
    siteTheme(),
  )
}
