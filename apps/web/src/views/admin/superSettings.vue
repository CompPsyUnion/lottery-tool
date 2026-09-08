<template>
  <div class="space-y-6">
    <PageTitle :title="'Super Settings'" />

    <!-- 系统注册开关 -->
    <div class="flex items-center justify-between rounded-lg border p-4">
      <div class="space-y-0.5">
        <div class="text-sm font-medium">开放系统注册</div>
        <div class="text-xs text-muted-foreground">
          开启后任何人可通过注册页创建普通管理员账户；关闭后前端不显示注册入口。
        </div>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="registrationEnabled"
        :disabled="switching"
        :class="[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          registrationEnabled ? 'bg-blue-600' : 'bg-gray-200',
        ]"
        @click="handleToggle(!registrationEnabled)"
      >
        <span
          :class="[
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
            registrationEnabled ? 'translate-x-5' : 'translate-x-0',
          ]"
        />
      </button>
    </div>

    <!-- 邮件通道配置（email-poster POST webhook） -->
    <div class="rounded-lg border p-4">
      <div class="space-y-0.5 pb-4">
        <div class="text-sm font-medium">邮件通道（验证码发送）</div>
        <div class="text-xs text-muted-foreground">
          通过 HTTP POST webhook 发送邮件（email-poster），不使用 SMTP。验证码用于注册邮箱校验。
        </div>
      </div>

      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label html-for="mail-post-url">Webhook 地址</Label>
          <Input
            id="mail-post-url"
            v-model="mail.postUrl"
            type="url"
            placeholder="https://your-webhook.example.com/send"
          />
        </div>

        <div class="grid gap-2">
          <Label html-for="mail-auth-token">认证令牌（Bearer）</Label>
          <Input
            id="mail-auth-token"
            v-model="mail.postAuthToken"
            type="password"
            :placeholder="mail.hasToken ? '已配置（留空保持不变）' : '未配置'"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- custom_example 预设无 from 字段（email/subject/content），隐藏发件人并让预设占满整行 -->
          <div
            class="grid gap-2"
            :class="{ 'sm:col-span-2': mail.postPreset === 'custom_example' }"
          >
            <Label html-for="mail-preset">字段映射预设</Label>
            <select
              id="mail-preset"
              v-model="mail.postPreset"
              class="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="smtogo">smtogo（from/to/subject/html）</option>
              <option value="custom_example">custom_example（email/subject/content）</option>
              <option value="generic">generic</option>
            </select>
          </div>
          <div v-if="mail.postPreset !== 'custom_example'" class="grid gap-2">
            <Label html-for="mail-from">发件人地址（可选）</Label>
            <Input
              id="mail-from"
              v-model="mail.fromAddress"
              type="email"
              placeholder="noreply@example.com"
            />
          </div>
        </div>

        <div class="grid gap-2">
          <Label html-for="mail-field-map">自定义字段映射 JSON（可选，优先于预设）</Label>
          <textarea
            id="mail-field-map"
            v-model="mail.postFieldMap"
            rows="3"
            class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
            :placeholder="`留空使用预设；例：{&quot;to&quot;:&quot;email&quot;,&quot;subject&quot;:&quot;title&quot;,&quot;body&quot;:&quot;text&quot;}`"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label html-for="mail-ttl">验证码有效期（分钟）</Label>
            <Input id="mail-ttl" v-model="mail.codeTtlMinutes" type="number" min="1" max="60" />
          </div>
          <div class="grid gap-2">
            <Label html-for="mail-subject">验证码邮件主题</Label>
            <Input id="mail-subject" v-model="mail.codeSubject" type="text" maxlength="100" />
          </div>
        </div>

        <p
          v-if="mailMessage"
          class="text-sm"
          :class="mailError ? 'text-destructive' : 'text-green-600'"
        >
          {{ mailMessage }}
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" :disabled="savingMail" @click="saveMailConfig">
            保存邮件配置
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="testing || !mail.postUrl"
            @click="sendTest"
          >
            {{ testing ? '发送中...' : '发送测试邮件' }}
          </Button>
          <Input
            v-model="testTo"
            type="email"
            placeholder="测试收件地址"
            class="w-64"
            :disabled="testing"
            @keyup.enter="sendTest"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import PageTitle from '@/components/ui/text/pageTitle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import API from '@/api'

const registrationEnabled = ref(true)
const switching = ref(false)

const mail = ref({
  postUrl: '',
  postAuthToken: '',
  postFieldMap: '',
  postPreset: 'smtogo' as 'none' | 'smtogo' | 'generic' | 'custom_example',
  fromAddress: '',
  codeTtlMinutes: 10,
  codeSubject: '您的验证码',
  hasToken: false,
})
const savingMail = ref(false)
const testing = ref(false)
const testTo = ref('')
const mailMessage = ref('')
const mailError = ref(false)

onMounted(async () => {
  try {
    const [regRes, mailRes] = await Promise.all([
      API.system.getRegistration(),
      API.system.getMail(),
    ])
    registrationEnabled.value = regRes.registration_enabled
    if (mailRes.config) {
      mail.value = { ...mail.value, ...mailRes.config }
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '获取设置失败')
  }
})

const handleToggle = async (value: boolean) => {
  switching.value = true
  try {
    const res = await API.system.setRegistration(value)
    registrationEnabled.value = res.registration_enabled
    toast.success(value ? '系统注册已开启' : '系统注册已关闭')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '设置失败')
  } finally {
    switching.value = false
  }
}

const saveMailConfig = async () => {
  savingMail.value = true
  mailMessage.value = ''
  try {
    await API.system.setMail({
      postUrl: mail.value.postUrl,
      postAuthToken: mail.value.postAuthToken,
      postFieldMap: mail.value.postFieldMap,
      postPreset: mail.value.postPreset,
      fromAddress: mail.value.fromAddress,
      codeTtlMinutes: Number(mail.value.codeTtlMinutes) || 10,
      codeSubject: mail.value.codeSubject,
    })
    mail.value.postAuthToken = ''
    toast.success('邮件配置已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingMail.value = false
  }
}

const sendTest = async () => {
  if (!testTo.value) {
    toast.error('请填写测试收件地址')
    return
  }
  testing.value = true
  mailMessage.value = ''
  try {
    // 用表单当前值发送（无需先保存）；令牌留空时后端沿用库中值
    await API.system.sendTestMail(testTo.value, {
      postUrl: mail.value.postUrl,
      postAuthToken: mail.value.postAuthToken,
      postFieldMap: mail.value.postFieldMap,
      postPreset: mail.value.postPreset,
      fromAddress: mail.value.fromAddress,
    })
    mailMessage.value = `测试邮件已发送至 ${testTo.value}，请查收`
    mailError.value = false
  } catch (err) {
    mailMessage.value = err instanceof Error ? err.message : '发送失败'
    mailError.value = true
  } finally {
    testing.value = false
  }
}
</script>
