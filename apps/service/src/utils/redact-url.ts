/**
 * URL 中 token 查询参数脱敏。
 * 金山表单接入采用 ?token= 查询参数鉴权，req.url 会携带完整凭据；
 * 访问日志与错误日志输出前统一过这里，避免鉴权凭据落盘。
 */
export function redactUrlToken(url: string | undefined | null): string {
  return (url ?? '').replace(/([?&])token=[^&]*/gi, '$1token=***')
}
