/**
 * World Book Store
 *
 * Manages world book CRUD and entry management state
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createLogger } from '@client/utils/logger';
import { worldbookApi } from '@client/services/worldbook.api';
import type { WorldBookDto, WorldBookEntry, CreateWorldBookInput, CreateEntryInput } from '@client/services/worldbook.api';

const logger = createLogger('WorldBookStore');

export const useWorldBookStore = defineStore('worldbook', () => {
  const worldbooks = ref<WorldBookDto[]>([]);
  const currentWorldBook = ref<WorldBookDto | null>(null);
  const entries = ref<WorldBookEntry[]>([]);
  const loading = ref(false);
  const entriesLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchWorldBooks() {
    loading.value = true;
    error.value = null;
    try {
      worldbooks.value = await worldbookApi.list();
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch world books';
      logger.error('Failed to fetch world books', e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchWorldBook(id: string) {
    loading.value = true;
    error.value = null;
    try {
      currentWorldBook.value = await worldbookApi.get(id);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch world book';
      logger.error('Failed to fetch world book', e);
    } finally {
      loading.value = false;
    }
  }

  async function createWorldBook(data: CreateWorldBookInput) {
    loading.value = true;
    error.value = null;
    try {
      const created = await worldbookApi.create(data);
      worldbooks.value.push(created);
      return created;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to create world book';
      logger.error('Failed to create world book', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateWorldBook(id: string, data: Partial<CreateWorldBookInput & { isEnabled: boolean }>) {
    loading.value = true;
    error.value = null;
    try {
      const updated = await worldbookApi.update(id, data);
      const idx = worldbooks.value.findIndex((w) => w.id === id);
      if (idx !== -1) worldbooks.value[idx] = updated;
      if (currentWorldBook.value?.id === id) currentWorldBook.value = updated;
      return updated;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to update world book';
      logger.error('Failed to update world book', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteWorldBook(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await worldbookApi.delete(id);
      worldbooks.value = worldbooks.value.filter((w) => w.id !== id);
      if (currentWorldBook.value?.id === id) currentWorldBook.value = null;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to delete world book';
      logger.error('Failed to delete world book', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchEntries(worldbookId: string) {
    entriesLoading.value = true;
    error.value = null;
    try {
      entries.value = await worldbookApi.getEntries(worldbookId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch entries';
      logger.error('Failed to fetch entries', e);
    } finally {
      entriesLoading.value = false;
    }
  }

  async function createEntry(worldbookId: string, data: CreateEntryInput) {
    entriesLoading.value = true;
    error.value = null;
    try {
      const created = await worldbookApi.createEntry(worldbookId, data);
      entries.value.push(created);
      return created;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to create entry';
      logger.error('Failed to create entry', e);
      throw e;
    } finally {
      entriesLoading.value = false;
    }
  }

  async function updateEntry(worldbookId: string, entryId: string, data: Partial<CreateEntryInput & { isEnabled: boolean }>) {
    entriesLoading.value = true;
    error.value = null;
    try {
      const updated = await worldbookApi.updateEntry(worldbookId, entryId, data);
      const idx = entries.value.findIndex((e) => e.id === entryId);
      if (idx !== -1) entries.value[idx] = updated;
      return updated;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to update entry';
      logger.error('Failed to update entry', e);
      throw e;
    } finally {
      entriesLoading.value = false;
    }
  }

  async function deleteEntry(worldbookId: string, entryId: string) {
    entriesLoading.value = true;
    error.value = null;
    try {
      await worldbookApi.deleteEntry(worldbookId, entryId);
      entries.value = entries.value.filter((e) => e.id !== entryId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to delete entry';
      logger.error('Failed to delete entry', e);
      throw e;
    } finally {
      entriesLoading.value = false;
    }
  }

  return {
    worldbooks,
    currentWorldBook,
    entries,
    loading,
    entriesLoading,
    error,
    fetchWorldBooks,
    fetchWorldBook,
    createWorldBook,
    updateWorldBook,
    deleteWorldBook,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
});
