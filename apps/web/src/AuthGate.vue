<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { SessionInfo } from '@mdnook/shared'
import { api } from './api'
import App from './App.vue'
import Icon from './components/Icon.vue'

const session = ref<SessionInfo | null>(null)
const username = ref('')
const password = ref('')
const busy = ref(false)
const loading = ref(true)
const error = ref('')
let generation = 0
let poll: ReturnType<typeof setInterval> | undefined

async function refreshSession() {
  const current = ++generation
  try {
    const result = await api.session()
    if (generation === current) { session.value = result; error.value = '' }
  } catch (failure) {
    if (generation === current && !session.value?.authenticated) error.value = (failure as Error).message
  } finally { if (generation === current) loading.value = false }
}
async function login() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const pending = api.login(username.value, password.value)
  password.value = ''
  try { const result = await pending; generation++; session.value = result }
  catch (failure) { error.value = (failure as Error).message }
  finally { busy.value = false }
}
async function logout() {
  if (busy.value) return
  busy.value = true
  try { const result = await api.logout(); generation++; session.value = result; error.value = '' }
  catch (failure) { window.alert(`退出登录失败：${(failure as Error).message}`) }
  finally { busy.value = false }
}
function requireLogin() {
  generation++
  session.value = { authenticated: false, mode: 'system', username: null, loginAvailable: location.protocol === 'https:' }
  error.value = '登录已过期，请重新登录'
}
function checkRemoteSession() { if (session.value?.mode === 'system' && !busy.value) void refreshSession() }
onMounted(() => {
  window.addEventListener('mdnook-auth-required', requireLogin)
  window.addEventListener('focus', checkRemoteSession)
  void refreshSession()
  poll = setInterval(checkRemoteSession, 60000)
})
onUnmounted(() => {
  generation++
  clearInterval(poll)
  window.removeEventListener('mdnook-auth-required', requireLogin)
  window.removeEventListener('focus', checkRemoteSession)
})
</script>

<template>
  <App v-if="session?.authenticated" :username="session.username" :auth-mode="session.mode" @logout="logout" />
  <main v-else class="login-page">
    <section class="login-card" aria-labelledby="login-title" :aria-busy="loading || busy">
      <div class="login-brand"><span class="brand-mark"><Icon name="book" :size="22" /></span><strong>mdnook<span class="brand-dot">.</span></strong></div>
      <h1 id="login-title">登录文档空间</h1>
      <p v-if="loading" class="login-description" role="status">正在检查访问权限…</p>
      <template v-else>
        <p class="login-description">使用启动此服务的系统账号和密码登录。</p>
        <p v-if="session && !session.loginAvailable" class="login-error" role="alert">当前连接需要 HTTPS，请使用服务的 HTTPS 地址登录。</p>
        <form v-else-if="session" @submit.prevent="login">
          <label class="login-field">系统账号<input v-model="username" name="username" autocomplete="username" placeholder="系统用户名或 域\用户名" required maxlength="256" :disabled="busy" autofocus /></label>
          <label class="login-field">密码<input v-model="password" name="password" type="password" autocomplete="current-password" placeholder="系统账号密码" required maxlength="1024" :disabled="busy" /></label>
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          <button class="login-submit" type="submit" :disabled="busy">{{ busy ? '正在验证…' : '登录' }}</button>
        </form>
        <template v-else><p class="login-error" role="alert">{{ error }}</p><button class="login-submit" @click="loading = true; refreshSession()">重试</button></template>
        <p class="login-note">本机回环访问自动放行。远程会话有效期为 30 分钟。</p>
      </template>
    </section>
  </main>
</template>
