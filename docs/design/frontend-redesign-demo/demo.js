const stories = [
  { id: 0, title: '最后一班列车没有终点', hook: '午夜上车后，你发现检票员知道你的名字。', tags: ['悬疑', '慢热'], author: '雨夜书店', art: 'train', cover: '末班列车\n没有终点', role: '检票员', identity: '一个错过末班车、仍然决定上车的人', opening: '车门合拢，站台上的钟停在了十二点。\n\n检票员没有看你的车票，却准确地叫出了你的名字。\n\n“请坐。你想去的地方，和这张票上写的，是同一个吗？”', reply: '检票员低头看了一眼车票，没有立刻回答。\n\n“也许不是车票选中了你。”他把打孔器放在桌边，指向窗外那盏一直没有远去的灯。\n\n“如果你想知道，可以先告诉我——你为什么还没有下车？”' },
  { id: 1, title: '月光下的无名旅人', hook: '森林边缘，一封写给你的旧信，正在等你拆开。', tags: ['奇幻', '冒险'], author: '北方星尘', art: 'forest', cover: '月光之下\n有人等你', role: '守林人', identity: '收到一封没有署名的来信、独自走入森林的旅人', opening: '月光落在信封的封蜡上。\n\n守林人举起提灯，照见你手中那枚熟悉的纹章。\n\n“你终于来了。不过在进去之前，我想先听听你的名字。”', reply: '守林人把提灯挪向小径。树影之间，一座木桥缓缓显露出来。\n\n“信里有一句话被雨水洗掉了，”他说，“你愿意和我一起找回它吗？”' },
  { id: 2, title: '周三下午四点十七分', hook: '咖啡店的常客，今天第一次坐到了你的桌边。', tags: ['日常', '关系'], author: '枝叶之间', art: 'cafe', cover: '周三下午\n四点十七分', role: '沈栖', identity: '在街角咖啡店躲雨、习惯坐在靠窗位置的人', opening: '雨水顺着玻璃留下细细的痕迹。\n\n“这里有人吗？”那位总在同一时间出现的常客停在桌旁，手里拿着两张音乐会的票。\n\n他像是还想说些什么，却先等着你的回答。', reply: '沈栖笑了笑，把一张票推到桌子中间。\n\n“本来打算一个人去的。”他望向窗外，“但刚才听见你哼了同一首歌，觉得也许可以问问你。”' },
];
const content = document.querySelector('#content');
const modal = document.querySelector('#modal');
const scenarioControl = document.querySelector('#scenario');
const sessions = [{ id: 1, storyId: 0, name: '林岚', identity: stories[0].identity, draft: '', messages: [{ role: 'assistant', text: stories[0].opening }], status: '' }];
const favorites = new Set();
let nextSessionId = 2;
let query = '';
let genre = '全部';
let onlyFavorites = false;
let generation = null;
let noticeTimer;
let returnFocus;

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function route() { return (location.hash.slice(1) || 'discover').split('/'); }
function activeSession() { return sessions.find(session => session.id === Number(route()[1])); }
function showNotice(message) {
  clearTimeout(noticeTimer);
  document.querySelector('#notice').textContent = message;
  noticeTimer = setTimeout(() => { document.querySelector('#notice').textContent = ''; }, 4500);
}
function navigate(destination) {
  if (location.hash === `#${destination}`) render();
  else location.hash = destination;
}
function tags(story) { return `<div class="tags">${story.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`; }
function cover(story) { return `<div class="cover ${story.art}" aria-hidden="true"><span class="cover-number">STORY / 0${story.id + 1}</span><span class="cover-label">${story.cover.replace('\n', '<br>')}</span></div>`; }
function storyCard(story) {
  return `<article class="story-card">${cover(story)}<div class="card-copy"><h3>${story.title}</h3><p>${story.hook}</p>${tags(story)}<div class="card-bottom"><a class="card-link" href="#detail/${story.id}">走进故事 ↗</a><button class="favorite" data-action="favorite" data-id="${story.id}" aria-label="收藏${story.title}" aria-pressed="${favorites.has(story.id)}">${favorites.has(story.id) ? '♥' : '♡'}</button></div></div></article>`;
}
function continueCard(session) {
  const story = stories[session.storyId];
  return `<article class="continue"><div class="mini-art" aria-hidden="true"></div><div class="grow"><p>继续上次的故事 · 示例记录 ${session.id}</p><h2>${story.title}</h2><p>你的身份：${escapeText(session.name)} · ${session.messages.length} 条示例消息</p></div><button data-action="continue" data-id="${session.id}">继续阅读 ↗</button></article>`;
}
function emptyState(title, description, action = 'discover', label = '发现故事') {
  return `<div class="empty"><div class="empty-symbol" aria-hidden="true">✧</div><h2>${title}</h2><p>${description}</p><button class="primary" data-action="${action}">${label}</button></div>`;
}
function renderResults() {
  const results = document.querySelector('#results');
  if (!results) return;
  const scenario = scenarioControl.value;
  if (scenario === 'error') { results.innerHTML = emptyState('故事暂时没有加载出来', '这是加载失败的演示，不等于没有故事。', 'reset-state', '重试加载'); return; }
  if (scenario === 'empty') { results.innerHTML = emptyState('这里的故事，还在等待开场', '没有公开故事时不展示虚构推荐，可以先了解创作。', 'create', '了解创作'); return; }
  const matched = stories.filter(story => (genre === '全部' || story.tags.includes(genre)) && (!onlyFavorites || favorites.has(story.id)) && `${story.title}${story.hook}${story.tags.join('')}`.includes(query.trim()));
  results.innerHTML = matched.length ? `<div class="section-heading"><h2>${onlyFavorites ? '我收藏的故事' : '选一个开场，把之后留给自己'}</h2><small>${matched.length} 个示例</small></div><div class="story-grid">${matched.map(storyCard).join('')}</div>` : emptyState('没有找到符合条件的故事', '可以换一个词，或清除筛选重新看看。', 'clear-filters', '清除筛选');
}
function discover() {
  content.innerHTML = `<section class="intro"><div><p class="eyebrow">A LITTLE DISTANCE FROM EVERYDAY</p><h1>今天，想成为谁？</h1><p class="lead">一班没有终点的列车，一封迟到的来信。<br>选一段情境，故事从你的下一句话开始。</p></div><label class="search"><span>发现故事</span><input id="search" type="search" value="${escapeText(query)}" placeholder="搜索故事、题材或情境"></label></section>${scenarioControl.value === 'normal' ? continueCard(sessions.at(-1)) : ''}<div class="filters" aria-label="题材筛选">${['全部', '悬疑', '奇幻', '日常', '关系'].map(tag => `<button data-action="genre" data-genre="${tag}" aria-pressed="${genre === tag}">${tag}</button>`).join('')}<button data-action="favorites" aria-pressed="${onlyFavorites}">我的收藏</button></div><section id="results" aria-label="故事列表"></section>`;
  document.querySelector('#search').addEventListener('input', event => { query = event.target.value; renderResults(); });
  renderResults();
}
function detail(story) {
  const existing = sessions.findLast(session => session.storyId === story.id);
  content.innerHTML = `<a class="back" href="#discover">← 返回发现</a><div class="detail-grid">${cover(story)}<section><p class="eyebrow">${story.tags.join(' / ')} · 互动故事示例</p><h1>${story.title}</h1><p class="lead">${story.hook}</p>${tags(story)}<div class="detail-section"><h2>你会是谁</h2><p>${story.identity}。你决定自己的行动，角色不会替你作出选择。</p></div><div class="detail-section"><h2>故事从这里开始</h2><p>${escapeText(story.opening).replaceAll('\n', '<br>')}</p></div><small>作者：${story.author} · 角色与情境为演示内容</small><div class="actions">${existing ? `<button class="primary" data-action="continue" data-id="${existing.id}">继续故事</button>` : ''}<button class="${existing ? '' : 'primary'}" data-action="identity" data-id="${story.id}">${existing ? '开始新的故事' : '确认身份，进入故事'}</button></div><p class="check-note">可用点数仅为示例。真实费用以服务端账本为准；不承诺永久记忆或固定结局。</p></section></div>`;
}
function renderMessages(session) {
  const transcript = document.querySelector('#transcript');
  if (!transcript) return;
  const story = stories[session.storyId];
  transcript.innerHTML = session.messages.map(message => `<article class="message ${message.role === 'user' ? 'user-message' : ''}"><div class="speaker">${message.role === 'user' ? `${escapeText(session.name)} · 我的行动` : `${story.role} · 角色回应`}</div><p>${escapeText(message.text)}</p></article>`).join('');
}
function updateReaderControls(session) {
  const busy = generation?.session === session;
  const insufficient = scenarioControl.value === 'insufficient';
  const send = document.querySelector('#send');
  send.textContent = busy ? '停止生成' : '发送行动 ↑';
  send.disabled = !busy && (insufficient || !session.draft.trim());
  document.querySelector('#draft').disabled = Boolean(busy);
  document.querySelector('#balance').textContent = insufficient ? '示例可用 0 点 · 余额不足' : '示例可用 24.80 点';
  const status = document.querySelector('#reader-status');
  status.textContent = insufficient && !busy ? '余额不足，请查看点数；已输入的行动会保留。' : session.status;
  status.classList.toggle('error', insufficient || session.status.includes('失败'));
}
function reader(session) {
  const story = stories[session.storyId];
  content.innerHTML = `<a class="back" href="#library">← 我的故事</a><header class="reader-head"><div><h1>${story.title}</h1><p>你与${story.role} · 身份：${escapeText(session.name)}</p></div><button data-action="settings">阅读设置</button></header><div class="reading-column"><div class="scene-label">故事开场 / 示例正文</div><section id="transcript" aria-label="故事正文"></section></div><div id="reader-status" class="status" role="status" aria-live="polite"></div><form class="composer" id="composer"><label for="draft" class="eyebrow">接下来，你想做什么？</label><textarea id="draft" maxlength="1500" placeholder="描述你的行动，或说出你的台词……">${escapeText(session.draft)}</textarea><div class="composer-bottom"><span>${escapeText(session.name)} · 以自己的身份参与</span><button class="primary" id="send" type="submit">发送行动 ↑</button></div></form><div class="cost-row"><span id="balance"></span><button class="text-button" data-action="credits">查看点数与明细 ↗</button></div><p class="reader-hint">演示回复为预写文本，不调用模型或扣费。Enter 发送 · Shift + Enter 换行</p>`;
  renderMessages(session);
  updateReaderControls(session);
  document.querySelector('#draft').addEventListener('input', event => { session.draft = event.target.value; updateReaderControls(session); });
  document.querySelector('#draft').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(session); }
  });
  document.querySelector('#composer').addEventListener('submit', event => { event.preventDefault(); sendMessage(session); });
}
function stopGeneration() {
  if (!generation) return;
  clearInterval(generation.timer);
  generation.session.status = '已停止模拟生成，部分正文保留。本次没有真实扣费。';
  generation = null;
}
function sendMessage(session) {
  if (generation) { stopGeneration(); updateReaderControls(session); return; }
  if (!session.draft.trim() || scenarioControl.value === 'insufficient') return;
  if (scenarioControl.value === 'failure') {
    session.status = '模拟生成失败：服务暂不可用。草稿保留，未提交真实请求；切换“正常”后可重新发送。';
    updateReaderControls(session);
    return;
  }
  session.messages.push({ role: 'user', text: session.draft.trim() });
  session.draft = '';
  document.querySelector('#draft').value = '';
  const reply = { role: 'assistant', text: '' };
  session.messages.push(reply);
  session.status = '正在模拟角色回应……可随时停止';
  generation = { session, timer: null };
  renderMessages(session);
  updateReaderControls(session);
  const full = stories[session.storyId].reply;
  generation.timer = setInterval(() => {
    const nearBottom = window.scrollY + innerHeight >= document.documentElement.scrollHeight - 140;
    reply.text = full.slice(0, reply.text.length + 3);
    renderMessages(session);
    if (reply.text.length === full.length) {
      clearInterval(generation.timer);
      generation = null;
      session.status = '示例回应已结束 · 没有真实调用或扣费';
      updateReaderControls(session);
    }
    if (nearBottom) window.scrollTo(0, document.documentElement.scrollHeight);
  }, 75);
}
function openModal(html) {
  returnFocus = document.activeElement;
  document.querySelector('#modal-content').innerHTML = html;
  modal.showModal();
  const input = modal.querySelector('input');
  if (input) input.focus();
}
function showIdentity(story) {
  openModal(`<p class="eyebrow">进入故事前 / 示例身份</p><h2 id="modal-title">你想如何出现？</h2><p>名字与身份只用于这次演示，不会修改任何真实账号。</p><form id="identity-form"><label>你的名字<input name="name" value="林岚" required maxlength="30" autocomplete="off"></label><label>简单介绍你的身份<textarea name="identity" maxlength="200">${story.identity}</textarea></label><p class="check-note">示例模型：本地预写文本 · 不调用 AI<br>示例点数：${scenarioControl.value === 'insufficient' ? '0' : '24.80'} 点 · 此演示不扣费</p><div class="actions"><button type="button" data-action="close">暂不进入</button><button class="primary" type="submit">进入故事</button></div></form>`);
  document.querySelector('#identity-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name')).trim();
    if (!name) { event.target.elements.name.setCustomValidity('请输入名字'); event.target.elements.name.reportValidity(); return; }
    const session = { id: nextSessionId++, storyId: story.id, name, identity: String(data.get('identity')), draft: '', messages: [{ role: 'assistant', text: story.opening }], status: '' };
    sessions.push(session);
    modal.close();
    navigate(`reader/${session.id}`);
  });
  document.querySelector('[name=name]').addEventListener('input', event => event.target.setCustomValidity(''));
}
function showCredits() {
  openModal(`<p class="eyebrow">费用透明 / 模拟数据</p><h2 id="modal-title">点数用在故事里</h2><div class="account-amount">${scenarioControl.value === 'insufficient' ? '0.00' : '24.80'} <small>示例点数</small></div><div class="row"><span>示例冻结</span><strong>0.00 点</strong></div><div class="row"><span>示例历史消费</span><strong>0.12 点</strong></div><p class="check-note">以上为固定展示值，不随模拟发送变化，也不是价格承诺。生产页的可用、冻结与扣费必须读取真实账本。</p><button data-action="credits-story">查看示例关联故事 ↗</button><p class="check-note">此演示不提供充值，不创建订单。</p>`);
}
function showSettings() {
  openModal(`<p class="eyebrow">让阅读更适合你</p><h2 id="modal-title">阅读设置</h2><p>正文字号</p><div class="setting-options">${[15, 17, 19].map(size => `<button data-action="font" data-size="${size}" aria-pressed="${(document.documentElement.style.getPropertyValue('--reading-size') || '17px') === `${size}px`}">${size === 15 ? '紧凑' : size === 17 ? '标准' : '舒适'} ${size}</button>`).join('')}</div><div class="detail-section"><h2>当前模型</h2><p>示例文本 · 不接入真实模型</p></div><div class="detail-section"><h2>高级能力如何放置</h2><p>生产改版会在此分组放置模型、记忆、世界设定、搜索与导出，保留权限与既有能力。演示不模拟这些功能已实现。</p></div>`);
}
function render() {
  const [page, identifier] = route();
  document.querySelector('#sidebar-balance').textContent = scenarioControl.value === 'insufficient' ? '0.00' : '24.80';
  const primary = ['detail', 'discover'].includes(page) ? 'discover' : page === 'reader' ? 'library' : page;
  document.body.classList.toggle('reader-mode', page === 'reader');
  document.querySelectorAll('.main-nav a,.mobile-nav a').forEach(link => {
    if (link.hash === `#${primary}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const labels = { discover: '发现', detail: '发现 / 故事介绍', library: '我的故事', reader: '我的故事 / 正在阅读', create: '创作', account: '我的' };
  document.querySelector('#breadcrumb').textContent = labels[page] || '未找到页面';
  if (page === 'discover') discover();
  else if (page === 'detail' && stories[Number(identifier)]) detail(stories[Number(identifier)]);
  else if (page === 'reader' && activeSession()) reader(activeSession());
  else if (page === 'library') content.innerHTML = `<p class="eyebrow">YOUR UNFINISHED CHAPTERS</p><h1>故事，等你续写。</h1><p class="lead">不必重新开始。回到上一次停下的地方。</p><div class="library-list">${scenarioControl.value === 'empty' ? emptyState('你的第一段故事，还没有开始', '从一个感兴趣的情境开始，确认身份后再进入。') : scenarioControl.value === 'error' ? emptyState('暂时无法读取故事', '历史是否存在还不能确定，请重试。', 'reset-state', '重试') : [...sessions].reverse().map(continueCard).join('')}</div><div class="actions"><button data-action="discover">探索新的故事 ↗</button></div>`;
  else if (page === 'create') content.innerHTML = `<p class="eyebrow">MAKE ROOM FOR ANOTHER LIFE</p><h1>给故事，一个开场。</h1><p class="lead">先定义相遇的那一刻，把之后的可能留给参与者。</p><div class="panel-grid"><section class="panel"><h2>一张故事卡的诞生</h2><label>故事标题<input id="author-title" value="雨夜留声馆" maxlength="80"></label><label>公开情境<textarea id="author-hook" maxlength="300">雨停之前，你在旧唱片里听见了自己的声音。</textarea></label><button class="primary" data-action="preview">预览公开介绍</button><p class="check-note">仅内存预览，不保存、不发布，不含真实编辑器的全部字段。</p></section><section class="panel"><p class="eyebrow">创作空间的次级入口</p><h2>创作，不是填满参数。</h2><p>先讲清楚谁会相遇、从哪里开始，再完善角色与世界。</p><div class="row"><span>01 · 公开介绍与封面</span><span>读者可见</span></div><div class="row"><span>02 · 角色与世界设定</span><span>创作工具</span></div><div class="row"><span>03 · 预览与审核发布</span><span>服务端校验</span></div><p class="check-note">生产改版复用现有导入、编辑和审核，不用这份样板替代真实工作流。</p></section></div>`;
  else if (page === 'account') content.innerHTML = `<p class="eyebrow">YOUR CORNER OF THE TABLE</p><h1>我的小方桌</h1><p class="lead">管理自己的身份、阅读偏好与点数。复杂设置不必打扰每一次阅读。</p><div class="panel-grid"><section class="panel"><h2>点数与使用记录</h2><div class="account-amount">${scenarioControl.value === 'insufficient' ? '0.00' : '24.80'} <small>示例点数</small></div><p>冻结与实际消费分开呈现，账本是唯一依据。</p><button data-action="credits">查看示例明细</button></section><section class="panel"><h2>身份与阅读</h2><div class="user"><span class="avatar">林</span><span>林岚<small>样例身份，不是真实登录用户</small></span></div><div class="actions"><button data-action="settings">阅读偏好</button></div><p class="check-note">生产的账号安全、身份管理、帮助与管理员入口将作为此处次级导航；演示不处理认证。</p></section></div>`;
  else content.innerHTML = emptyState('这页故事还不存在', '请回到发现重新选择。');
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (['discover', 'create'].includes(action)) navigate(action);
  else if (action === 'continue') navigate(`reader/${button.dataset.id}`);
  else if (action === 'identity') showIdentity(stories[Number(button.dataset.id)]);
  else if (action === 'credits') showCredits();
  else if (action === 'settings') showSettings();
  else if (action === 'close') modal.close();
  else if (action === 'credits-story') { modal.close(); navigate('reader/1'); }
  else if (action === 'font') {
    document.documentElement.style.setProperty('--reading-size', `${button.dataset.size}px`);
    modal.querySelectorAll('[data-action=font]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  } else if (action === 'favorite') {
    const identifier = Number(button.dataset.id);
    if (favorites.has(identifier)) favorites.delete(identifier); else favorites.add(identifier);
    button.setAttribute('aria-pressed', String(favorites.has(identifier)));
    button.textContent = favorites.has(identifier) ? '♥' : '♡';
    showNotice(favorites.has(identifier) ? '已加入演示收藏，刷新后重置' : '已取消演示收藏');
    if (onlyFavorites) { renderResults(); document.querySelector('[data-action=favorites]')?.focus(); }
  } else if (action === 'genre') {
    genre = button.dataset.genre;
    document.querySelectorAll('[data-genre]').forEach(option => option.setAttribute('aria-pressed', String(option.dataset.genre === genre)));
    renderResults();
  } else if (action === 'favorites') { onlyFavorites = !onlyFavorites; button.setAttribute('aria-pressed', String(onlyFavorites)); renderResults(); }
  else if (action === 'clear-filters') { query = ''; genre = '全部'; onlyFavorites = false; discover(); }
  else if (action === 'reset-state') { scenarioControl.value = 'normal'; render(); }
  else if (action === 'preview') {
    openModal(`<p class="eyebrow">创作预览 / 未保存</p><h2 id="modal-title">${escapeText(document.querySelector('#author-title').value || '未命名故事')}</h2><p>${escapeText(document.querySelector('#author-hook').value || '请补充公开情境。')}</p><p class="check-note">这里仅验证信息层级；生产预览必须共用实际故事卡与阅读组件。</p>`);
  }
});
document.querySelector('.modal-close').addEventListener('click', () => modal.close());
modal.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
modal.addEventListener('click', event => {
  const bounds = modal.getBoundingClientRect();
  if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) modal.close();
});
document.querySelector('#theme-toggle').addEventListener('click', event => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  event.currentTarget.textContent = dark ? '☾' : '☀';
  event.currentTarget.setAttribute('aria-label', dark ? '切换到深色主题' : '切换到浅色主题');
});
scenarioControl.addEventListener('change', () => { stopGeneration(); render(); });
window.addEventListener('hashchange', () => { stopGeneration(); clearTimeout(noticeTimer); document.querySelector('#notice').textContent = ''; if (modal.open) modal.close(); render(); window.scrollTo(0, 0); content.focus({ preventScroll: true }); });
render();
