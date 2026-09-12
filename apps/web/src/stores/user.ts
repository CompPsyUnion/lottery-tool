import { defineStore } from 'pinia';

interface UserState {
  token: string | null
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: null,
  }),
  actions: {
    setToken(token: string) {
      this.token = token;
    },
    clearToken() {
      this.token = null;
    },
  },
  persist: true,
});