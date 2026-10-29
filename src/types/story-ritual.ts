import { storyRulesSchema, type StoryValues } from './story-state';

export const ritualEffect = 'kakaa-ritual-v1' as const;
export const ritualIdentityEffect = 'kakaa-ritual-v2' as const;
export type RitualEffect = typeof ritualEffect | typeof ritualIdentityEffect;
export const ritualSourceDigest = 'abff9569b80f2c95e544aee43cb03bcac172e45794f6827988998b6c10e74265';
export const ritualExplanation = '仅适配咔咔的力量：从0开始，每轮已确认且完整保存的对话后+3；开场、待确认行动、中断和重复回执不计数。不是玩家属性，不包含战斗、伤害或其他玩法。';

export function ritualScope(effect: RitualEffect = ritualEffect): string {
  return effect === ritualIdentityEffect
    ? `${ritualExplanation}另支持原卡中明确自我声明触发的角色回应变化：仅识别完整、直接的三种声明句式，不识别引述、否定、假设或提问；未触发前隐藏对应记录。声明是玩家说过的话，不代表世界已证实其身份；没有自动战斗、交易或一次性奖励。`
    : ritualExplanation;
}

export function ritualRules(effect: RitualEffect = ritualEffect) {
  return storyRulesSchema.parse({ version: 1, summary: ritualScope(effect),
    fields: [{ id: 'kakaa-strength', label: '咔咔的力量（角色）', type: 'number', initial: 0 },
      ...(effect === ritualIdentityEffect ? [{ id: 'kakaa-identity-claim', label: '已向咔咔自称鸟神', type: 'boolean', initial: false,
        visibleWhen: [{ field: 'kakaa-identity-claim', operator: 'eq', value: true }] }] : [])], actions: [] });
}

export function ritualIdentityClaim(input: string): boolean {
  return /^(?:我是鸟神|我就是鸟神|我自称鸟神)[。！!.]?$/.test(input.trim());
}

export function applyRitualTurn(effect: RitualEffect | undefined, values: StoryValues, input?: string): StoryValues {
  if (!effect) return values;
  const previous = values['kakaa-strength'];
  if (typeof previous !== 'number' || !Number.isSafeInteger(previous) || previous < 0 || previous % 3 !== 0
    || !Number.isSafeInteger(previous + 3)) throw new Error('Invalid saved ritual strength');
  if (effect === ritualIdentityEffect) {
    if (typeof input !== 'string' || typeof values['kakaa-identity-claim'] !== 'boolean') throw new Error('Missing saved identity claim source');
    return { ...values, 'kakaa-strength': previous + 3,
      'kakaa-identity-claim': values['kakaa-identity-claim'] || ritualIdentityClaim(input) };
  }
  return { ...values, 'kakaa-strength': previous + 3 };
}
