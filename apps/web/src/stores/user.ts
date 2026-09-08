import { defineStore } from 'pinia'

interface SessionUser {
  id: number
  username: string
  email: string | null
  role: string
}

interface UserState {
  token: string | null
  user: SessionUser | null
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: null,
    user: null,
  }),
  getters: {
    role: (state): string | null => state.user?.role ?? null,
  },
  actions: {
    setToken(token: string) {
      this.token = token
    },
    setSession(token: string, user: SessionUser) {
      this.token = token
      this.user = user
    },
    clearToken() {
      this.token = null
      this.user = null
    },
  },
  persist: true,
})
