import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/browse' },
    { path: '/browse', component: App },
    { path: '/document', component: App },
    { path: '/:pathMatch(.*)*', redirect: '/browse' },
  ],
})
createApp(App).use(router).mount('#app')
