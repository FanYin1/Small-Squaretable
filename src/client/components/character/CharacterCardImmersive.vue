<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { Character } from '@client/types';
import { cleanDescription } from '@client/utils/sillytavern';

/**
 * 沉浸叙事向角色卡（样板）
 *
 * 与 CharacterCard.vue 的关键差异：
 * - 立绘作为封面铺满整卡，而非 80px 居中头像
 * - 文字压在渐变遮罩上，信息层级靠明度而非分隔线
 * - 零 Element Plus 依赖（原卡片有 4 个 el-*），视觉无约束
 * - 悬停时封面轻微推近 + 简介展开，静态时只留「名字 + 评分」
 */
const props = defineProps<{
  character: Character;
}>();

const router = useRouter();
const { t } = useI18n();

const imgLoaded = ref(false);
const imgFailed = ref(false);

// Character 类型只有 avatar，无独立立绘字段；用 avatar 作封面。
const coverUrl = computed(
  () =>
    props.character.avatar ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.character.id}`
);

const description = computed(
  () =>
    cleanDescription(props.character.description, props.character.name, 120) ||
    t('market.noDescription')
);

const hasRating = computed(
  () => typeof props.character.rating === 'number' && props.character.rating > 0
);

const ratingDisplay = computed(() =>
  hasRating.value ? props.character.rating!.toFixed(1) : null
);

const visibleTags = computed(() => props.character.tags?.slice(0, 2) ?? []);

function openDetail() {
  router.push({ name: 'CharacterDetail', params: { id: props.character.id } });
}

function startChat(e: Event) {
  e.stopPropagation();
  router.push({ name: 'Chat', query: { characterId: props.character.id } });
}
</script>

<template>
  <!-- character-card 是保留给 E2E 的稳定选择器钩子（e2e/character-market-interactions.spec.ts
       按此定位卡片）。样式一律走 im-card__*，两者互不干扰。 -->
  <article
    class="im-card character-card"
    role="button"
    tabindex="0"
    :aria-label="character.name"
    @click="openDetail"
    @keydown.enter="openDetail"
    @keydown.space.prevent="openDetail"
  >
    <!-- 封面：立绘铺满，焦点偏上以保留面部。
         avatar-section 是 E2E 的历史选择器钩子（原卡片的头像容器）。 -->
    <div class="im-card__cover avatar-section">
      <img
        :src="coverUrl"
        :alt="character.name"
        class="im-card__img"
        :class="{ 'is-loaded': imgLoaded }"
        loading="lazy"
        decoding="async"
        @load="imgLoaded = true"
        @error="imgFailed = true"
      />
      <div v-if="!imgLoaded && !imgFailed" class="im-card__shimmer" aria-hidden="true" />
      <div class="im-card__scrim" aria-hidden="true" />
    </div>

    <!-- NSFW 角标：右上，克制 -->
    <span v-if="character.isNsfw" class="im-card__flag">18+</span>

    <!-- 信息层：压在遮罩上 -->
    <div class="im-card__body">
      <div v-if="visibleTags.length" class="im-card__tags tags">
        <span v-for="tag in visibleTags" :key="tag" class="im-card__tag">{{ tag }}</span>
      </div>

      <h3 class="im-card__name character-name">{{ character.name }}</h3>

      <!-- 简介默认收起，悬停/聚焦展开 -->
      <p class="im-card__desc character-description">{{ description }}</p>

      <div class="im-card__meta">
        <span v-if="ratingDisplay" class="im-card__rating rating">
          <svg viewBox="0 0 16 16" class="im-card__star" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 1.5l1.9 4 4.4.6-3.2 3.1.8 4.3L8 11.5l-3.9 2 .8-4.3L1.7 6.1l4.4-.6z"
            />
          </svg>
          {{ ratingDisplay }}
          <span v-if="character.ratingCount" class="im-card__rating-count">
            {{ character.ratingCount }}
          </span>
        </span>
        <span v-else class="im-card__rating rating im-card__rating--empty">
          {{ t('market.noRating') }}
        </span>

        <button class="im-card__cta" type="button" @click="startChat">
          {{ t('market.startChat') }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.im-card {
  position: relative;
  display: block;
  width: 100%;
  /* 竖构图，贴合角色立绘 */
  aspect-ratio: 3 / 4;
  border-radius: var(--im-radius-lg);
  overflow: hidden;
  cursor: pointer;
  background: var(--im-surface);
  border: 1px solid var(--im-border);
  transition:
    border-color var(--im-dur) var(--im-ease),
    transform var(--im-dur) var(--im-ease);
  isolation: isolate;
}

.im-card:hover,
.im-card:focus-visible {
  border-color: var(--im-border-accent);
  transform: translateY(-3px);
}

.im-card:focus-visible {
  outline: none;
  box-shadow: var(--im-focus-ring);
}

/* ---------- 封面 ---------- */
.im-card__cover {
  position: absolute;
  inset: 0;
  background: var(--im-sunken);
}

.im-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 焦点偏上，避免裁掉面部 */
  object-position: 50% 22%;
  opacity: 0;
  transition:
    opacity 420ms var(--im-ease),
    transform 620ms var(--im-ease);
}

.im-card__img.is-loaded {
  opacity: 1;
}

.im-card:hover .im-card__img {
  transform: scale(1.045);
}

.im-card__shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    var(--im-surface) 20%,
    var(--im-raised) 50%,
    var(--im-surface) 80%
  );
  background-size: 220% 100%;
  animation: im-shimmer 1.4s infinite linear;
}

@keyframes im-shimmer {
  from {
    background-position: 220% 0;
  }
  to {
    background-position: -220% 0;
  }
}

.im-card__scrim {
  position: absolute;
  inset: 0;
  background: var(--im-scrim);
}

/* ---------- NSFW 角标 ---------- */
.im-card__flag {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  padding: 3px 8px;
  font-size: var(--im-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--im-content);
  background: rgba(10, 9, 8, 0.7);
  border: 1px solid var(--im-border-strong);
  border-radius: var(--im-radius-pill);
  backdrop-filter: blur(6px);
}

/* ---------- 信息层 ---------- */
.im-card__body {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  /* 顶部多留 10px：给 ::before 的淡出段留位置，文字不会落进半透明区 */
  padding: 26px 16px 15px;
}

/*
 * 文字底衬。跟着文字块高度走（简介展开时自动变高），保证最坏情况
 * ——纯白立绘——下文字仍有 ≥0.90 的暗底，实测 faint 4.60:1 过 AA。
 * 若只靠整卡 --im-scrim，卡片变高时文字会漂到淡区从而跌破 AA。
 */
.im-card__body::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--im-scrim-text);
  pointer-events: none;
}

.im-card__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.im-card__tag {
  padding: 2px 8px;
  font-size: var(--im-text-xs);
  font-weight: 500;
  color: var(--im-accent);
  background: var(--im-accent-wash);
  border: 1px solid var(--im-border-accent);
  border-radius: var(--im-radius-pill);
}

.im-card__name {
  margin: 0;
  font-family: var(--im-font-display);
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--im-content);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 简介：静态收起，悬停展开 —— 静态时画面让给立绘 */
.im-card__desc {
  margin: 0;
  font-size: var(--im-text-sm);
  line-height: 1.55;
  color: var(--im-content-muted);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition:
    max-height var(--im-dur) var(--im-ease),
    opacity var(--im-dur) var(--im-ease);
}

.im-card:hover .im-card__desc,
.im-card:focus-visible .im-card__desc {
  max-height: 44px;
  opacity: 1;
}

.im-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}

.im-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--im-text-sm);
  font-weight: 500;
  color: var(--im-content);
}

.im-card__rating--empty {
  color: var(--im-content-faint);
  font-weight: 400;
}

.im-card__star {
  width: 13px;
  height: 13px;
  color: var(--im-accent);
}

.im-card__rating-count {
  color: var(--im-content-faint);
  font-weight: 400;
}

/* CTA：琥珀底 + 深炭字（AA 达标），静态低调、悬停显形 */
.im-card__cta {
  flex-shrink: 0;
  padding: 7px 15px;
  font-family: inherit;
  font-size: var(--im-text-sm);
  font-weight: 600;
  color: var(--im-accent);
  background: transparent;
  border: 1px solid var(--im-border-accent);
  border-radius: var(--im-radius-pill);
  cursor: pointer;
  transition:
    background var(--im-dur) var(--im-ease),
    color var(--im-dur) var(--im-ease),
    border-color var(--im-dur) var(--im-ease);
}

.im-card:hover .im-card__cta {
  color: var(--im-accent-on);
  background: var(--im-accent);
  border-color: var(--im-accent);
}

.im-card__cta:hover {
  background: var(--im-accent-hover);
  border-color: var(--im-accent-hover);
}

.im-card__cta:active {
  background: var(--im-accent-press);
  border-color: var(--im-accent-press);
}

.im-card__cta:focus-visible {
  outline: none;
  box-shadow: var(--im-focus-ring);
}

/* ---------- 触屏：无悬停，简介常驻 ---------- */
@media (hover: none) {
  .im-card__desc {
    max-height: 44px;
    opacity: 1;
  }

  .im-card__cta {
    color: var(--im-accent-on);
    background: var(--im-accent);
    border-color: var(--im-accent);
    /* 触控目标不小于 44px 高 */
    padding: 10px 16px;
  }
}

@media (max-width: 480px) {
  .im-card__name {
    font-size: 18px;
  }

  .im-card__body {
    /* 顶部同样保留淡出余量（见 .im-card__body::before） */
    padding: 22px 13px 13px;
  }
}
</style>
