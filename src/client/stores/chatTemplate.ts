/**
 * Chat Template Store
 *
 * Manages chat template state (own + public templates)
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { chatTemplateApi, type ChatTemplate, type CreateTemplateInput } from '@client/services/chat-template.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('ChatTemplateStore');

export const useChatTemplateStore = defineStore('chatTemplate', () => {
  const ownTemplates = ref<ChatTemplate[]>([]);
  const publicTemplates = ref<ChatTemplate[]>([]);
  const loading = ref(false);

  async function fetchTemplates() {
    loading.value = true;
    try {
      const result = await chatTemplateApi.getTemplates();
      ownTemplates.value = result.own || [];
      publicTemplates.value = result.public || [];
    } catch (err) {
      logger.error('Failed to fetch templates', err);
    } finally {
      loading.value = false;
    }
  }

  async function createTemplate(data: CreateTemplateInput) {
    const template = await chatTemplateApi.createTemplate(data);
    ownTemplates.value.unshift(template);
    return template;
  }

  async function deleteTemplate(id: string) {
    await chatTemplateApi.deleteTemplate(id);
    ownTemplates.value = ownTemplates.value.filter(t => t.id !== id);
  }

  async function useTemplate(id: string) {
    return chatTemplateApi.useTemplate(id);
  }

  return { ownTemplates, publicTemplates, loading, fetchTemplates, createTemplate, deleteTemplate, useTemplate };
});
