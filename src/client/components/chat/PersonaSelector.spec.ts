import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ApiError } from '@client/services/api';
import PersonaSelector from './PersonaSelector.vue';
import i18n from '../../i18n';

const personaActions = vi.hoisted(() => ({
  listPersonas: vi.fn(),
  createPersona: vi.fn(),
}));

vi.mock('@client/services/user-persona.api', () => ({
  userPersonaApi: {
    list: personaActions.listPersonas,
    create: personaActions.createPersona,
  },
}));

const stubs = {
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
  },
  'el-button': {
    props: ['disabled', 'loading', 'nativeType'],
    emits: ['click'],
    template: '<button :type="nativeType || \'button\'" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-avatar': { template: '<div class="avatar"><slot /></div>' },
  'el-icon': { template: '<span><slot /></span>' },
};

const persona = {
  id: 'persona-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  name: '林默',
  description: '观察者',
  avatarUrl: null,
  metadata: {},
  isDefault: true,
  createdAt: '',
  updatedAt: '',
};

describe('PersonaSelector', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.resetAllMocks();
    personaActions.listPersonas.mockResolvedValue([persona]);
    personaActions.createPersona.mockResolvedValue({ ...persona, id: 'persona-new', name: '新身份', isDefault: false });
  });

  afterEach(() => wrapper?.unmount());

  function mountSelector(props: Record<string, unknown> = {}) {
    wrapper = mount(PersonaSelector, {
      props: { modelValue: true, storyMode: true, ...props },
      global: { plugins: [i18n], stubs, directives: { loading: () => {} } },
    });
    return wrapper;
  }

  function button(key: string) {
    const match = wrapper.findAll('button').find((candidate) => candidate.text() === i18n.global.t(key));
    expect(match).toBeDefined();
    return match!;
  }

  it.each(['empty', 'failed'])('allows starting without identity when the list is %s', async (state) => {
    if (state === 'empty') personaActions.listPersonas.mockResolvedValue([]);
    else personaActions.listPersonas.mockRejectedValue(new Error('offline'));
    mountSelector();
    await flushPromises();
    await button('personas.continueWithout').trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('confirm')![0]).toEqual([]);
    expect(personaActions.createPersona).not.toHaveBeenCalled();
  });

  it('resets the form and selection after reopening with an empty list', async () => {
    mountSelector();
    await flushPromises();
    await wrapper.get('.create-persona-link').trigger('click');
    await wrapper.get('input').setValue('旧名字');
    await wrapper.setProps({ modelValue: false });
    personaActions.listPersonas.mockResolvedValue([]);
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('.persona-item').exists()).toBe(false);
    await button('personas.createFirst').trigger('click');
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
  });

  it('ignores an old list response after reopening', async () => {
    let resolveOld!: (value: typeof persona[]) => void;
    personaActions.listPersonas.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    mountSelector();
    await wrapper.setProps({ modelValue: false });
    personaActions.listPersonas.mockResolvedValue([]);
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    resolveOld([persona]);
    await flushPromises();
    expect(wrapper.find('.persona-item').exists()).toBe(false);
  });

  it('keeps the new identity selected when chat submission fails', async () => {
    mountSelector();
    await flushPromises();
    await wrapper.get('.create-persona-link').trigger('click');
    await wrapper.get('input').setValue('新身份');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await wrapper.setProps({ submissionError: 'Please retry' });
    await button('common.confirm').trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([['persona-new'], ['persona-new']]);
    expect(personaActions.createPersona).toHaveBeenCalledTimes(1);
  });

  it('keeps entered text and permits retry after a validation rejection', async () => {
    personaActions.createPersona.mockRejectedValueOnce(new ApiError(400, 'INVALID_INPUT', 'Invalid name'));
    mountSelector();
    await flushPromises();
    await wrapper.get('.create-persona-link').trigger('click');
    await wrapper.get('input').setValue('新身份');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('新身份');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(personaActions.createPersona).toHaveBeenCalledTimes(2);
  });

  it('emits a selected persona without closing the dialog', async () => {
    const mounted = mountSelector();
    await flushPromises();

    await mounted.get('.persona-item').trigger('click');
    const confirmButton = mounted.findAll('button').find((button) => button.text() === i18n.global.t('common.confirm'));
    await confirmButton?.trigger('click');

    expect(mounted.emitted('confirm')).toContainEqual(['persona-1']);
    expect(mounted.emitted('update:modelValue')).toBeUndefined();
  });

  it('creates a new identity and keeps the result available for chat retry', async () => {
    const mounted = mountSelector({});
    await flushPromises();
    await mounted.get('.create-persona-link').trigger('click');
    await mounted.get('#story-persona-name').setValue('新身份');
    await mounted.get('form').trigger('submit');
    await flushPromises();

    expect(personaActions.createPersona).toHaveBeenCalledWith({ name: '新身份', description: undefined });
    expect(mounted.emitted('confirm')).toContainEqual(['persona-new']);
    expect(mounted.emitted('update:modelValue')).toBeUndefined();
    expect(mounted.find('.persona-item').text()).toContain('新身份');
  });

  it('blocks another identity creation when the request result is uncertain', async () => {
    personaActions.createPersona.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    const mounted = mountSelector();
    await flushPromises();
    await mounted.get('.create-persona-link').trigger('click');
    await mounted.get('#story-persona-name').setValue('可能已保存');
    await mounted.get('form').trigger('submit');
    await flushPromises();

    expect(mounted.get('[role="alert"]').text()).toContain('result is unknown');
    const submit = mounted.get('button[type="submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
    expect(personaActions.createPersona).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action when the persona list fails', async () => {
    personaActions.listPersonas.mockRejectedValueOnce(new Error('offline'));
    const mounted = mountSelector();
    await flushPromises();
    expect(mounted.get('[role="alert"]').text()).toContain('Failed to load personas');

    await mounted.get('.load-error button').trigger('click');
    await flushPromises();
    expect(mounted.find('.persona-item').exists()).toBe(true);
    expect(personaActions.listPersonas).toHaveBeenCalledTimes(2);
  });

  it('does not emit while chat creation is busy', async () => {
    const mounted = mountSelector({ busy: true });
    await flushPromises();
    const confirmButton = mounted.findAll('button').find((button) => button.text() === i18n.global.t('common.confirm'));
    expect((confirmButton?.element as HTMLButtonElement).disabled).toBe(true);
    await confirmButton?.trigger('click');
    expect(mounted.emitted('confirm')).toBeUndefined();
  });

  it('offers only navigation retry once the story is created', async () => {
    mountSelector({ navigationOnly: true });
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('story and identity are saved');
    expect(wrapper.find('.persona-item').exists()).toBe(false);
    expect(wrapper.find('.create-persona-link').exists()).toBe(false);
    expect(personaActions.listPersonas).not.toHaveBeenCalled();
    await button('common.retry').trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[]]);
    expect(personaActions.createPersona).not.toHaveBeenCalled();
  });

  it('locks identity changes and new identity creation while the story result is unknown', async () => {
    mountSelector({ blocked: true });
    await flushPromises();
    for (const selector of ['.persona-item', '.create-persona-link']) {
      expect((wrapper.get(selector).element as HTMLButtonElement).disabled).toBe(true);
    }
    await wrapper.get('.create-persona-link').trigger('click');
    expect(wrapper.find('form').exists()).toBe(false);
    await button('personas.continueWithout').trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
    expect(personaActions.createPersona).not.toHaveBeenCalled();
  });

  it('returns focus to the trigger when the dialog closes', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open story';
    document.body.appendChild(trigger);
    trigger.focus();
    mountSelector({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    vi.spyOn(trigger, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    await wrapper.setProps({ modelValue: false });
    wrapper.findComponent(stubs['el-dialog']).vm.$emit('closed');
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    other.remove();
  });
});
