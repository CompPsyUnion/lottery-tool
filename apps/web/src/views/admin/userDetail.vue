<template>
  <div class="space-y-6" :class="{ 'pb-20': !isAtBottom }">
    <PageTitle :title="isEditMode ? '编辑用户' : '创建用户'" />
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <div class="text-gray-500">正在加载用户数据...</div>
    </div>
    
    <form v-else @submit.prevent="onSubmit" class="space-y-6">
        <!-- 基本信息 -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-gray-900">基本信息</h3>
          
          <FormField v-slot="{ componentField }" name="username">
            <FormItem>
              <FormLabel>用户名 *</FormLabel>
              <FormControl>
                <Input 
                  type="text" 
                  placeholder="请输入用户名" 
                  v-bind="componentField" 
                />
              </FormControl>
              <FormMessage />
              <FormDescription>
                用户名用于登录系统，3-50个字符
              </FormDescription>
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>邮箱 *</FormLabel>
              <FormControl>
                <Input 
                  type="email" 
                  placeholder="请输入邮箱地址" 
                  v-bind="componentField" 
                />
              </FormControl>
              <FormMessage />
              <FormDescription>
                用于接收系统通知和密码重置
              </FormDescription>
            </FormItem>
          </FormField>

          <FormField v-if="!isEditMode" v-slot="{ componentField }" name="password">
            <FormItem>
              <FormLabel>密码 *</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  placeholder="请输入密码" 
                  v-bind="componentField" 
                />
              </FormControl>
              <FormMessage />
              <FormDescription>
                密码至少需要6位字符
              </FormDescription>
            </FormItem>
          </FormField>
        </div>

        <!-- 权限设置 -->
        <div class="space-y-4">
          <h3 class="text-lg font-medium text-gray-900">权限设置</h3>
          
          <FormField v-slot="{ componentField }" name="role">
            <FormItem>
              <FormLabel>用户角色 *</FormLabel>
              <FormControl>
                <RadioGroup v-bind="componentField" class="mt-2 flex flex-col space-y-1 md:flex-row md:space-y-0 md:space-x-6">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="admin" value="admin" />
                    <Label for="admin">管理员</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="super_admin" value="super_admin" />
                    <Label for="super_admin">超级管理员</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormDescription>
                管理员：基本管理权限；超级管理员：完整系统权限
              </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-if="isEditMode" v-slot="{ componentField }" name="status">
            <FormItem>
              <FormLabel>账户状态</FormLabel>
              <FormControl>
                <RadioGroup v-bind="componentField" class="mt-2 flex flex-col space-y-1 md:flex-row md:space-y-0 md:space-x-6">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="active" value="active" />
                    <Label for="active">激活</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="inactive" value="inactive" />
                    <Label for="inactive">禁用</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormDescription>
                禁用后用户将无法登录系统
              </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <!-- 时间信息 -->
        <div v-if="isEditMode && userTimeInfo" class="space-y-4">
          <h3 class="text-lg font-medium text-gray-900">时间信息</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label class="text-sm font-medium text-gray-700">注册时间</Label>
              <div class="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {{ formatDateTime(userTimeInfo.created_at) }}
              </div>
            </div>
            <div class="space-y-2">
              <Label class="text-sm font-medium text-gray-700">更新时间</Label>
              <div class="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {{ formatDateTime(userTimeInfo.updated_at) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div 
          :class="[
            'flex space-x-4 transition-all duration-300',
            isAtBottom ? 'justify-start py-3 border-t static' : 'justify-start fixed bottom-0 z-10 -mx-4 px-4 py-3 w-full bg-white/80 backdrop-blur-lg border-t'
          ]"
        >
          <Button 
            type="button" 
            variant="outline" 
            @click="$router.go(-1)"
          >
            取消
          </Button>
          <Button 
            type="submit" 
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? '保存中...' : (isEditMode ? '更新用户' : '创建用户') }}
          </Button>
        </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { toast } from 'vue-sonner';
import { useScroll } from '@vueuse/core';

import PageTitle from '@/components/ui/text/pageTitle.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

import { systemApi } from '@/api';
import type { CreateUserRequest, UpdateUserRequest } from '@/types/api';

const route = useRoute();
const router = useRouter();

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id);
const userId = computed(() => route.params.id ? Number(route.params.id) : null);

// 表单验证规则
const formSchema = computed(() => {
  const baseSchema = {
    username: z.string().min(3, '用户名至少需要3个字符').max(50, '用户名不能超过50个字符'),
    email: z.string().email('请输入有效的邮箱地址'),
    role: z.enum(['admin', 'super_admin'], {
      message: '请选择用户角色',
    }),
    status: z.enum(['active', 'inactive']).optional(),
  };

  // 创建模式下添加密码验证
  if (!isEditMode.value) {
    return toTypedSchema(z.object({
      ...baseSchema,
      password: z.string().min(6, '密码至少需要6位字符'),
    }));
  }

  // 编辑模式下不验证密码
  return toTypedSchema(z.object({
    ...baseSchema,
    password: z.string().optional(),
  }));
});

// 表单实例
const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    username: '',
    email: '',
    password: '',
    role: 'admin',
    status: 'active',
  },
});

// 提交状态和加载状态
const isSubmitting = ref(false);
const isLoading = ref(false);

// 用户时间信息
const userTimeInfo = ref<{ created_at: string; updated_at: string } | null>(null);

// 滚动监听
const { y } = useScroll(window);
const isAtBottom = computed(() => {
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  const scrollTop = y.value;
  return scrollTop + clientHeight >= scrollHeight - 10; // 10px容差
});

// 加载用户数据（编辑模式）
const loadUser = async () => {
  if (!isEditMode.value || !userId.value) {
    return;
  }
  
  isLoading.value = true;
  
  try {
    const response = await systemApi.getUser(userId.value);
    const user = response;

    // 设置表单值
    form.setValues({
      username: user.username,
      email: user.email,
      password: '', // 编辑时不显示密码
      role: user.role,
      status: user.status,
    });
    
    // 保存时间信息
    userTimeInfo.value = {
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  } catch (error) {
    console.error('加载用户数据失败:', error);
    toast.error('加载用户数据失败');
  } finally {
    isLoading.value = false;
  }
};

// 表单提交
const onSubmit = form.handleSubmit(async (values) => {
  isSubmitting.value = true;
  
  try {
    if (isEditMode.value && userId.value) {
      // 更新用户
      const updateData: UpdateUserRequest = {
        username: values.username,
        email: values.email,
        role: values.role as 'admin' | 'super_admin',
        status: values.status as 'active' | 'inactive',
      };
      
      await systemApi.updateUser(userId.value, updateData);
      toast.success('用户更新成功');
    } else {
      // 创建用户
      const createData: CreateUserRequest = {
        username: values.username,
        email: values.email,
        password: values.password!,
        role: values.role as 'admin' | 'super_admin',
      };
      
      await systemApi.createUser(createData);
      toast.success('用户创建成功');
    }
    
    // 返回用户列表
    router.push('/admin/users');
  } catch (error) {
    console.error('保存用户失败:', error);
    toast.error(isEditMode.value ? '更新用户失败' : '创建用户失败');
  } finally {
    isSubmitting.value = false;
  }
});

// 监听路由参数变化
watch(
  () => route.params.id,
  (newId) => {
    if (newId) {
      loadUser();
    }
  },
  { immediate: true }
);

// 格式化日期时间
const formatDateTime = (dateString: string) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateString;
  }
};

// 组件挂载时加载数据
onMounted(() => {
  loadUser();
});
</script>