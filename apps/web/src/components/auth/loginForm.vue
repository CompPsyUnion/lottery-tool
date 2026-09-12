<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const emits = defineEmits<{
  (e: 'submit', payload: { username: string; password: string }): void
}>();

const username = ref('');
const password = ref('');

const onSubmit = (e: Event) => {
  e.preventDefault();
  emits('submit', { username: username.value, password: password.value });
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <form @submit="onSubmit">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2">
          <h1 class="text-xl font-bold">
            Lottery Tool
          </h1>
          <div class="text-center text-sm">
            Don't have an account?
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <button type="button" class="underline underline-offset-4">
                    Sign up
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Registration not supported yet</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div class="flex flex-col gap-6">
          <div class="grid gap-2">
            <Label html-for="username">Username</Label>
            <Input
              id="username"
              type="text"
              v-model="username"
              placeholder="your username"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label html-for="password">Password</Label>
            <Input
              id="password"
              type="password"
              v-model="password"
              placeholder="Enter your password"
              required
            />
          </div>
          <Button type="submit" class="w-full">
            Login
          </Button>
        </div>
      </div>
    </form>
    <div class="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
      By clicking continue, you agree to our <a href="#">Terms of Service</a>
      and <a href="#">Privacy Policy</a>.
    </div>
  </div>
</template>
