import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import CollaboratorPanel from './CollaboratorPanel.vue';

vi.mock('@client/services/collaborator.api', () => ({
  collaboratorApi: {
    listCollaborators: vi.fn().mockResolvedValue([
      { id: 'c1', userId: 'u1', characterId: 'char-1', role: 'editor', userName: 'Alice', userAvatar: null, createdAt: '2026-01-01' },
      { id: 'c2', userId: 'u2', characterId: 'char-1', role: 'viewer', userName: 'Bob', userAvatar: null, createdAt: '2026-01-02' },
    ]),
    inviteCollaborator: vi.fn(),
    updateCollaboratorRole: vi.fn(),
    removeCollaborator: vi.fn(),
  },
}));

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(),
  },
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      collaboration: { collaborators: 'Collaborators', inviteCollaborator: 'Invite', noCollaborators: 'No collaborators', roleEditor: 'Editor', roleViewer: 'Viewer', removeCollaborator: 'Remove', collaboratorAdded: 'Added', collaboratorRemoved: 'Removed', searchUsers: 'Search' },
      common: { name: 'Name', confirm: 'Confirm', cancel: 'Cancel' },
    },
  },
});

const stubs = {
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'size', 'type', 'text', 'disabled'] },
  'el-icon': { template: '<span><slot /></span>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-input': { template: '<input />', props: ['modelValue', 'maxlength', 'placeholder'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue', 'size'] },
  'el-option': { template: '<option />', props: ['value', 'label'] },
  'el-avatar': { template: '<div><slot /></div>', props: ['src', 'size'] },
  'el-tag': { template: '<span><slot /></span>', props: ['type', 'size'] },
  'el-empty': { template: '<div />', props: ['description', 'image-size'] },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
};

describe('CollaboratorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collaborator list with names and roles', async () => {
    const wrapper = mount(CollaboratorPanel, {
      props: { characterId: 'char-1', isOwner: false },
      global: { plugins: [i18n], stubs },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Bob');
    expect(wrapper.text()).toContain('Editor');
    expect(wrapper.text()).toContain('Viewer');
  });

  it('shows invite button when isOwner is true', async () => {
    const wrapper = mount(CollaboratorPanel, {
      props: { characterId: 'char-1', isOwner: true },
      global: { plugins: [i18n], stubs },
    });

    await flushPromises();

    const buttons = wrapper.findAll('button');
    const inviteButton = buttons.find((b) => b.text().includes('Invite'));
    expect(inviteButton).toBeTruthy();
  });

  it('hides invite button when isOwner is false', async () => {
    const wrapper = mount(CollaboratorPanel, {
      props: { characterId: 'char-1', isOwner: false },
      global: { plugins: [i18n], stubs },
    });

    await flushPromises();

    const buttons = wrapper.findAll('button');
    const inviteButton = buttons.find((b) => b.text().includes('Invite'));
    expect(inviteButton).toBeUndefined();
  });
});
