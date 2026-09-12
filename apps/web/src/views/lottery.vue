<template>
  <div class="min-h-screen bg-white flex items-center justify-center p-4">
    <!-- 加载状态 -->
    <div v-if="loading" class="text-gray-800 text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"></div>
      <p>加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="text-gray-800 text-center bg-red-100 p-6 rounded-lg">
      <p class="text-lg font-semibold mb-2">加载失败</p>
      <p class="mb-4">{{ error }}</p>
      <button @click="loadActivityInfo" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
        重试
      </button>
    </div>

    <!-- 主要内容 -->
    <div v-else class="w-full max-w-4xl flex flex-col lg:flex-row gap-8 items-center justify-center">
      <!-- 盒子一：抽奖框 -->
      <div class="lottery-box-one bg-white rounded-2xl p-8 w-full max-w-md">
        <!-- 活动标题 -->
        <div class="text-center mb-8">
          <img v-if="activityInfo?.icon" :src="activityInfo.icon" alt="活动图标" class="h-16 w-16 mx-auto mb-4 rounded-full object-cover" />
          <h1 class="text-2xl font-bold text-gray-800 mb-2">{{ activityInfo?.name || '抽奖活动' }}</h1>
          <p v-if="activityInfo?.description" class="text-gray-600 text-sm">{{ activityInfo.description }}</p>
        </div>

        <!-- 抽奖码输入框 -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">抽奖码</label>
          <Input 
            v-model="lotteryCode" 
            placeholder="请输入抽奖码"
            class="w-full text-center text-lg md:text-2xl lg:text-3xl font-mono tracking-wider lottery-code-input"
            :maxlength="getMaxLength()"
            @input="onInputChange"
          />
        </div>

        <!-- 参与者信息（仅online模式） -->
        <div v-if="activityInfo?.lottery_mode === 'online'" class="mb-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">姓名</label>
            <Input v-model="participantInfo.name" placeholder="请输入姓名" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">手机号</label>
            <Input v-model="participantInfo.phone" placeholder="请输入手机号" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">邮箱（可选）</label>
            <Input v-model="participantInfo.email" placeholder="请输入邮箱" type="email" />
          </div>
        </div>

        <!-- 立即抽奖按钮 -->
        <button 
          @click="handleDraw" 
          :disabled="!canDraw || isDrawing"
          class="draw-button"
        >
          <Gift class="w-5 h-5" />
          {{ isDrawing ? '抽奖中...' : '立即抽奖' }}
        </button>
      </div>

      <!-- 盒子二：数字键盘（仅桌面和平板显示，且仅offline模式） -->
      <div 
        v-if="activityInfo?.lottery_mode === 'offline'"
        class="keyboard-box bg-white bg-opacity-90 backdrop-blur-sm p-6 hidden md:block"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-4 text-center">数字键盘</h3>
        <div class="grid grid-cols-3 gap-3 w-64">
          <!-- 数字键 1-9 -->
          <button 
            v-for="num in [1,2,3,4,5,6,7,8,9]" 
            :key="num"
            @click="inputNumber(num.toString())"
            class="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-gray-800 transition-colors"
          >
            {{ num }}
          </button>
          <!-- 空白 -->
          <div></div>
          <!-- 数字键 0 -->
          <button 
            @click="inputNumber('0')"
            class="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-gray-800 transition-colors"
          >
            0
          </button>
          <!-- 退格键 -->
          <button 
            @click="deleteNumber"
            class="h-12 bg-red-100 hover:bg-red-200 rounded-lg font-semibold text-red-600 transition-colors flex items-center justify-center"
          >
            <Delete class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 抽奖结果Dialog -->
    <Dialog :open="showResult" @update:open="(open) => showResult = open">
      <DialogContent class="max-w-lg mx-4 rounded-2xl border-0 shadow-2xl">
        <DialogHeader class="pb-6">
          <DialogTitle class="text-center space-y-4">
            <div v-if="lotteryResult?.is_winner" class="space-y-4">
              <div class="text-6xl animate-bounce">🎉</div>
              <h2 class="text-2xl font-bold bg-linear-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                恭喜中奖！
              </h2>
            </div>
            <div v-else class="space-y-4">
              <div class="text-6xl">🤣👉🤡</div>
              <h2 class="text-2xl font-bold text-slate-700">
                很遗憾
              </h2>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div class="text-center space-y-6 py-4">
          <div v-if="lotteryResult?.is_winner" class="space-y-4">
            <div class="bg-linear-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
              <p class="text-sm text-green-700 font-medium mb-2">您获得的奖品</p>
              <p class="text-2xl font-bold text-green-800 mb-3">{{ lotteryResult.prize?.name }}</p>
              <p v-if="lotteryResult.prize?.description" class="text-green-600 text-sm leading-relaxed">
                {{ lotteryResult.prize.description }}
              </p>
            </div>
            
            <!-- 参与者信息 -->
            <div v-if="lotteryResult.lottery_code?.participant_info" class="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p class="text-sm text-slate-600 font-medium mb-2">中奖信息</p>
              <div class="space-y-1 text-sm text-slate-700">
                <p><span class="font-medium">姓名：</span>{{ lotteryResult.lottery_code.participant_info.name }}</p>
                <p><span class="font-medium">抽奖码：</span>{{ lotteryResult.lottery_code.code }}</p>
              </div>
            </div>
          </div>
          
          <div v-else class="space-y-4">
            <div class="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <p class="text-lg text-slate-700 mb-2">本次未中奖</p>
              <p class="text-sm text-slate-500">感谢您的参与，请继续努力！</p>
            </div>
          </div>
        </div>
        
        <DialogFooter class="pt-6">
          <div class="w-full flex justify-center">
            <button 
              @click="closeResult"
              class="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg transform"
            >
              确定
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <!-- 签字弹窗 -->
    <SignatureDialog
      v-model:visible="showSignature"
      :is-submitting="isSubmittingSignature"
      :error-message="signatureError"
      @confirm="handleSignatureConfirm"
      @cancel="handleSignatureCancel"
    />
    
    <!-- Toast 组件 -->
    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Gift, Delete } from 'lucide-vue-next';
import { toast, Toaster } from 'vue-sonner';
import { lotteryApi, adminActivityApi, authApi } from '@/api';
import { useUserStore } from '@/stores/user';
import type { Activity, Prize, LotteryRecord } from '@/types/api';
import SignatureDialog from '@/components/common/SignatureDialog.vue';

const router = useRouter();
const userStore = useUserStore();
const urlParams = new URLSearchParams(window.location.search);
const activityId = Number(urlParams.get('activityId'));

// 响应式数据
const loading = ref(true);
const error = ref<string>('');
const activityInfo = ref<Activity | null>(null);
const prizes = ref<Prize[]>([]);
const lotteryCode = ref<string>('');
const isDrawing = ref(false);
const showResult = ref(false);
const lotteryResult = ref<{
  is_winner: boolean;
  prize?: Prize | null;
  lottery_record?: LotteryRecord | null;
  lottery_code?: { 
    code: string; 
    participant_info?: { name: string; phone: string; email?: string } 
  } | null;
} | null>(null);

// 签字相关
const showSignature = ref(false);
const isSubmittingSignature = ref(false);
const signatureError = ref('');
const currentRecordId = ref<number | null>(null);

// 参与者信息（仅online模式需要）
const participantInfo = ref({
  name: '',
  phone: '',
  email: '',
});

// 计算属性
const canDraw = computed(() => {
  if (!lotteryCode.value.trim()) return false;
  
  if (activityInfo.value?.lottery_mode === 'online') {
    return participantInfo.value.name.trim() && participantInfo.value.phone.trim();
  }
  
  return true;
});

// 获取抽奖码最大长度
const getMaxLength = () => {
  const format = activityInfo.value?.settings?.lottery_code_format;
  switch (format) {
  case '4_digit_number':
    return 4;
  case '8_digit_number':
  case '8_digit_alphanumeric':
    return 8;
  case '12_digit_number':
  case '12_digit_alphanumeric':
    return 12;
  default:
    return 10;
  }
};

// 输入框变化处理
const onInputChange = () => {
  const format = activityInfo.value?.settings?.lottery_code_format;
  if (format?.includes('number')) {
    // 只允许数字
    lotteryCode.value = lotteryCode.value.replace(/[^0-9]/g, '');
  } else if (format?.includes('alphanumeric')) {
    // 允许字母和数字
    lotteryCode.value = lotteryCode.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }
};

// 数字键盘输入
const inputNumber = (num: string) => {
  if (lotteryCode.value.length < getMaxLength()) {
    lotteryCode.value += num;
  }
};

// 删除数字
const deleteNumber = () => {
  lotteryCode.value = lotteryCode.value.slice(0, -1);
};

// 检查用户是否已登录（仅offline模式需要）
const checkAuthForOffline = async (): Promise<boolean> => {
  if (activityInfo.value?.lottery_mode !== 'offline') {
    return true; // online模式不需要登录
  }
  
  // 检查是否有token
  if (!userStore.token) {
    toast.error('线下活动需管理员登录');
    router.push('/login');
    return false;
  }
  
  // 验证token是否有效
  try {
    await authApi.me();
    return true;
  } catch {
    // token无效，清除并跳转登录
    userStore.clearToken();
    toast.error('线下活动需管理员登录');
    router.push('/login');
    return false;
  }
};

// 加载活动信息
const loadActivityInfo = async () => {
  if (!activityId) {
    error.value = '缺少活动ID参数';
    loading.value = false;
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    
    const response = await lotteryApi.getActivity(activityId);
    activityInfo.value = response.activity;
    prizes.value = response.prizes || [];
    
    // 检查活动状态
    if (activityInfo.value.status !== 'active') {
      error.value = '活动未开始或已结束';
      return;
    }
    
  } catch (err) {
    // 加载活动信息失败
    
    // 解析API返回的错误信息
    let errorMessage = '获取活动信息失败，请稍后重试';
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { data?: { error?: { message?: string; details?: string } } } }).response;
      if (response?.data?.error) {
        const apiError = response.data.error;
        errorMessage = apiError.message || errorMessage;
        if (apiError.details) {
          errorMessage += ` (${apiError.details})`;
        }
      }
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message;
    }
    
    error.value = errorMessage;
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

// 处理抽奖
const handleDraw = async () => {
  if (!canDraw.value || isDrawing.value) return;
  
  // 输入验证
  if (!lotteryCode.value.trim()) {
    toast.error('请输入抽奖码');
    return;
  }
  
  if (activityInfo.value?.lottery_mode === 'online') {
    if (!participantInfo.value.name.trim()) {
      toast.error('请输入姓名');
      return;
    }
    if (!participantInfo.value.phone.trim()) {
      toast.error('请输入手机号');
      return;
    }
  }
  
  // 检查offline模式下的登录状态
  const isAuthorized = await checkAuthForOffline();
  if (!isAuthorized) {
    return;
  }
  
  try {
    isDrawing.value = true;
    
    let drawResponse;
    
    if (activityInfo.value?.lottery_mode === 'online') {
      // 线上抽奖
      drawResponse = await lotteryApi.draw(activityId, {
        lottery_code: lotteryCode.value,
        participant_info: {
          name: participantInfo.value.name,
          phone: participantInfo.value.phone,
          email: participantInfo.value.email || undefined,
        },
      });
    } else {
      // 线下抽奖
      drawResponse = await adminActivityApi.offlineDraw(activityId, {
        lottery_code: lotteryCode.value,
      });
    }
    
    // 统一处理抽奖结果
    lotteryResult.value = {
      is_winner: drawResponse.is_winner || false,
      prize: drawResponse.prize || null,
      lottery_record: drawResponse.lottery_record || null,
      lottery_code: drawResponse.lottery_code || null,
    };
    
    showResult.value = true;

    // 线下抽奖且活动开启了签字功能时，弹出签字弹窗
    const isOffline = activityInfo.value?.lottery_mode === 'offline';
    const requireSignature = activityInfo.value?.settings?.require_signature === true;
    const recordId = drawResponse.lottery_record?.id;

    if (isOffline && requireSignature && recordId) {
      currentRecordId.value = recordId;
      // 延迟一下再弹出签字，让用户先看到抽奖结果
      setTimeout(() => {
        showResult.value = false;
        showSignature.value = true;
      }, 1500);
    } else {
      // 不需要签字时，5秒后自动关闭结果弹窗
      setTimeout(() => {
        if (showResult.value) {
          closeResult();
        }
      }, 5000);
    }

    // 显示抽奖结果提示
    if (lotteryResult.value?.is_winner && lotteryResult.value?.prize) {
      toast.success(`🎉 恭喜您抽中了：${lotteryResult.value.prize.name}！`);
    } else {
      toast.info('很遗憾，本次未中奖，请再接再厉！');
    }
    
    // 清空输入
    lotteryCode.value = '';
    if (activityInfo.value?.lottery_mode === 'online') {
      participantInfo.value = { name: '', phone: '', email: '' };
    }
    
  } catch (err) {
    // 抽奖失败
    
    // 解析API返回的错误信息
    let errorMessage = '抽奖失败，请稍后重试';
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { data?: { error?: { message?: string; details?: string } } } }).response;
      if (response?.data?.error) {
        const apiError = response.data.error;
        errorMessage = apiError.message || errorMessage;
        if (apiError.details) {
          errorMessage += ` (${apiError.details})`;
        }
      }
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message;
    }
    
    toast.error(errorMessage);
  } finally {
    isDrawing.value = false;
  }
};

// 关闭结果弹窗
const closeResult = () => {
  showResult.value = false;
  lotteryResult.value = null;
};

// 签字确认
const handleSignatureConfirm = async (dataUrl: string) => {
  if (!currentRecordId.value || !activityId) return;

  isSubmittingSignature.value = true;
  signatureError.value = '';

  try {
    await adminActivityApi.uploadSignature(activityId, currentRecordId.value, {
      image: dataUrl,
    });
    toast.success('签字提交成功');
    showSignature.value = false;
    currentRecordId.value = null;
    lotteryResult.value = null;
  } catch (err) {
    let errorMessage = '签字上传失败，请重试';
    if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message;
    }
    signatureError.value = errorMessage;
    toast.error(errorMessage);
  } finally {
    isSubmittingSignature.value = false;
  }
};

// 签字取消
const handleSignatureCancel = () => {
  showSignature.value = false;
  signatureError.value = '';
  currentRecordId.value = null;
  lotteryResult.value = null;
  toast.info('已取消签字，抽奖结果已保存');
};

// 组件挂载时加载数据
onMounted(() => {
  loadActivityInfo();
});
</script>

<style scoped>
/* 左侧盒子1样式 - 去除边框和阴影 */
.lottery-box-one {
  border: none;
  box-shadow: none;
}

/* 数字键盘盒子样式 - 增加圆角、边框和阴影 */
.keyboard-box {
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.lottery-container {
  min-height: 100vh;
  background: white;
  padding: 20px;
}

.lottery-content {
  max-width: 1200px;
  gap: 2rem;
}

.lottery-box {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  backdrop-filter: blur(10px);
}

.activity-title {
  font-size: 2rem;
  font-weight: bold;
  color: #2d3748;
  margin-bottom: 0.5rem;
}

.activity-description {
  color: #718096;
  margin-bottom: 2rem;
}

.input-group {
  margin-bottom: 1.5rem;
}

.input-label {
  display: block;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.lottery-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1.1rem;
  text-align: center;
  letter-spacing: 2px;
  transition: all 0.3s ease;
}

.lottery-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  outline: none;
}

.draw-button {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.draw-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff5252 0%, #ff7979 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);
}

.draw-button:disabled {
  background: #cbd5e0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.keyboard-container {
  width: 100%;
  max-width: 300px;
}

.keyboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.keyboard-button {
  aspect-ratio: 1;
  background: #f7fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1.5rem;
  font-weight: 600;
  color: #2d3748;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.keyboard-button:hover {
  background: #edf2f7;
  border-color: #cbd5e0;
  transform: translateY(-1px);
}

.keyboard-button:active {
  transform: translateY(0);
}

.keyboard-button.delete {
  background: #fed7d7;
  border-color: #feb2b2;
  color: #c53030;
}

.keyboard-button.delete:hover {
  background: #fbb6ce;
  border-color: #f687b3;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #fed7d7;
  color: #c53030;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  text-align: center;
}

.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.result-modal {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.result-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.result-title.winner {
  color: #38a169;
}

.result-title.no-prize {
  color: #e53e3e;
}

.prize-info {
  background: #f0fff4;
  border: 2px solid #9ae6b4;
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.prize-name {
  font-size: 1.2rem;
  font-weight: 600;
  color: #2f855a;
  margin-bottom: 0.5rem;
}

.close-button {
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;
  transition: background 0.3s ease;
}

.close-button:hover {
  background: #5a67d8;
}

/* 抽奖码输入框样式 - 桌面端和平板端去除边框 */
@media (min-width: 768px) {
  .lottery-code-input {
    border: none !important;
    box-shadow: none !important;
  }
  
  .lottery-code-input:focus {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }
}

/* 媒体查询 - 只在桌面端和平板端显示键盘 */
@media (max-width: 768px) {
  .keyboard-container {
    display: none !important;
  }
  
  .lottery-content {
    flex-direction: column;
    gap: 1rem;
  }
  
  .lottery-box {
    padding: 1.5rem;
  }
}

@media (min-width: 769px) {
  .lottery-content {
    flex-direction: row;
    align-items: flex-start;
  }
  
  .lottery-box:first-child {
    flex: 1;
    max-width: 500px;
  }
}
</style>
