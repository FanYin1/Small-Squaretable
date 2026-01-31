<script setup lang="ts">
import { reactive, watch, ref } from 'vue';
import type { User } from '@client/types';
import type { FormInstance, FormRules } from 'element-plus';

const props = defineProps<{
  user: User;
  editMode: boolean;
}>();

const emit = defineEmits<{
  save: [data: { name: string }];
  cancel: [];
}>();

const formRef = ref<FormInstance>();
const form = reactive({
  name: props.user.name,
  email: props.user.email,
});

watch(
  () => props.user,
  (newUser) => {
    form.name = newUser.name;
    form.email = newUser.email;
  },
  { immediate: true }
);

const rules: FormRules = {
  name: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名需要 2-20 个字符', trigger: 'blur' },
  ],
};

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  emit('save', { name: form.name });
}

function handleCancel() {
  form.name = props.user.name;
  emit('cancel');
}
</script>

<template>
  <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
    <el-form-item label="用户名" prop="name">
      <el-input v-model="form.name" :disabled="!editMode" />
    </el-form-item>

    <el-form-item label="邮箱">
      <el-input v-model="form.email" disabled />
      <template #extra>
        <span class="form-tip">邮箱不可修改</span>
      </template>
    </el-form-item>

    <el-form-item label="注册时间">
      <span>{{ new Date(user.createdAt).toLocaleDateString('zh-CN') }}</span>
    </el-form-item>

    <el-form-item v-if="editMode">
      <el-button type="primary" @click="handleSave">保存</el-button>
      <el-button @click="handleCancel">取消</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
