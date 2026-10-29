<template>
  <div class="chat-window is-exploration">
    <div class="chat-header" v-if="currentChat">
      <div class="chat-info">
        <RouterLink class="story-back" to="/chat" aria-label="返回我的故事">← 我的故事</RouterLink>
        <!-- Group chat: stacked avatars + character count -->
        <template v-if="isGroupChat">
          <div class="stacked-avatars">
            <el-avatar
              v-for="(char, idx) in chatStore.chatCharacters.slice(0, 3)"
              :key="char.id"
              :size="32"
              :src="char.avatar"
              :style="{ marginLeft: idx > 0 ? '-10px' : '0', zIndex: 3 - idx }"
              class="stacked-avatar"
            >{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          </div>
          <div class="chat-details">
            <h3 class="chat-title">{{ currentChat.title || currentChat.characterName }}</h3>
            <span class="chat-subtitle">{{ t('groupChat.characters', { count: chatStore.chatCharacters.length }) }}</span>
          </div>
        </template>
        <!-- Single chat: original display -->
        <template v-else>
          <div class="chat-details">
            <h3 class="chat-title">{{ currentChat.title || currentChat.characterName }}</h3>
            <span class="chat-subtitle">{{ currentChat.characterName }} · {{ storyUserName }}<template v-if="storyState?.map?.location"> · {{ storyState.map.nodes.find(node => node.id === storyState?.map?.location)?.label }}</template></span>
          </div>
        </template>
      </div>
      <StoryCorrections v-if="userStore.user" :key="`${userStore.user.id}:${currentChat.id}`" ref="correctionsPanel" :chat-id="currentChat.id" :owner-id="userStore.user.id" :messages="messages" @readings="storyReadings = $event" />
      <el-dropdown trigger="click" @command="handleMenuCommand">
        <el-button link :icon="More" :aria-label="t('storyShell.storyActions')">{{ t('storyShell.storyActions') }}</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="search">{{ t('chat.searchMessages') }}</el-dropdown-item>
            <el-dropdown-item command="export-json">{{ t('chat.exportJson') }}</el-dropdown-item>
            <el-dropdown-item command="export-md">{{ t('chat.exportMarkdown') }}</el-dropdown-item>
            <el-dropdown-item command="export-txt">{{ t('chat.exportText') }}</el-dropdown-item>
            <el-dropdown-item command="rename" divided>{{ t('chat.renameTitle') }}</el-dropdown-item>
            <el-dropdown-item command="delete" divided>{{ t('chat.deleteTitle') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <details class="reading-settings">
        <summary>{{ t('storyShell.readingSettings') }}</summary>
        <div class="reading-settings-body">
          <p>{{ t(currentChat?.identitySnapshot ? 'personas.storyIdentityFixed' : 'personas.storyIdentityLegacy') }}</p>
          <p v-if="currentChat?.worldbookSnapshotVersion === 1">{{ t('chat.savedWorldbooks') }}</p>
          <p v-if="currentChat?.contentSnapshotVersion === 1">{{ t('chat.savedContent') }}</p>
          <ul v-if="chatStore.currentCharacter?.compatibility?.issues.length" aria-label="当前故事兼容范围">
            <li v-for="issue in chatStore.currentCharacter.compatibility.issues" :key="issue">{{ storyCapabilityMessages[issue] }}</li>
          </ul>
          <template v-for="participant in chatStore.chatCharacters" :key="participant.id">
            <section v-if="participant.diagnostics" :aria-label="`${participant.name}的冻结诊断`">
              <strong>{{ participant.name }}</strong>
              <StoryDiagnosticsView :report="participant.diagnostics" frozen />
              <ul v-if="participant.id !== chatStore.currentCharacter?.id && participant.diagnostics.capabilities.issues.length">
                <li v-for="issue in participant.diagnostics.capabilities.issues" :key="issue">{{ storyCapabilityMessages[issue] }}</li>
              </ul>
            </section>
          </template>
          <p v-if="currentChat?.contentSnapshotVersion === 1 && !chatStore.currentCharacter?.diagnostics">此旧档未保存开局绑定诊断，不用当前资料补造当时的检查结果。</p>
          <p v-if="currentChat?.contentSnapshotVersion == null">历史故事保留原有正文与设定方式，不补造状态或地图。旧脚本桥接仅提供有限兼容，临时变量写入不会保存为故事状态；外部脚本资源与未实现的接口不可用。</p>
          <div class="reading-font-controls" role="group" :aria-label="t('storyShell.fontSize')">
            <button v-for="(font, index) in readingSizes" :key="font" type="button" :aria-pressed="readingSize === font" @click="setReadingSize(font)">{{ [15, 17, 19][index] }}px</button>
          </div>
          <p v-if="currentChat?.contentSnapshotVersion == null" class="reading-emotion">{{ emotionEmoji }} {{ intelligenceStore.emotionLabel }}</p>
      <div class="chat-actions">
        <!-- Token Counter -->
        <ChatTokenCounter @show-context-viewer="showContextViewerDialog" />

        <el-tooltip v-if="isGroupChat && currentChat?.contentSnapshotVersion == null" :content="t('groupChat.manageCharacters')" placement="bottom">
          <el-button size="small" text @click="showManageDialog = true">{{ t('groupChat.manageCharacters') }}</el-button>
        </el-tooltip>
        <el-segmented
          v-if="isGroupChat"
          :model-value="groupStrategy"
          :options="strategyOptions"
          size="small"
          @change="handleStrategyChange"
        />
        <el-select
          v-if="chatStore.availableModels.length > 0 && currentChat"
          :model-value="chatStore.currentModel"
          size="small"
          class="model-select"
          :aria-label="t('storyShell.modelOptions')"
          @change="handleModelChange"
        >
          <el-option
            v-for="m in chatStore.availableModels"
            :key="m.id"
            :label="m.id"
            :value="m.id"
          >
            <span>{{ m.id }}</span>
            <span style="float: right; color: var(--el-text-color-secondary); font-size: 12px">
              {{ formatContextWindow(m.contextWindow) }}
            </span>
          </el-option>
        </el-select>
        <el-dropdown trigger="click" @command="handleToolsDropdown">
          <el-button text size="small" class="tools-btn" :aria-label="t('chat.tools')" :title="t('chat.tools')">{{ t('chat.tools') }}</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="tuner">{{ t('chat.parameterTuning') }}</el-dropdown-item>
              <el-dropdown-item command="memory">{{ t('chat.memory') }}</el-dropdown-item>
              <el-dropdown-item v-if="currentChat?.contentSnapshotVersion == null" command="debug">
                {{ t('chat.debug') }}
                <el-badge v-if="intelligenceStore.debugEventCount > 0" :value="intelligenceStore.debugEventCount" :max="99" style="margin-left: 8px" />
              </el-dropdown-item>
              <el-dropdown-item v-if="currentChat?.characterId" command="growth">{{ t('character.growth') }}</el-dropdown-item>
              <el-dropdown-item command="pinned">{{ t('chat.pinnedMessages') }}</el-dropdown-item>
              <el-dropdown-item divided command="search">{{ t('chat.searchMessages', 'Search') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="handleExportDropdown">
          <el-button text :aria-label="t('common.export')" :title="t('common.export')">
            <el-icon><Download /></el-icon>
            {{ t('common.export') }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">{{ t('chat.exportJson') }}</el-dropdown-item>
              <el-dropdown-item command="txt">{{ t('chat.exportTxt') }}</el-dropdown-item>
              <el-dropdown-item command="snapshot" divided>{{ t('share.createSnapshot') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
        </div>
      </details>
    </div>

    <div v-if="showSearch" class="chat-search-bar">
      <el-input
        v-model="chatStore.searchQuery"
        :placeholder="t('chat.searchMessages')"
        clearable
        size="small"
        @input="handleSearchInput"
        @clear="chatStore.clearSearch()"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span v-if="chatStore.searchResults.length" class="search-count">
        {{ chatStore.searchResults.length }} {{ t('chat.results') }}
      </span>
    </div>

    <div class="story-play-layout">
    <StoryBranchNavigator v-if="currentChat && userStore.user" :key="`${userStore.user.id}:${currentChat.id}`" :chat-id="currentChat.id" :owner-id="userStore.user.id" />
    <main class="story-reading">
    <div v-if="readingPosition.restoring.value || readingPosition.notice.value" class="reading-position-status" role="status">
      <span>{{ readingPosition.restoring.value ? '正在找回上次阅读的位置…' : readingPosition.notice.value }}</span>
      <button type="button" @click="readingPosition.returnToLatest">返回最新</button>
    </div>
    <div class="chat-messages" ref="messagesContainer" @scroll="handleScroll" aria-live="polite"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Pull-to-refresh indicator -->
      <div class="pull-refresh-indicator" :class="{ active: pullRefreshState === 'ready', pulling: pullRefreshState === 'pulling', refreshing: pullRefreshState === 'refreshing' }" :style="{ transform: `translateY(${pullDistance}px)`, opacity: pullDistance > 0 ? 1 : 0 }">
        <div v-if="pullRefreshState === 'refreshing'" class="pull-refresh-spinner">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-else class="pull-refresh-arrow" :style="{ transform: pullRefreshState === 'ready' ? 'rotate(180deg)' : 'rotate(0deg)' }">
          &#8595;
        </div>
        <span class="pull-refresh-text">{{ pullRefreshText }}</span>
      </div>

      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <template v-else>
        <ExpressionSprite
          v-if="characterExpressions"
          :expressions="characterExpressions"
          :emotion-label="intelligenceStore.emotionLabel || 'neutral'"
        />

        <div v-if="greetingIdentityBlocked" class="greeting-container">
          <p v-if="identityLoading" role="status">{{ t('personas.loadingStoryIdentity') }}</p>
          <div v-else role="alert">
            <p>{{ t('personas.storyIdentityLoadFailed') }}</p>
            <el-button @click="reloadIdentity">{{ t('personas.retryStoryIdentity') }}</el-button>
          </div>
        </div>
        <div v-else-if="messages.length === 0 && currentGreeting" class="greeting-container"
          @touchstart="onGreetingTouchStart"
          @touchend="onGreetingTouchEnd"
        >
        <div class="message-bubble message-assistant greeting-bubble">
          <div class="message-content">
            <MarkdownRenderer :content="currentGreeting" :interactive-html="currentChat?.contentSnapshotVersion == null" />
          </div>
        </div>
        <div v-if="hasAlternateGreetings" class="greeting-swipe">
          <button class="swipe-btn" :aria-label="t('chat.previousGreeting') || 'Previous greeting'" @click="prevGreeting" :disabled="greetingIndex <= 0">
            <span>&lt;</span>
          </button>
          <span class="swipe-indicator">{{ greetingIndex + 1 }} / {{ totalGreetings }}</span>
          <button class="swipe-btn" :aria-label="t('chat.nextGreeting') || 'Next greeting'" @click="nextGreeting" :disabled="greetingIndex >= totalGreetings - 1">
            <span>&gt;</span>
          </button>
        </div>
        <div v-if="hasAlternateGreetings" class="greeting-preview">
          <span class="greeting-preview-text">{{ greetingPreview }}</span>
        </div>
      </div>

      <div v-else-if="messages.length === 0" class="empty-state">
        <el-empty :description="t('chat.noMessages')" />
      </div>

      <div v-else class="messages-list">
        <div v-if="chatStore.loadingOlder" class="loading-older">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ t('chat.loadingOlder') }}</span>
        </div>
        <div v-else-if="!chatStore.hasMoreMessages && messages.length > 0" class="no-more-messages">
          <span>{{ t('chat.noMoreMessages') }}</span>
        </div>

        <!-- Top spacer for virtual scroll -->
        <div :style="{ height: topSpacerHeight + 'px' }" aria-hidden="true" />

        <template v-for="(message, vIdx) in visibleMessages" :key="message.id">
          <DateDivider
            v-if="shouldShowDateDivider(visibleRange.start + vIdx)"
            :label="getDateLabel(message.createdAt)"
          />
          <div
            v-observe-height
            :data-message-id="String(message.id)"
            class="message-wrapper"
          >
            <MessageBubble
              :message="message"
              :reading-content="storyReadings.filter(reading => reading.kind === 'layout' && reading.messageId === Number(message.id)).at(-1)?.content"
              :history-fixed="currentChat?.contentSnapshotVersion != null"
              :can-correct="!!userStore.user"
              :audience-names="Array.isArray(message.extra?.storyAudience) ? message.extra.storyAudience.map((id: string) => chatStore.chatCharacters.find(character => character.id === id)?.name || '未知人物') : undefined"
              :character-avatar="getMessageCharacterAvatar(message)"
              :character-name="getMessageCharacterName(message)"
              :user-avatar="userStore.user?.avatar"
              :user-name="userStore.user?.name"
              :editing="editingMessageId === message.id"
              :voice-config="characterVoiceConfig"
              :branch-info="chatStore.getBranchInfo(Number(message.id))"
              :regex-scripts="message.role === 'assistant' && message.extra?.stateStatus !== 'proposed' && !message.extra?.storyIntentInvalid ? getMessageRegexScripts(message) : undefined"
              @delete="handleDeleteMessage"
              @edit="handleEditMessage"
              @regenerate="handleRegenerateMessage"
              @save-edit="handleSaveEdit"
              @cancel-edit="handleCancelEdit"
              @rollback="handleRollback"
              @switch-branch="handleSwitchBranch"
              @reply="chatStore.setReplyTo($event)"
              @toggle-pin="handleTogglePin($event)"
              @set-importance="handleSetImportance($event)"
              @correct="correctionsPanel?.openFor(Number($event))"
            />
            <div v-if="storyReadings.some(item => item.messageId === Number(message.id))" class="story-reading-actions">
              <aside v-for="reading in storyReadings.filter(item => item.messageId === Number(message.id))" :key="reading.id" :aria-label="reading.kind === 'annotation' ? '阅读标注' : '已采用排版'">
                <span>{{ reading.kind === 'annotation' ? `阅读标注：${reading.content}` : '已采用段落排版，模型仍使用原文。' }}</span>
                <button type="button" @click="undoReading(reading.id)">撤销</button>
              </aside>
            </div>
            <StoryIntentReview v-if="latestStoryIntent?.messageId === Number(message.id)" :candidate="latestStoryIntent.candidate" :busy="actionBlocked" :stale="storyState?.version !== latestStoryIntent.candidate.expectedVersion" :actions="storyState?.actions ?? []" @confirm="confirmStoryIntent" />
          </div>
        </template>

        <!-- Bottom spacer for virtual scroll -->
        <div :style="{ height: bottomSpacerHeight + 'px' }" aria-hidden="true" />

        <!-- Streaming message -->
        <div v-if="isStreaming" class="message-bubble message-assistant streaming">
          <div class="avatar-col">
            <el-avatar :size="32" :src="streamingCharacterAvatar" class="char-avatar">
              {{ chatStore.streamingCharacterName?.[0]?.toUpperCase() || '?' }}
            </el-avatar>
          </div>
          <div class="bubble-col">
            <div class="streaming-header" v-if="chatStore.streamingCharacterName">
              <span class="streaming-author">{{ chatStore.streamingCharacterName }}</span>
            </div>
            <div class="message-content">
              <MarkdownRenderer :content="streamingMessage" :streaming="true" :regex-scripts="streamingRegexScripts" :interactive-html="currentChat?.contentSnapshotVersion == null" />
              <span class="typing-cursor"></span>
            </div>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-else-if="sending && !isStreaming" class="typing-indicator" aria-live="assertive">
          <span class="typing-text">{{ t('chat.typing', { name: typingCharacterName }) }}</span>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
      </template>

      <div ref="messagesEnd"></div>

      <ScrollToBottom
        :visible="showScrollButton"
        :label="hasNewContent ? t('chat.newContent') : t('chat.scrollToBottom')"
        @click="readingPosition.returnToLatest"
      />
    </div>

    <div class="chat-input-container">
      <div v-if="isGroupChat && currentChat?.contentSnapshotVersion === 1" class="story-audience">
        <label for="story-audience">这次对谁说</label>
        <select id="story-audience" v-model="privateListener" :disabled="sending || isStreaming || preparingMessage">
          <option value="">在场所有人</option>
          <option v-for="character in chatStore.chatCharacters" :key="character.id" :value="character.id">单独对 {{ character.name }}</option>
        </select>
        <p>{{ privateListener ? '此次交谈只供所选人物续接。切回公开交谈时不会自动带出私下内容。' : '公开交谈。@只选择回应者，不代表私下交谈。' }}</p>
        <p v-if="!audienceStorageAvailable" role="alert">浏览器不能保存交谈范围，刷新后请重新确认听众。</p>
      </div>
      <section v-if="storyState?.actions.length" class="story-actions" aria-label="接下来">
        <div class="story-action-heading"><h2>接下来</h2><span>也可以自由描述你的行动</span></div>
        <ul><li v-for="action in storyState.actions" :key="action.id"><button type="button" class="story-action-choice" :disabled="actionBlocked" @click="executeStoryAction(action)"><span class="story-action-intent">{{ actionIntents[action.intent] }}</span><span class="story-action-label">{{ action.label }}</span><span aria-hidden="true">→</span></button></li></ul>
      </section>
      <section v-if="turnRecommendations" class="story-actions turn-recommendations" :class="{ 'opening-suggestions': !chatStore.messages.some(message => message.role === 'user') }" aria-label="本轮推荐行动">
        <div class="story-action-heading"><h2>接下来</h2><span>{{ turnRecommendations.storyRecommendationsSource === 'generated' ? '根据本轮剧情生成' : turnRecommendations.storyRecommendationsSource === 'excerpt' ? '基于原文的探索提示' : '通用探索提示' }} · 不是原卡规则选项</span></div>
        <ul><li v-for="suggestion in turnRecommendations.storyRecommendations" :key="suggestion.label"><button type="button" class="story-action-choice" :disabled="recommendationBlocked || greetingIdentityBlocked" @click="sendStorySuggestion(suggestion.input)"><span class="story-action-label">{{ suggestion.label }}</span></button></li></ul>
        <p>点击作为自由输入发送，不保证结果或奖励；也可自行输入。</p>
      </section>
      <p v-if="storyStateError" class="generation-error" role="alert">{{ storyStateError }} <button type="button" @click="refreshStoryState">重试</button></p>
      <div v-if="chatStore.error" class="generation-error" role="alert">
        <span>{{ chatStore.error }}</span>
        <el-button
          v-if="chatStore.contextRecovery?.chatId === currentChat?.id && chatStore.contextRecovery?.content"
          link size="small" class="context-recover-input"
          :disabled="sending || isStreaming || preparingMessage"
          @click="recoverContextInput"
        >{{ t('chat.contextRecoverInput') }}</el-button>
        <el-button
          v-if="chatStore.canRetryGeneration"
          link
          size="small"
          class="generation-retry"
          @click="handleRetryGeneration"
        >
          {{ t('chat.retryGeneration') }}
        </el-button>
      </div>
      <p v-if="chatStore.stopping" class="generation-status" role="status">{{ t('chat.stopping') }}</p>
      <!-- Next responder indicator (round_robin group chat) -->
      <div v-if="nextResponder && !isStreaming" class="next-responder-indicator">
        <el-avatar :size="20" :src="nextResponder.avatar" class="next-responder-avatar">
          {{ nextResponder.name?.[0]?.toUpperCase() || '?' }}
        </el-avatar>
        <span class="next-responder-text">{{ t('groupChat.nextResponder', { name: nextResponder.name }) }}</span>
      </div>
      <!-- Remote user typing indicator -->
      <div v-if="remoteTypingNames.length > 0" class="remote-typing-indicator">
        <span class="remote-typing-dots"><span></span><span></span><span></span></span>
        <span class="remote-typing-text">{{ t('chat.remoteTyping', { names: remoteTypingNames.join(', ') }, remoteTypingNames.length) }}</span>
      </div>
      <section v-if="creditBalance?.billingMode === 'credits' || creditsFailed" class="story-credits" :aria-label="t('credits.title')" :aria-busy="creditsLoading">
        <template v-if="creditBalance?.billingMode === 'credits'">
          <span>{{ t('credits.available') }} <strong>{{ creditBalance.unlimited ? t('credits.unlimited') : creditBalance.availablePoints }}</strong></span>
          <span v-if="creditBalance.heldTokens > 0">{{ t('credits.held') }} {{ (creditBalance.heldTokens / creditBalance.tokensPerPoint).toLocaleString(undefined, { maximumFractionDigits: 4 }) }}</span>
          <span v-if="latestCharge && !creditsFailed">{{ t('credits.latestStoryCharge', { points: Math.abs(latestCharge.points) }) }}</span>
          <span v-if="creditsBlocked" role="status">{{ t('credits.insufficient') }}</span>
        </template>
        <span v-if="creditsFailed" role="alert">{{ t('credits.refreshFailed') }}</span>
        <button type="button" :disabled="creditsLoading" @click="refreshCredits">{{ t('credits.refresh') }}</button>
        <RouterLink :to="{ name: 'Subscription', query: { returnTo: `/chat/${currentChat?.id}` } }">{{ t('credits.viewBalance') }}</RouterLink>
      </section>
      <MessageInput
        ref="messageInput"
        :disabled="!currentChat || greetingIdentityBlocked || (creditsBlocked && !sending && !isStreaming)"
        :sending="sending || preparingMessage"
        :is-streaming="isStreaming"
        :stopping="chatStore.stopping"
        :draft-audience="privateListener"
        :characters="isGroupChat ? chatStore.chatCharacters.map(c => ({ id: c.id, name: c.name, avatar: c.avatar })) : []"
        @send="handleSendMessage"
        @stop-generation="chatStore.abortGeneration()"
      />
    </div>
    </main>
    <StoryDossier v-if="currentChat?.contentSnapshotVersion != null" :key="currentChat.id" :chat-id="currentChat.id" :state="storyState" :busy="sending || isStreaming" :loading="storyStateLoading" :error="storyStateError" @refresh="refreshStoryState" @source="showStorySource" />
    </div>
    <el-dialog v-if="sourceVisible" v-model="sourceVisible" title="历程原文" width="min(680px, 94vw)" append-to-body><p v-if="sourceLoading" role="status">正在读取原文…</p><MarkdownRenderer v-else :content="sourceText" /></el-dialog>

    <!-- Manage Characters Dialog (Group Chat) -->
    <el-dialog
      v-model="showManageDialog"
      :title="t('groupChat.manageCharacters')"
      width="480px"
      append-to-body
    >
      <div class="manage-characters-list">
        <div v-for="char in chatStore.chatCharacters" :key="char.id" class="manage-character-item">
          <el-avatar :size="36" :src="char.avatar">{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          <span class="manage-character-name">{{ char.name }}</span>
          <el-button
            v-if="chatStore.chatCharacters.length > 1"
            size="small"
            type="danger"
            text
            @click="handleRemoveCharacter(char.id)"
          >{{ t('groupChat.removeCharacter') }}</el-button>
        </div>
      </div>
      <div class="manage-add-section">
        <el-button size="small" @click="showAddCharacterDialog = true">{{ t('groupChat.addCharacter') }}</el-button>
      </div>
    </el-dialog>

    <!-- Add Character Dialog -->
    <el-dialog
      v-model="showAddCharacterDialog"
      :title="t('groupChat.addCharacter')"
      width="480px"
      append-to-body
    >
      <div class="add-character-search">
        <el-input v-model="addCharacterSearch" :placeholder="t('chat.searchCharacters')" clearable />
      </div>
      <div class="add-character-list">
        <div
          v-for="char in availableCharactersFiltered"
          :key="char.id"
          class="manage-character-item clickable"
          @click="handleAddCharacter(char.id)"
        >
          <el-avatar :size="36" :src="char.avatar">{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          <span class="manage-character-name">{{ char.name }}</span>
        </div>
        <div v-if="availableCharactersFiltered.length === 0" class="add-character-empty">
          {{ t('chat.noResults') || 'No characters found' }}
        </div>
      </div>
    </el-dialog>

    <!-- Growth Panel Dialog -->
    <el-dialog
      v-model="showGrowthPanel"
      :title="t('character.growth')"
      width="420px"
      append-to-body
      destroy-on-close
    >
      <GrowthPanel v-if="currentChat?.characterId" :character-id="currentChat.characterId" />
    </el-dialog>

    <!-- Character Tuner Drawer -->
    <CharacterTuner
      v-if="currentChat"
      v-model="showTunerDrawer"
      :chat-id="currentChat.id"
      :character-id="currentChat.characterId"
      @applied="handleTunerApplied"
    />

    <!-- Intelligence Drawer -->
    <el-drawer
      v-model="showIntelligenceDrawer"
      :title="t('chat.intelligence')"
      direction="rtl"
      size="360px"
      :append-to-body="false"
      :modal="false"
      class="intelligence-drawer"
    >
      <el-tabs v-model="activeIntelligenceTab">
        <el-tab-pane v-if="currentChat?.contentSnapshotVersion == null" :label="t('chat.emotion')" name="emotion">
          <EmotionIndicator />
        </el-tab-pane>
        <el-tab-pane :label="t('chat.memory')" name="memory">
          <StoryMemoryStatus v-if="currentChat?.contentSnapshotVersion != null" :key="currentChat.id" :chat-id="currentChat.id" :busy="sending || isStreaming" :version="storyState?.version ?? 0" @source="showStorySource" />
          <MemoryPanel v-else-if="currentChat?.characterId" :character-id="currentChat.characterId" :chat-id="currentChat.id" />
        </el-tab-pane>
        <el-tab-pane v-if="currentChat?.contentSnapshotVersion == null" :label="t('chat.debug')" name="debug">
          <IntelligenceDebugPanel v-if="showIntelligenceDrawer && activeIntelligenceTab === 'debug'" :chat-id="currentChat?.id" :character-id="currentChat?.characterId" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
    <!-- Pinned Messages Drawer -->
    <el-drawer v-model="showPinnedDrawer" :title="t('chat.pinnedMessages')" size="360px">
      <div v-if="chatStore.pinnedMessages.length === 0" class="empty-pinned">
        {{ t('chat.noPinnedMessages') }}
      </div>
      <div v-else class="pinned-list">
        <div v-for="msg in chatStore.pinnedMessages" :key="msg.id" class="pinned-item">
          <div class="pinned-role">{{ msg.role }}</div>
          <div class="pinned-content">{{ msg.content?.substring(0, 200) }}</div>
        </div>
      </div>
    </el-drawer>
    <!-- Snapshot Dialog -->
    <el-dialog v-model="showSnapshotDialog" :title="t('share.createSnapshot')" width="450px">
      <el-form label-position="top">
        <el-form-item :label="t('share.snapshotTitle')">
          <el-input v-model="snapshotTitle" :placeholder="t('share.snapshotTitle')" />
        </el-form-item>
        <el-form-item :label="t('share.snapshotExpiry')">
          <el-select v-model="snapshotExpiry" style="width: 100%">
            <el-option :label="t('chat.oneDay')" value="1d" />
            <el-option :label="t('chat.sevenDays')" value="7d" />
            <el-option :label="t('chat.thirtyDays')" value="30d" />
            <el-option :label="t('chat.never')" value="never" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="snapshotLink" class="snapshot-result">
        <el-input :model-value="snapshotLink" readonly>
          <template #append>
            <el-button @click="copySnapshotLink">{{ t('share.copyLink') }}</el-button>
          </template>
        </el-input>
      </div>
      <template #footer>
        <el-button @click="showSnapshotDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creatingSnapshot" @click="createSnapshot" :disabled="!!snapshotLink">
          {{ t('share.createSnapshot') }}
        </el-button>
      </template>
    </el-dialog>
    <!-- ERA Script Runner (hidden iframe for tavern_helper scripts) -->
    <EraScriptRunner
      v-if="eraTavernHelperScripts.length > 0 && currentChat && currentChat.contentSnapshotVersion == null"
      :scripts="eraTavernHelperScripts"
      :char-name="currentChat.characterName || ''"
      :user-name="userStore.user?.name || 'User'"
      :chat-id="currentChat.id"
    />

    <!-- Context Viewer Dialog -->
    <ContextViewer
      v-if="currentChat"
      v-model="showContextViewer"
      :chat-id="currentChat.id"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { storyDisplayText } from '@client/utils/story-display';
import { ElMessageBox, ElMessage } from 'element-plus';
import { More, Loading, Search, Download } from '@element-plus/icons-vue';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { useDateTime } from '@client/composables';
import { useStoryIdentity } from '@client/composables/useStoryIdentity';
import { useStoryCredits } from '@client/composables/useStoryCredits';
import { useStoryReadingPosition } from '@client/composables/useStoryReadingPosition';
import { useChatFontSize } from '@client/composables/useChatFontSize';
import { chatApi } from '@client/services/chat.api';
import { exportApi } from '@client/services/export.api';
import { shareApi } from '@client/services/share.api';
import { characterApi } from '@client/services/character.api';
import { useTextToSpeech, type VoiceConfig } from '@client/composables/useTextToSpeech';
import MessageBubble from './MessageBubble.vue';
import MessageInput from './MessageInput.vue';
import StoryDossier from './StoryDossier.vue';
import StoryMemoryStatus from './StoryMemoryStatus.vue';
import StoryIntentReview from './StoryIntentReview.vue';
import StoryCorrections from './StoryCorrections.vue';
import StoryBranchNavigator from './StoryBranchNavigator.vue';
import { storyApi } from '@client/services/story.api';
import type { StoryReading } from '../../../types/story-corrections';
import type { StoredStoryIntent } from '../../../types/story-intent';
import { useStoryState } from '../../composables/useStoryState';
import { useStoryDraft } from '../../composables/useStoryDraft';
import type { StoryStateView, StoryActionRequest } from '../../../types/story-state';
import ScrollToBottom from './ScrollToBottom.vue';
import DateDivider from './DateDivider.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import ChatTokenCounter from './ChatTokenCounter.vue';
import ContextViewer from './ContextViewer.vue';
import ExpressionSprite from './ExpressionSprite.vue';
import EraScriptRunner from './EraScriptRunner.vue';
import { storyCapabilityMessages } from '../../../types/story-capabilities';
import StoryDiagnosticsView from '../character/StoryDiagnosticsView.vue';
import CharacterTuner from './CharacterTuner.vue';
import EmotionIndicator from '@client/components/EmotionIndicator.vue';
import MemoryPanel from '@client/components/MemoryPanel.vue';
// Lazy-load heavy panels to break circular chunk deps and reduce initial chat bundle
const IntelligenceDebugPanel = defineAsyncComponent(() => import('@client/components/debug/IntelligenceDebugPanel.vue'));
const GrowthPanel = defineAsyncComponent(() => import('@client/components/character/GrowthPanel.vue'));
import { createLogger } from '@client/utils/logger';
import { getRegexScripts, type RegexScript } from '@client/utils/regex-scripts';
import { initEraBridge, destroyEraBridge, fetchVariables, updateVariables } from '@client/utils/era-bridge';
import type { Chat, Message, MessageAttachment, Character } from '@client/types';
import { sourcedStoryRecommendations, storyRecommendationsSchema } from '../../../types/story-recommendations';

const logger = createLogger('ChatWindow');

interface Props {
  currentChat: Chat | null;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { size: readingSize, sizes: readingSizes, setSize: setReadingSize } = useChatFontSize();
const chatStore = useChatStore();
const userStore = useUserStore();
const messageInput = ref<InstanceType<typeof MessageInput> | null>(null);
const { state: storyState, error: storyStateError, loading: storyStateLoading, refresh: refreshStoryState } = useStoryState(
  () => userStore.user ? `${userStore.user.tenantId}:${userStore.user.id}` : null,
  () => props.currentChat?.contentSnapshotVersion != null ? props.currentChat.id : undefined,
  () => chatStore.sending || chatStore.isStreaming,
  () => chatStore.billingRevision,
);
const actionIntents = { observe: '观察', talk: '交谈', act: '行动', travel: '前往' };
const latestStoryIntent = computed(() => {
  const latest = chatStore.messages.at(-1);
  const candidate = latest?.extra?.storyIntent as StoredStoryIntent | undefined;
  return latest?.role === 'assistant' && candidate ? { messageId: Number(latest.id), candidate } : null;
});
async function confirmStoryIntent() {
  if (actionBlocked.value) return;
  const selected = latestStoryIntent.value;
  if (!selected || storyState.value?.version !== selected.candidate.expectedVersion) return;
  await handleSendMessage(selected.candidate.input, undefined, undefined, undefined,
    { proposalMessageId: selected.messageId, expectedVersion: selected.candidate.expectedVersion });
}
const actionBlocked = computed(() => chatStore.sending || chatStore.isStreaming || preparingMessage.value || Boolean(storyStateError.value) || storyStateLoading.value || creditsBlocked.value);
const recommendationBlocked = computed(() => chatStore.sending || chatStore.isStreaming || preparingMessage.value || creditsBlocked.value);
const sourceVisible = ref(false);
const sourceLoading = ref(false);
const sourceText = ref('');
async function showStorySource(messageId: number) {
  const target = props.currentChat?.id;
  if (!target) return;
  sourceVisible.value = true; sourceLoading.value = true; sourceText.value = '';
  try {
    const result = await chatApi.getMessages(target, { before: messageId + 1, limit: 1 });
    if (target === props.currentChat?.id) sourceText.value = result.messages.find(message => Number(message.id) === messageId)?.content ?? '原文暂不可用，请重试。';
  } catch { if (target === props.currentChat?.id) sourceText.value = '读取失败，请重试。'; }
  finally { sourceLoading.value = false; }
}
watch(() => props.currentChat?.id, () => { sourceVisible.value = false; sourceText.value = ''; });
async function executeStoryAction(action: StoryStateView['actions'][number]) {
  if (actionBlocked.value) return;
  await handleSendMessage(action.label, undefined, undefined, undefined, { actionId: action.id, expectedVersion: action.version });
}
const turnRecommendations = computed(() => {
  if (props.currentChat?.contentSnapshotVersion == null || isGroupChat.value || chatStore.sending || chatStore.isStreaming) return null;
  const latest = [...chatStore.messages].reverse().find(message =>
    message.chatId === props.currentChat?.id && message.role === 'assistant',
  );
  if (!latest) return currentGreeting.value ? sourcedStoryRecommendations(currentGreeting.value) : sourcedStoryRecommendations('');
  if (latest.extra?.stateStatus === 'interrupted') return null;
  const parsed = storyRecommendationsSchema.safeParse(latest.extra?.storyRecommendations);
  return parsed.success ? { storyRecommendations: parsed.data, storyRecommendationsSource: latest.extra?.storyRecommendationsSource }
    : sourcedStoryRecommendations(latest.content);
});
async function sendStorySuggestion(input: string) {
  if (!turnRecommendations.value?.storyRecommendations.some(suggestion => suggestion.input === input) || recommendationBlocked.value || greetingIdentityBlocked.value) return;
  await handleSendMessage(input);
}
const { balance: creditBalance, latest: latestCharge, failed: creditsFailed, loading: creditsLoading, blocked: creditsBlocked, refresh: refreshCredits } = useStoryCredits(
  () => userStore.user ? `${userStore.user.tenantId}:${userStore.user.id}` : null,
  () => props.currentChat?.id,
  () => chatStore.sending || chatStore.isStreaming,
  () => chatStore.billingRevision,
);
const { name: storyUserName, loading: identityLoading, failed: identityFailed, reload: reloadIdentity } = useStoryIdentity(
  () => props.currentChat,
  () => userStore.user,
);
const intelligenceStore = useCharacterIntelligenceStore();
const messagesContainer = ref<HTMLElement | null>(null);
const correctionsPanel = ref<InstanceType<typeof StoryCorrections> | null>(null);
const storyReadings = ref<StoryReading[]>([]);
async function undoReading(id: string) {
  const chatId = props.currentChat?.id;
  if (!chatId) return;
  try {
    await storyApi.removeReading(chatId, id);
    if (props.currentChat?.id === chatId) await correctionsPanel.value?.refreshReadings();
  } catch (caught) { ElMessage.error(caught instanceof Error ? caught.message : '撤销失败，请重试。'); }
}
const messagesEnd = ref<HTMLElement | null>(null);

const { formatRelativeTime } = useDateTime();
const followingLatest = ref(true);
const hasNewContent = ref(false);
const showScrollButton = computed(() => !followingLatest.value);
const editingMessageId = ref<string | null>(null);
const preparingMessage = ref(false);
const showSearch = ref(false);
const showContextViewer = ref(false);

// Group chat state
const isGroupChat = computed(() => chatStore.chatCharacters.length > 1);
const audienceStorageKey = computed(() => userStore.user && props.currentChat?.id
  ? `story-audience:${JSON.stringify([userStore.user.tenantId, userStore.user.id, props.currentChat.id])}` : null);
const { text: privateListener, storageAvailable: audienceStorageAvailable } = useStoryDraft(audienceStorageKey);
const showManageDialog = ref(false);
const showAddCharacterDialog = ref(false);
const addCharacterSearch = ref('');
const availableCharacters = ref<Character[]>([]);
const showGrowthPanel = ref(false);
const showPinnedDrawer = ref(false);
const showTunerDrawer = ref(false);

// Group chat strategy
const groupStrategy = ref<'round_robin' | 'all' | 'random'>('round_robin');
const strategyOptions = computed(() => [
  { label: t('groupChat.roundRobin'), value: 'round_robin' },
  { label: t('groupChat.allRespond'), value: 'all' },
  { label: t('groupChat.randomRespond'), value: 'random' },
]);

// Load strategy from chat metadata when chat changes
watch(() => chatStore.currentChat, (chat) => {
  if (chat?.metadata?.groupStrategy) {
    groupStrategy.value = chat.metadata.groupStrategy as 'round_robin' | 'all' | 'random';
  } else {
    groupStrategy.value = 'round_robin';
  }
}, { immediate: true });

async function handleStrategyChange(val: string | number) {
  const strategy = val as 'round_robin' | 'all' | 'random';
  groupStrategy.value = strategy;
  if (chatStore.currentChatId) {
    try {
      await chatApi.setGroupStrategy(chatStore.currentChatId, strategy);
    } catch (e) {
      logger.error('Failed to set group strategy', e);
    }
  }
}

// Next responder indicator (round_robin mode)
const nextResponder = computed(() => {
  if (!isGroupChat.value || groupStrategy.value !== 'round_robin') return null;
  const chars = chatStore.chatCharacters;
  if (chars.length === 0) return null;

  // Find last assistant message with characterId
  let lastResponderId: string | undefined;
  for (let i = chatStore.messages.length - 1; i >= 0; i--) {
    const msg = chatStore.messages[i];
    if (msg.role === 'assistant' && msg.characterId) {
      lastResponderId = msg.characterId;
      break;
    }
  }

  if (!lastResponderId) return chars[0];
  const lastIdx = chars.findIndex(c => c.id === lastResponderId);
  const nextIdx = (lastIdx + 1) % chars.length;
  return chars[nextIdx];
});

// Build a lookup map for character info by ID
const characterMap = computed(() => {
  const map = new Map<string, Character>();
  for (const char of chatStore.chatCharacters) {
    map.set(char.id, char);
  }
  return map;
});

// Get character name for a message (group chat lookup or fallback to chat-level)
const getMessageCharacterName = (message: Message): string => {
  if (message.characterName) return message.characterName;
  if (message.characterId) {
    const char = characterMap.value.get(message.characterId);
    if (char) return char.name;
  }
  return props.currentChat?.characterName || '';
};

// Get character avatar for a message (group chat lookup or fallback to chat-level)
const getMessageCharacterAvatar = (message: Message): string | undefined => {
  if (message.characterId) {
    const char = characterMap.value.get(message.characterId);
    if (char) return char.avatar;
  }
  return props.currentChat?.characterAvatar;
};

// Get regex_scripts for a message's character (for markdownOnly client-side rendering)
const getMessageRegexScripts = (message: Message): RegexScript[] | undefined => {
  if (message.characterId) {
    const char = characterMap.value.get(message.characterId);
    if (char) return getRegexScripts(char.cardData as Record<string, unknown>);
  }
  const fallback = chatStore.currentCharacter;
  if (fallback) return getRegexScripts(fallback.cardData as Record<string, unknown>);
  return undefined;
};

// Streaming character avatar lookup
const streamingCharacterAvatar = computed(() => {
  if (chatStore.streamingCharacterId) {
    const char = characterMap.value.get(chatStore.streamingCharacterId);
    if (char) return char.avatar;
  }
  return props.currentChat?.characterAvatar;
});

// Typing indicator character name
const typingCharacterName = computed(() => {
  return chatStore.streamingCharacterName || props.currentChat?.characterName || '';
});

// Regex scripts for the currently streaming character
const streamingRegexScripts = computed(() => {
  if (chatStore.streamingCharacterId) {
    const char = characterMap.value.get(chatStore.streamingCharacterId);
    if (char) return getRegexScripts(char.cardData as Record<string, unknown>);
  }
  const fallback = chatStore.currentCharacter;
  if (fallback) return getRegexScripts(fallback.cardData as Record<string, unknown>);
  return undefined;
});

// Remote user typing indicator names
const remoteTypingNames = computed(() => {
  return Array.from(chatStore.typingUsers.values()).map(u => u.userName);
});

// ERA tavern_helper scripts from character cardData
const eraTavernHelperScripts = computed(() => {
  const cardData = chatStore.currentCharacter?.cardData;
  if (!cardData?.extensions?.tavern_helper) return [];
  const th = cardData.extensions.tavern_helper as Array<[string, unknown]>;
  if (!Array.isArray(th)) return [];
  const scriptsEntry = th.find(entry => Array.isArray(entry) && entry[0] === 'scripts');
  if (!scriptsEntry || !Array.isArray(scriptsEntry[1])) return [];
  return scriptsEntry[1].filter((script): script is { name: string; type: string; enabled: boolean; content: string } => Boolean(script)
    && typeof script === 'object' && typeof script.name === 'string' && typeof script.type === 'string'
    && typeof script.enabled === 'boolean' && typeof script.content === 'string');
});

// Voice config from character's cardData extensions
const characterVoiceConfig = computed((): VoiceConfig | undefined => {
  const char = chatStore.currentCharacter;
  if (!char?.cardData?.extensions?.voice) return undefined;
  return char.cardData.extensions.voice as VoiceConfig;
});

// Expression sprites from character's cardData
const characterExpressions = computed(() => {
  const cardData = chatStore.currentCharacter?.cardData;
  // Check extensions.expressions first
  if (cardData?.extensions?.expressions) {
    return cardData.extensions.expressions as Record<string, string>;
  }
  // Fall back to V3 assets
  if (cardData?.assets && Array.isArray(cardData.assets)) {
    const expressionAssets = (cardData.assets as Array<{ type: string; uri: string; name: string }>)
      .filter((a) => a.type === 'expression');
    if (expressionAssets.length > 0) {
      const map: Record<string, string> = {};
      for (const asset of expressionAssets) {
        map[asset.name] = asset.uri;
      }
      return map;
    }
  }
  return null;
});

// Available characters for add dialog (exclude already in chat)
const availableCharactersFiltered = computed(() => {
  const existingIds = new Set(chatStore.chatCharacters.map(c => c.id));
  let chars = availableCharacters.value.filter(c => !existingIds.has(c.id));
  if (addCharacterSearch.value) {
    const q = addCharacterSearch.value.toLowerCase();
    chars = chars.filter(c => c.name.toLowerCase().includes(q));
  }
  return chars;
});

// Load available characters when add dialog opens
watch(showAddCharacterDialog, async (open) => {
  if (open && availableCharacters.value.length === 0) {
    try {
      const res = await characterApi.getCharacters({ limit: 50 });
      availableCharacters.value = res.characters;
    } catch {
      availableCharacters.value = [];
    }
  }
});

const handleAddCharacter = async (characterId: string) => {
  if (!props.currentChat) return;
  try {
    await chatApi.addChatCharacter(props.currentChat.id, characterId);
    // Refresh chat characters
    const characters = await chatApi.getChatCharacters(props.currentChat.id);
    if (Array.isArray(characters)) {
      chatStore.chatCharacters = characters.map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatarUrl,
        cardData: c.cardData as Character['cardData'],
        isPublic: false,
        createdAt: '',
      }));
    }
    showAddCharacterDialog.value = false;
  } catch (error) {
    logger.error('Failed to add character', error);
  }
};

const handleRemoveCharacter = async (characterId: string) => {
  if (!props.currentChat) return;
  try {
    await chatApi.removeChatCharacter(props.currentChat.id, characterId);
    chatStore.chatCharacters = chatStore.chatCharacters.filter(c => c.id !== characterId);
  } catch (error) {
    logger.error('Failed to remove character', error);
  }
};

const handleTogglePin = (payload: { messageId: string; isPinned: boolean }) => {
  if (!props.currentChat) return;
  chatStore.togglePin(props.currentChat.id, payload.messageId, payload.isPinned);
};

const handleSetImportance = async (payload: { messageId: string; importance: number }) => {
  if (!props.currentChat) return;
  try {
    await chatStore.editMessage(payload.messageId, { importance: payload.importance });
  } catch (error: unknown) {
    logger.error('Failed to set importance', error);
  }
};

let scrollRafId: number | null = null;

const handleScroll = () => {
  if (!messagesContainer.value) return;
  if (readingPosition.restoring.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  followingLatest.value = scrollHeight - scrollTop - clientHeight <= 100;
  if (followingLatest.value) hasNewContent.value = false;

  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
  }

  scrollRafId = requestAnimationFrame(() => {
    if (!messagesContainer.value) return;
    const { scrollTop } = messagesContainer.value;

    currentScrollTop.value = scrollTop;
    readingPosition.remember();

    // Load older messages when near top
    if (scrollTop < 100 && chatStore.hasMoreMessages && !chatStore.loadingOlder) {
      loadOlderMessages();
    }

    scrollRafId = null;
  });
};

const loadOlderMessages = async () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  const chatId = props.currentChat?.id;
  const firstMessageId = messages.value[0]?.id;

  await chatStore.fetchOlderMessages();
  if (props.currentChat?.id !== chatId || messagesContainer.value !== container) return;
  const newMessageCount = messages.value.findIndex(message => message.id === firstMessageId);
  if (newMessageCount > 0) {
    let addedHeight = 0;
    for (let i = 0; i < newMessageCount; i++) {
      addedHeight += getMsgHeight(messages.value[i].id);
    }
    const target = container.scrollTop + addedHeight;
    currentScrollTop.value = target;
    await nextTick();
    if (props.currentChat?.id === chatId && messagesContainer.value === container) {
      container.scrollTop = target;
    }
  }
};

// Intelligence drawer state
const showIntelligenceDrawer = ref(false);
const activeIntelligenceTab = ref('emotion');

// Emotion emoji mapping
const EMOTION_EMOJI: Record<string, string> = {
  excited: '🤩', happy: '😊', loving: '🥰', calm: '😌',
  curious: '🤔', surprised: '😮', confused: '😕', bored: '😐',
  sad: '😢', fearful: '😨', angry: '😠', disgusted: '🤢', neutral: '😶',
};

const emotionEmoji = computed(() => EMOTION_EMOJI[intelligenceStore.emotionLabel] ?? '😶');

const messages = computed(() => chatStore.messages);
const loading = computed(() => chatStore.loading);
const sending = computed(() => chatStore.sending);
const isStreaming = computed(() => chatStore.isStreaming);
const streamingMessage = computed(() => chatStore.streamingMessage);

// ---------------------------------------------------------------------------
// Virtual scroll state
// ---------------------------------------------------------------------------
const ESTIMATED_HEIGHT = 100; // px per message (default estimate)
const BUFFER_COUNT = 5; // extra messages above/below viewport
const messageHeightsMap = new Map<string, number>(); // non-reactive for perf
const heightsVersion = ref(0); // bump to trigger recomputation
const currentScrollTop = ref(0);

let messageObserver: ResizeObserver | null = null;

// Custom directive: observe each message wrapper's height via ResizeObserver
const vObserveHeight = {
  mounted(el: HTMLElement) {
    messageObserver?.observe(el);
  },
  beforeUnmount(el: HTMLElement) {
    messageObserver?.unobserve(el);
  },
};

const getMsgHeight = (id: string | number): number => {
  return messageHeightsMap.get(String(id)) || ESTIMATED_HEIGHT;
};

const totalEstimatedHeight = computed(() => {
  void heightsVersion.value; // reactive dependency
  let height = 0;
  for (const msg of messages.value) {
    height += getMsgHeight(msg.id);
  }
  return height;
});

const visibleRange = computed(() => {
  void heightsVersion.value; // reactive dependency
  if (!messagesContainer.value || messages.value.length === 0) {
    return { start: 0, end: messages.value.length };
  }

  const containerHeight = messagesContainer.value.clientHeight;
  const scrollTop = currentScrollTop.value;
  const msgs = messages.value;

  // Find first visible message
  let accHeight = 0;
  let start = 0;
  for (let i = 0; i < msgs.length; i++) {
    const h = getMsgHeight(msgs[i].id);
    if (accHeight + h >= scrollTop) {
      start = Math.max(0, i - BUFFER_COUNT);
      break;
    }
    accHeight += h;
    // If we reach the end without finding, show last messages
    if (i === msgs.length - 1) {
      start = Math.max(0, msgs.length - BUFFER_COUNT);
    }
  }

  // Find last visible message
  let end = start;
  let visibleHeight = 0;
  for (let i = start; i < msgs.length; i++) {
    const h = getMsgHeight(msgs[i].id);
    visibleHeight += h;
    end = i + 1;
    if (visibleHeight > containerHeight + BUFFER_COUNT * ESTIMATED_HEIGHT * 2) break;
  }

  return { start, end: Math.min(end + BUFFER_COUNT, msgs.length) };
});

const visibleMessages = computed(() => {
  const { start, end } = visibleRange.value;
  return messages.value.slice(start, end);
});

const topSpacerHeight = computed(() => {
  void heightsVersion.value; // reactive dependency
  const { start } = visibleRange.value;
  let height = 0;
  for (let i = 0; i < start; i++) {
    height += getMsgHeight(messages.value[i].id);
  }
  return height;
});

const bottomSpacerHeight = computed(() => {
  void heightsVersion.value; // reactive dependency
  const { end } = visibleRange.value;
  let height = 0;
  for (let i = end; i < messages.value.length; i++) {
    height += getMsgHeight(messages.value[i].id);
  }
  return height;
});

// Greeting swipe state
const greetingIndex = ref(0);

const rawGreetings = computed<string[]>(() => {
  const character = chatStore.currentCharacter;
  if (!character) return [];
  const cardData = character.cardData || {};
  const greetings: string[] = [];
  if (cardData.first_mes) {
    greetings.push(cardData.first_mes);
  }
  if (cardData.alternate_greetings && Array.isArray(cardData.alternate_greetings)) {
    greetings.push(...cardData.alternate_greetings);
  }
  return greetings;
});

const greetingIdentityBlocked = computed(() => messages.value.length === 0
  && rawGreetings.value.length > 0 && (identityLoading.value || identityFailed.value));

const allGreetings = computed(() => {
  const userName = storyUserName.value;
  if (userName === null) return [];
  const charName = chatStore.currentCharacter?.name || '';
  return rawGreetings.value.map(greeting => greeting.replace(/\{\{(char|user)\}\}/gi,
    (_match, macro: string) => macro.toLowerCase() === 'char' ? charName : userName));
});

const totalGreetings = computed(() => allGreetings.value.length);

const hasAlternateGreetings = computed(() => totalGreetings.value > 1);

const currentGreeting = computed(() => {
  if (allGreetings.value.length === 0) return '';
  const idx = Math.min(greetingIndex.value, allGreetings.value.length - 1);
  return allGreetings.value[idx] || '';
});

const prevGreeting = () => {
  if (greetingIndex.value > 0) {
    greetingIndex.value--;
  }
};

const nextGreeting = () => {
  if (greetingIndex.value < totalGreetings.value - 1) {
    greetingIndex.value++;
  }
};

const greetingPreview = computed(() => {
  const nextIdx = greetingIndex.value + 1;
  const previous = nextIdx >= allGreetings.value.length;
  const index = previous ? greetingIndex.value - 1 : nextIdx;
  if (index < 0) return '';
  const preview = storyDisplayText(rawGreetings.value[index], {
    characterName: chatStore.currentCharacter?.name, userName: storyUserName.value ?? '', limit: 80,
  });
  return preview ? previous ? `← ${preview}` : `${preview} →` : '';
});

watch(greetingIndex, () => {
  if (messages.value.length === 0) scrollToBottom(false);
});

// Touch swipe gesture for greeting navigation
let greetingTouchStartX = 0;
const onGreetingTouchStart = (e: TouchEvent) => {
  greetingTouchStartX = e.touches[0].clientX;
};
const onGreetingTouchEnd = (e: TouchEvent) => {
  const dx = e.changedTouches[0].clientX - greetingTouchStartX;
  if (Math.abs(dx) < 50) return; // minimum swipe distance
  if (dx < 0) nextGreeting(); // swipe left → next
  else prevGreeting(); // swipe right → previous
};

const getDateLabel = (dateStr: string): string => {
  if (!dateStr) return t('time.today');
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return t('time.today');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('time.today');
  if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
  return date.toLocaleDateString();
};

const shouldShowDateDivider = (index: number): boolean => {
  if (index === 0) return true;
  const current = new Date(messages.value[index].createdAt);
  const previous = new Date(messages.value[index - 1].createdAt);
  return current.toDateString() !== previous.toDateString();
};

const scrollToBottom = (smooth = true) => {
  if (readingPosition.restoring.value) return;
  followingLatest.value = true;
  hasNewContent.value = false;
  const chatId = props.currentChat?.id;
  // Ensure the last messages are in the visible range before scrolling
  currentScrollTop.value = totalEstimatedHeight.value;

  nextTick(() => {
    if (messagesContainer.value && followingLatest.value && props.currentChat?.id === chatId) {
      const container = messagesContainer.value;
      if (messages.value.length === 0) {
        container.scrollTop = 0;
      } else if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      currentScrollTop.value = container.scrollTop;
    }
  });
};

const handleSendMessage = async (content: string, attachments?: MessageAttachment[], mentionedCharacterIds?: string[], onAccepted?: () => void, storyAction?: StoryActionRequest) => {
  if (preparingMessage.value || sending.value || isStreaming.value || greetingIdentityBlocked.value || creditsBlocked.value) return;
  const chatId = props.currentChat?.id;
  if (!chatId) return;
  preparingMessage.value = true;
  readingPosition.returnToLatest();
  try {
    // Persist the selected greeting as the first assistant message before sending
    if (messages.value.length === 0 && currentGreeting.value) {
      await persistGreeting();
    }
    if (props.currentChat?.id !== chatId) return;
    preparingMessage.value = false;
    await chatStore.sendMessage(content, attachments, mentionedCharacterIds, onAccepted, undefined, storyAction,
      privateListener.value ? [privateListener.value] : undefined);
  } catch (error: unknown) {
    logger.error('Failed to send message', error);
    ElMessage.error(error instanceof Error ? error.message : '发送失败，输入已保留。');
  } finally {
    preparingMessage.value = false;
  }
};

const handleRetryGeneration = async () => {
  try {
    await chatStore.retryLastGeneration();
    scrollToBottom();
  } catch (error: unknown) {
    logger.error('Failed to retry generation', error);
  }
};

const recoverContextInput = () => {
  if (!messageInput.value) return;
  const content = chatStore.takeContextInput();
  if (content) messageInput.value.fillAction(content);
};

async function persistGreeting() {
  if (messages.value.length > 0) return;
  if (!currentGreeting.value) return;
  const chatId = chatStore.currentChatId;
  if (!chatId) return;
  const index = Math.min(greetingIndex.value, rawGreetings.value.length - 1);
  await chatStore.addGreetingMessage(chatId, rawGreetings.value[index]);
}

// Context Viewer
function showContextViewerDialog() {
  showContextViewer.value = true;
}

const handleMenuCommand = async (command: string) => {
  if (!props.currentChat) return;
  if (command === 'search') {
    showSearch.value = !showSearch.value;
    if (!showSearch.value) {
      chatStore.clearSearch();
    }
  } else if (command === 'export-json') {
    await handleExport('json');
  } else if (command === 'export-md') {
    await handleExport('markdown');
  } else if (command === 'export-txt') {
    await handleExport('txt');
  } else if (command === 'rename') {
    try {
      const result = await ElMessageBox.prompt(t('chat.renamePrompt'), t('chat.renameTitle'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputValue: props.currentChat.title || props.currentChat.characterName,
      });
      // prompt 确认后返回 { value, action }；字符串 action 视为未输入
      const value = typeof result === 'string' ? '' : result.value;
      if (value?.trim()) {
        await chatStore.renameChat(props.currentChat.id, value.trim());
      }
    } catch { /* cancelled */ }
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteTitle'), {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      });
      await chatStore.deleteChat(props.currentChat.id);
    } catch { /* cancelled */ }
  }
};

const handleExport = async (format: 'json' | 'markdown' | 'txt') => {
  if (!props.currentChat) return;
  try {
    const blob = await chatApi.exportChat(props.currentChat.id, format);
    const ext = format === 'markdown' ? 'md' : format;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${props.currentChat.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('chat.exportFailed'));
  }
};

const exportChatDirect = async (format: 'json' | 'txt') => {
  if (!props.currentChat?.id) return;
  try {
    const blob = format === 'json'
      ? await exportApi.exportChatJson(props.currentChat.id)
      : await exportApi.exportChatTxt(props.currentChat.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.currentChat.title || 'chat'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('chat.exportFailed'));
  }
};

// Snapshot state
const showSnapshotDialog = ref(false);
const snapshotTitle = ref('');
const snapshotExpiry = ref('7d');
const snapshotLink = ref('');
const creatingSnapshot = ref(false);

const handleExportDropdown = async (command: string) => {
  if (command === 'snapshot') {
    snapshotTitle.value = '';
    snapshotExpiry.value = '7d';
    snapshotLink.value = '';
    showSnapshotDialog.value = true;
  } else {
    await exportChatDirect(command as 'json' | 'txt');
  }
};

const handleToolsDropdown = (command: string) => {
  switch (command) {
    case 'tuner': showTunerDrawer.value = true; break;
    case 'memory': openIntelligenceTab('memory'); break;
    case 'debug': openIntelligenceTab('debug'); break;
    case 'growth': showGrowthPanel.value = true; break;
    case 'pinned': showPinnedDrawer.value = true; break;
    case 'search':
      // 复用顶部消息搜索栏（与更多菜单的 search 行为一致）
      showSearch.value = !showSearch.value;
      if (!showSearch.value) chatStore.clearSearch();
      break;
  }
};

const handleTunerApplied = () => {
  ElMessage.success(t('characterTuner.applied'));
  // Optionally reload chat or refresh context
};

const createSnapshot = async () => {
  if (!props.currentChat) return;
  creatingSnapshot.value = true;
  try {
    const expiresAt = snapshotExpiry.value !== 'never'
      ? new Date(Date.now() + { '1d': 86400000, '7d': 604800000, '30d': 2592000000 }[snapshotExpiry.value]!).toISOString()
      : undefined;
    const res = await shareApi.createSnapshot(props.currentChat.id, {
      title: snapshotTitle.value || undefined,
      expiresAt,
    });
    snapshotLink.value = `${window.location.origin}/share/snapshot/${res.shareToken}`;
    ElMessage.success(t('share.snapshotCreated'));
  } catch {
    ElMessage.error('Failed to create snapshot');
  } finally {
    creatingSnapshot.value = false;
  }
};

const copySnapshotLink = async () => {
  try {
    await navigator.clipboard.writeText(snapshotLink.value);
    ElMessage.success(t('share.linkCopied'));
  } catch {
    ElMessage.error('Failed to copy');
  }
};

let searchTimer: ReturnType<typeof setTimeout>;
const handleSearchInput = (value: string) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    chatStore.searchMessages(value);
  }, 300);
};

const handleRollback = async (messageId: string) => {
  try {
    await ElMessageBox.confirm(
      t('chat.rollbackConfirm'),
      t('common.confirm'),
      { type: 'warning' }
    );
    const count = await chatStore.rollbackToMessage(messageId);
    ElMessage.success(t('chat.rollbackSuccess', { count }));
  } catch {
    // User cancelled or error
  }
};

const handleDeleteMessage = async (messageId: string) => {
  try {
    await ElMessageBox.confirm(
      t('chat.deleteMessageConfirm'),
      t('chat.deleteMessage'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await chatStore.deleteMessage(messageId);
  } catch { /* cancelled */ }
};

// Edit message handlers
const handleEditMessage = (messageId: string) => {
  editingMessageId.value = messageId;
};

const handleSaveEdit = async (messageId: string, content: string) => {
  try {
    await chatStore.editMessage(messageId, { content });
    editingMessageId.value = null;
  } catch (error: unknown) {
    logger.error('Failed to edit message', error);
  }
};

const handleCancelEdit = () => {
  editingMessageId.value = null;
};

const handleRegenerateMessage = async (messageId: string) => {
  try {
    await chatStore.regenerateMessage(messageId);
    scrollToBottom();
  } catch (error: unknown) {
    logger.error('Failed to regenerate message', error);
  }
};

const handleSwitchBranch = async (messageId: number, direction: 'prev' | 'next') => {
  try {
    await chatStore.switchBranch(messageId, direction);
  } catch (error: unknown) {
    logger.error('Failed to switch branch', error);
  }
};

const openIntelligenceTab = (tab: string) => {
  activeIntelligenceTab.value = props.currentChat?.contentSnapshotVersion != null ? 'memory' : tab;
  showIntelligenceDrawer.value = true;
  intelligenceStore.resetDebugEventCount();
};

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return `${tokens}`;
}

const handleModelChange = async (model: string) => {
  try {
    await chatStore.switchModel(model);
  } catch (error: unknown) {
    logger.error('Failed to switch model', error);
  }
};

const positionKey = computed(() => userStore.user && props.currentChat?.id
  ? `story-position:${JSON.stringify([userStore.user.tenantId, userStore.user.id, props.currentChat.id])}` : null);
const readingPosition = useStoryReadingPosition({ key: positionKey, loading, container: messagesContainer, messages,
  hasMore: () => chatStore.hasMoreMessages, loadOlder: () => chatStore.fetchOlderMessages(), height: getMsgHeight,
  setTop: top => { currentScrollTop.value = top; }, setFollowing: following => { followingLatest.value = following; },
  latest: () => scrollToBottom(false),
});

// Watch for chat changes to fetch intelligence data
watch(() => props.currentChat, async (newChat, oldChat) => {
  if (newChat?.id !== oldChat?.id) {
    showIntelligenceDrawer.value = false;
    activeIntelligenceTab.value = newChat?.contentSnapshotVersion != null ? 'memory' : 'emotion';
    hasNewContent.value = false;
  }
  if (newChat?.id !== oldChat?.id) greetingIndex.value = 0;

  if (newChat && newChat.characterId && newChat.contentSnapshotVersion == null) {
    // Fetch memories and emotion for the new chat session
    try {
      await intelligenceStore.fetchMemories(newChat.characterId, newChat.id);
      await intelligenceStore.fetchEmotion(newChat.characterId, newChat.id);
    } catch (error) {
      logger.error('Failed to fetch intelligence data', error);
    }
  }
  // Fetch pinned messages for the new chat
  if (newChat) {
    chatStore.fetchPinnedMessages(newChat.id);
    // Initialize ERA bridge for variable state management
    initEraBridge(newChat.id, {
      charName: newChat.characterName || '',
      userName: userStore.user?.name || 'User',
    });
    // Load initial ERA variables
    fetchVariables(newChat.id).then(vars => {
      if (chatStore.currentChat?.id === newChat.id) updateVariables(vars);
    }).catch(() => {
      if (chatStore.currentChat?.id === newChat.id) updateVariables({});
    });
  }
}, { immediate: true });

// Watch for new messages and scroll to bottom + pre-fetch branches
watch(messages, (newMessages) => {
  // Pre-fetch branch info for messages that have parentMessageId (potential siblings)
  if (newMessages.length > 0) {
    for (const msg of newMessages) {
      if (msg.parentMessageId != null) {
        const msgId = Number(msg.id);
        if (!chatStore.getBranchInfo(msgId)) {
          chatStore.fetchBranches(msgId);
        }
      }
    }
  }
}, { deep: true });

watch(() => messages.value.at(-1)?.id, (lastId, previousId) => {
  if (!lastId || chatStore.loadingOlder) return;
  if (followingLatest.value) scrollToBottom(false);
  else if (previousId) hasNewContent.value = true;
});

watch(loading, (isLoading) => {
  if (!isLoading && followingLatest.value) scrollToBottom(false);
});

// Watch for streaming updates — use instant scroll to avoid jank
watch(streamingMessage, (content) => {
  if (followingLatest.value) scrollToBottom(false);
  else if (content) hasNewContent.value = true;
});

// Pull-to-refresh state
const pullRefreshState = ref<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle');
const pullDistance = ref(0);
const PULL_THRESHOLD = 60;
let touchStartY = 0;
let touchStartScrollTop = 0;

const pullRefreshText = computed(() => {
  switch (pullRefreshState.value) {
    case 'pulling': return t('common.loading');
    case 'ready': return t('common.refresh');
    case 'refreshing': return t('common.loading');
    default: return '';
  }
});

const handleTouchStart = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  touchStartY = e.touches[0].clientY;
  touchStartScrollTop = messagesContainer.value.scrollTop;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  if (pullRefreshState.value === 'refreshing') return;

  const touchY = e.touches[0].clientY;
  const diff = touchY - touchStartY;

  // Only activate pull-to-refresh when scrolled to top
  if (touchStartScrollTop <= 0 && diff > 0) {
    // Apply resistance factor for natural feel
    const distance = Math.min(diff * 0.4, 120);
    pullDistance.value = distance;

    if (distance >= PULL_THRESHOLD) {
      pullRefreshState.value = 'ready';
    } else if (distance > 0) {
      pullRefreshState.value = 'pulling';
    }
  }
};

const handleTouchEnd = async () => {
  if (pullRefreshState.value === 'refreshing') return;

  if (pullRefreshState.value === 'ready') {
    pullRefreshState.value = 'refreshing';
    pullDistance.value = PULL_THRESHOLD;

    try {
      // Load older messages
      if (props.currentChat) {
        await chatStore.fetchOlderMessages();
        logger.info('Pull-to-refresh: loaded messages');
      }
    } catch (error: unknown) {
      logger.error('Pull-to-refresh failed', error);
    } finally {
      pullRefreshState.value = 'idle';
      pullDistance.value = 0;
    }
  } else {
    pullRefreshState.value = 'idle';
    pullDistance.value = 0;
  }
};

// Auto-scroll on mount + set up ResizeObserver for virtual scroll
onMounted(() => {
  messageObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const msgId = el.dataset.messageId;
      if (msgId) {
        const newHeight = entry.contentRect.height;
        if (messageHeightsMap.get(msgId) !== newHeight) {
          messageHeightsMap.set(msgId, newHeight);
          changed = true;
        }
      }
    }
    if (changed) {
      heightsVersion.value++;
      if (followingLatest.value) scrollToBottom(false);
    }
  });

  scrollToBottom(false);
  chatStore.fetchModels();
});

// Handle scroll on window resize
const handleResize = () => {
  if (followingLatest.value) scrollToBottom(false);
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  messageObserver?.disconnect();
  messageObserver = null;
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
  }
  destroyEraBridge();
});
</script>

<style scoped lang="scss">
.reading-position-status { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; padding: 10px 16px; color: var(--text-secondary); background: var(--bg-subtle); border-bottom: 1px solid var(--border-default); font-size: 13px; line-height: 1.7; }
.reading-position-status button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-primary); background: var(--bg-surface); font: inherit; cursor: pointer; }
.reading-position-status button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.story-reading-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 4px 0 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  button { background: transparent; border: 1px solid var(--el-border-color); color: inherit; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  span { overflow-wrap: anywhere; white-space: pre-wrap; }
  button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
}
.story-credits {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 4px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;

  button,
  a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
}

.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--bg-base);
}

.story-play-layout { display: flex; flex: 1; min-height: 0; }
.story-back { color: var(--text-secondary); text-decoration: none; font-size: 13px; padding: 12px 12px 12px 0; margin-right: 16px; border-right: 1px solid var(--border-default); white-space: nowrap; }
.is-exploration .chat-messages { padding: 36px clamp(20px, 6vw, 88px) 24px; }
.is-exploration :deep(.avatar-col) { display: none; }
.is-exploration :deep(.message-assistant .bubble-col) { width: 100%; max-width: 100%; }
.is-exploration :deep(.message-user .message-row) { justify-content: flex-start; }
.is-exploration :deep(.message-user .bubble-col) { align-items: flex-start; max-width: 100%; }
.is-exploration :deep(.message-user .bubble) { border-left: 2px solid var(--accent); border-radius: 0; background: var(--bg-subtle); }
.is-exploration :deep(.message-author) { letter-spacing: .08em; font-size: 12px; color: var(--accent); }
.is-exploration .greeting-container, .is-exploration .messages-list { width: min(100%, 760px); margin-left: auto; margin-right: auto; }
.story-reading { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.story-actions { max-width: 760px; margin: 0 auto 14px; }
.story-audience { max-width: 760px; margin: 0 auto 12px; color: var(--text-secondary); font-size: 13px; }
.story-audience select { margin-left: 12px; padding: 8px; max-width: 65%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-interactive); border-radius: 6px; }
.story-audience p { margin: 6px 0 0; line-height: 1.5; }
.story-action-heading { display: flex; gap: 12px; align-items: baseline; }
.story-action-heading h2 { font-size: 15px; font-weight: 500; margin: 0; }
.story-action-heading>span { color: var(--text-secondary); font-size: 12px; }
.story-actions ul { list-style: none; padding: 0; margin: 8px 0 0; max-height: 150px; overflow-y: auto; }
.story-actions li { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border-default); }
.story-action-intent { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
.story-action-label { flex: 1; font-size: 13px; overflow-wrap: anywhere; }
.story-actions button { min-height: 40px; flex-shrink: 0; padding: 6px 9px; border: 1px solid var(--border-default); background: var(--bg-subtle); color: var(--accent); border-radius: 6px; font-size: 12px; cursor: pointer; }
.story-actions button:disabled { opacity: .5; cursor: default; }
.turn-recommendations ul { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-height: none; overflow: visible; }
.turn-recommendations li { display: block; padding: 0; border: 0; min-width: 0; }
.turn-recommendations .story-action-choice { justify-content: center; min-height: 44px; padding: 8px 4px; text-align: center; }
.turn-recommendations .story-action-label { flex-basis: auto; overflow-wrap: anywhere; }
.turn-recommendations p { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: var(--text-secondary); }
.story-actions .story-action-choice { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 12px; }
@include below(lg) { .story-play-layout { flex-direction: column; } }
@include below(md) { .story-actions li { flex-wrap: wrap; } .story-action-label { flex-basis: 75%; } .story-actions ul { max-height: 128px; } .story-back { margin-right: 6px; padding-right: 8px; } .is-exploration .chat-messages { padding: 24px 18px; } }

.chat-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  justify-content: space-between;
  align-items: center;
  min-height: 64px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-default);
  background-color: var(--bg-base);
  flex-shrink: 0;
}

.chat-info {
  display: flex;
  flex: 1 1 180px;
  align-items: center;
  gap: 12px;
  min-width: 0;
  /* 外层布局（ChatLayout）在移动端悬浮汉堡按钮时通过该变量让出位置，桌面端未定义即为 0 */
  padding-inline-start: var(--chat-header-inset-start, 0px);
}

.chat-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
}

.chat-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.tools-btn {
  font-size: 16px;
}

.model-select {
  width: 160px;
}

.chat-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--chat-divider);
}

.search-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 24px 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  will-change: transform;
}

.loading-container {
  padding: 24px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.greeting-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 24px 16px;
  max-width: 700px;
  margin-inline: auto;
}

.greeting-container .message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  max-width: 100%;
  animation: fadeIn 0.3s ease-in;
}

.greeting-container .message-assistant {
  align-self: flex-start;
}

.greeting-container .message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background-color: transparent;
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.greeting-bubble {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.greeting-container .markdown-content {
  line-height: var(--chat-line-height);
  font-size: var(--chat-font-size);
}

.greeting-container .markdown-content :deep(p) {
  margin: 0 0 8px 0;
}

.greeting-container .markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.greeting-swipe {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.swipe-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-primary);
  transition: background-color 0.2s, border-color 0.2s;
}

.swipe-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.swipe-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.swipe-indicator {
  font-size: 12px;
  color: var(--text-secondary);
}

.greeting-preview {
  padding: 2px 0;
  max-width: 80%;
}

.greeting-preview-text {
  font-size: 12px;
  color: var(--text-tertiary, var(--text-secondary));
  opacity: 0.7;
  font-style: italic;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.messages-list {
  display: flex;
  flex-direction: column;
  width: min(100%, 720px);
  margin-inline: auto;
}

.message-wrapper {
  contain: content;
}

/* Streaming message bubble */
.message-bubble {
  padding: 6px 0;
  animation: fadeIn 0.25s ease-out;
}

.message-bubble.message-assistant {
  display: flex;
  gap: 10px;
  max-width: 720px;
  padding: 0 20px;
  width: 100%;
  margin-inline: auto;
}

.streaming .avatar-col {
  flex-shrink: 0;
  padding-top: 4px;
}

.streaming .char-avatar {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.streaming .bubble-col {
  min-width: 0;
  max-width: 100%;
  flex: 1;
}

.streaming {
  /* No pulse — the typing cursor provides enough visual feedback */
}

.streaming-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding: 0 4px;
}

.streaming-author {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.streaming .message-content {
  position: relative;
  padding: 12px 16px;
  background: transparent;
  border-radius: 12px;
  font-family: var(--font-reading);
  font-size: var(--chat-font-size);
  line-height: var(--chat-line-height);
  word-wrap: break-word;
  min-height: 44px; /* Ensure container is visible even when empty */
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  margin-left: 2px;
  background: var(--accent);
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background-color: var(--bg-surface);
  border-radius: 12px;
  width: fit-content;
  margin-bottom: 16px;
}

.typing-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-right: 8px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background-color: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  30% {
    transform: translateY(-10px);
    opacity: 1;
  }
}

.chat-input-container {
  flex-shrink: 0;
  width: min(100%, 768px);
  margin-inline: auto;
  padding: 12px 24px max(16px, env(safe-area-inset-bottom));
  background: var(--bg-base);
}

.generation-error,
.generation-status {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.generation-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-danger-text);
}

.generation-retry {
  flex-shrink: 0;
  color: var(--color-danger-text);
}

.next-responder-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.next-responder-avatar {
  flex-shrink: 0;
}

.next-responder-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-typing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.remote-typing-dots {
  display: flex;
  gap: 3px;
}

.remote-typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder, #a8abb2);
  animation: remote-typing-bounce 1.4s infinite ease-in-out;
}

.remote-typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.remote-typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes remote-typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Scrollbar styling */
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  background: var(--border-default);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--surface-active);
  border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Pull-to-refresh styles */
.pull-refresh-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 0;
  overflow: visible;
  transition: opacity var(--duration-fast) var(--ease-out);
  pointer-events: none;
  flex-shrink: 0;
}

.pull-refresh-indicator.refreshing {
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-arrow {
  font-size: 18px;
  color: var(--text-secondary);
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-spinner {
  font-size: 18px;
  color: var(--accent-text);
}

.pull-refresh-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.loading-older {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.no-more-messages {
  text-align: center;
  padding: 12px;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* Group chat header styles */
.stacked-avatars {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.stacked-avatar {
  border: 2px solid var(--bg-surface);
  position: relative;
}

/* Manage characters dialog */
.manage-characters-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.manage-character-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
}

.manage-character-item.clickable {
  cursor: pointer;
}

.manage-character-item.clickable:hover {
  background: var(--surface-hover);
}

.manage-character-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.manage-add-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}

.add-character-search {
  margin-bottom: 12px;
}

.add-character-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.add-character-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

@include below(md) {
  /* 第一行：标题（给汉堡按钮让位）；第二行：操作区右对齐、放不下就换行，不撑出横向滚动 */
  .chat-header {
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 4px 8px;
  }
  .chat-info {
    flex: 1 1 100%;
    width: 100%;
  }
  .chat-details {
    flex: 1;
  }
  .chat-subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-header .chat-title {
    font-size: 14px;
  }
  .chat-actions {
    flex: 1 1 100%;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }
  .model-select {
    width: 120px;
  }
  .chat-search-bar {
    padding: 8px 12px;
  }
  .chat-messages {
    padding: 12px;
    /* 兜底：任何未收敛的宽内容都不应让整个对话页出现横向滚动 */
    overflow-x: hidden;
  }
  .message-bubble.message-assistant {
    padding: 0 8px;
  }
  .greeting-container {
    padding: 0;
  }
  .greeting-container .message-bubble,
  .greeting-preview {
    max-width: 100%;
  }
  .intelligence-drawer :deep(.el-drawer) {
    width: 100% !important;
  }
  .pull-refresh-indicator {
    font-size: 12px;
  }
}

.snapshot-result {
  margin-top: 16px;
}

.empty-pinned {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.pinned-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pinned-item {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter, #fafafa);
  border: 1px solid var(--border-default);
}

.pinned-role {
  font-weight: 600;
  font-size: 12px;
  color: var(--el-color-primary, #409eff);
  margin-bottom: 4px;
  text-transform: capitalize;
}

.pinned-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
}

@include below(md) {
  .chat-header {
    min-height: 56px;
    padding: 10px 16px;
  }

  .chat-messages {
    padding: 24px 16px 16px;
  }

  .chat-input-container {
    padding-inline: 12px;
  }

}
</style>
