<script setup lang="ts">
import { ref } from 'vue';

const message = ref('Small Squaretable - Frontend MVP');
</script>

<template>
  <div class="app-container">
    <el-container>
      <el-header>
        <h1>{{ message }}</h1>
      </el-header>
      <el-main>
        <el-card class="welcome-card">
          <template #header>
            <div class="card-header">
              <span>Welcome to Small Squaretable</span>
            </div>
          </template>
          <p>Vue 3 + TypeScript + Element Plus + Vite</p>
          <p>Frontend initialization successful!</p>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  width: 100%;
}

.el-header {
  background-color: #409eff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.el-main {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f7fa;
}

.welcome-card {
  width: 500px;
  text-align: center;
}

.card-header {
  font-weight: bold;
  font-size: 18px;
}
</style>
