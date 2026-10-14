import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import AuthGate from './AuthGate.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/browse' },
    { path: '/browse', component: App },
    { path: '/document', component: App },
    { path: '/file', component: App },
    { path: '/:pathMatch(.*)*', redirect: '/browse' },
  ],
})
createApp(AuthGate).use(router).mount('#app')
