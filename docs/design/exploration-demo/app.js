const storageKey = 'small-squaretable-exploration-demo-v1';
const definitions = {
  orbit: {
    title: '雾海之外', tag: '太空探索 · 同伴 · 线索', identity: '你的身份：独立航船的船长', subtitle: '一艘属于你的船，一段尚未决定的航程。',
    description: '领航员发现了两份互相矛盾的航行记录。这次，由你决定从哪里查起。',
    person: '林澈', role: '领航员 · 与你同行', initialLocation: '白隼号 · 维修舱',
    opening: ['舷窗之外，星港的灯光没入薄雾。白隼号安静地停在泊位上，直到林澈把两张航行记录放到你的面前。', '目的地相同，出发时间却相差六个小时。其中一张的页脚，留着一道未擦干净的蓝色印记。'],
    dialogue: '“调度员说是登记错误。”她把记录推近了一点，“但我想先听听你的判断。”',
    help: '可试着输入“核对记录的时间”“问问林澈”或“前往调度室”。这些会进入预写分支；未覆盖的表达会保留在输入框中。',
    tabs: [['overview', '概况'], ['people', '人物'], ['items', '物品'], ['map', '地图']],
  },
  book: {
    title: '晚一点开门', tag: '小城日常 · 自由节奏 · 共同约定', identity: '你的身份：新来的书店店主', subtitle: '一间小店，可以按你的节奏开始。',
    description: '邻居送来了备用钥匙。你可以聊聊这里，也可以先决定一个自己喜欢的开门时间。',
    person: '许宁', role: '隔壁花店的店主', initialLocation: '南巷 · 你的书店',
    opening: ['午后的光落在空书架上。你刚把最后一只纸箱搬进店里，门口就响起了很轻的敲门声。', '许宁递来一把系着绿色丝带的钥匙，又望了一眼还没有写字的营业牌。'],
    dialogue: '“备用钥匙，现在交给你。你准备几点开门？以后我来，就按你的时间。”',
    help: '可试着输入“我想晚一点开门”“问问许宁”或“约好下次见面”。回复和约定均为预写样例，不是真实 AI。',
    tabs: [['overview', '概况'], ['people', '人物'], ['promises', '约定']],
  },
};
const artworks = {
  orbit: `<svg viewBox="0 0 600 230" role="img" aria-label="雾色星港中的航船插画" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="space" x2="1" y2="1"><stop stop-color="#17292c"/><stop offset="1" stop-color="#4a6561"/></linearGradient><radialGradient id="planet"><stop stop-color="#cbbd8e"/><stop offset="1" stop-color="#6d8580"/></radialGradient></defs><rect width="600" height="230" fill="url(#space)"/><circle cx="440" cy="68" r="108" fill="url(#planet)" opacity=".7"/><ellipse cx="435" cy="88" rx="205" ry="47" transform="rotate(-18 435 88)" fill="none" stroke="#d1c7a3" stroke-width="1" opacity=".45"/><path d="M0 180 Q180 110 600 190 L600 230H0Z" fill="#102329" opacity=".7"/><path d="m197 121 106-36 48 31-59 19-18 22-24-13-47 5 20-20Z" fill="#131e20" stroke="#9ba99a" stroke-width="1.4"/><path d="m227 120 67-18 26 14-50 7" fill="none" stroke="#dbbf82"/><path d="m204 137-51 17m56-9-40 15" stroke="#d7b97c" opacity=".65"/><g fill="#eee0ba"><circle cx="70" cy="47" r="1"/><circle cx="169" cy="24" r="1.2"/><circle cx="282" cy="53" r="1"/><circle cx="548" cy="154" r="1.2"/><circle cx="96" cy="109" r=".8"/></g></svg>`,
  book: `<svg viewBox="0 0 600 230" role="img" aria-label="午后光线里的书店入口插画" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="shop" x2="0" y2="1"><stop stop-color="#6e705b"/><stop offset="1" stop-color="#394b40"/></linearGradient></defs><rect width="600" height="230" fill="url(#shop)"/><rect x="170" y="-10" width="265" height="270" rx="100" fill="#c3ae79"/><rect x="186" y="6" width="234" height="260" rx="94" fill="#2e3b31"/><rect x="219" y="60" width="168" height="171" fill="#ba9a60"/><path d="M219 115h168M300 60v171" stroke="#354336" stroke-width="8"/><path d="m355 60-136 135v36h51L387 114V60Z" fill="#ead49a" opacity=".4"/><rect x="229" y="166" width="149" height="7" fill="#504b35"/><g fill="#645d41"><rect x="235" y="132" width="12" height="34"/><rect x="251" y="125" width="15" height="41"/><rect x="270" y="139" width="10" height="27"/><rect x="322" y="133" width="18" height="33"/><rect x="344" y="126" width="11" height="40"/></g><path d="M116 230v-50m0 12q-33-38-39-9 10 28 39 20m0-16q31-40 42-14-9 30-42 32" stroke="#b5bd84" stroke-width="3" fill="#809365"/><path d="M91 213h49l-8 25h-32Z" fill="#c9ab74"/><path d="M475 0v60m-20 0h40l14 21h-68Z" stroke="#d7c18c" fill="#d7c18c"/><path d="m441 81-36 149h130L509 81" fill="#d6be7d" opacity=".08"/></svg>`,
};
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, symbol => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const element = id => document.getElementById(id);
function initialStory(key) {
  return { location: definitions[key].initialLocation, clock: key === 'orbit' ? '19:10' : '15:20', credits: 1260, hours: '09:00', flags: {}, facts: [], turns: [], draft: '', started: false };
}
function freshData() { return { version: 1, theme: 'dark', font: 19, stories: { orbit: initialStory('orbit'), book: initialStory('book') } }; }
let data = freshData();
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved?.version === 1 && ['orbit', 'book'].every(key => Array.isArray(saved.stories?.[key]?.turns) && Array.isArray(saved.stories[key].facts) && saved.stories[key].flags && typeof saved.stories[key].draft === 'string')) data = saved;
} catch { storageAvailable = false; }
let current = null;
let activeTab = 'overview';
let selectedNode = null;
let pending = null;
let failNext = false;
let lastRetry = null;
let errorMessage = '';
let composing = false;
let drawerTrigger = null;
let pageName = 'discover';
let pageStory = 'orbit';
let creatorLoaded = false;

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(data)); storageAvailable = true; }
  catch { storageAvailable = false; }
  element('save-status').textContent = storageAvailable ? (current ? '此浏览器已保存' : '本地样例') : '未能保存进度';
}
function applyAppearance() {
  document.documentElement.dataset.theme = data.theme === 'light' ? 'light' : 'dark';
  document.documentElement.style.setProperty('--reading-size', `${[17, 19, 21].includes(data.font) ? data.font : 19}px`);
  document.querySelectorAll('[data-font]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.font) === data.font)));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === data.theme)));
}
function renderGallery() {
  element('story-cards').innerHTML = Object.entries(definitions).map(([key, definition]) => {
    const state = data.stories[key];
    return `<article class="story-card"><a class="cover" href="#detail/${key}" aria-label="了解${definition.title}">${artworkFor(key, 'gallery')}<span class="cover-label">${key === 'orbit' ? 'BEYOND THE MIST' : 'A SLOWER MORNING'}</span></a><div class="card-body"><p class="card-tags">${definition.tag}</p><h2><a href="#detail/${key}">${definition.title}</a></h2><p>${definition.description}</p><div class="card-bottom"><small>${state.started ? `上次停在：${escapeText(state.location)}` : definition.identity}</small><button class="primary-button" data-start="${key}">${state.started ? '继续这段经历' : '开始这段经历'} <span aria-hidden="true">↗</span></button></div><a class="text-link card-detail-link" href="#detail/${key}">先了解这段故事 →</a></div></article>`;
  }).join('');
}
function artworkFor(key, place) {
  return artworks[key].replaceAll(/id="([^"]+)"/g, `id="${place}-$1"`).replaceAll(/url\(#([^)]+)\)/g, `url(#${place}-$1)`);
}
function paragraphs(values) { return `<div class="narrative">${values.map(value => `<p>${escapeText(value)}</p>`).join('')}</div>`; }
function dialogue(speaker, text) { return `<div class="dialogue"><div class="speaker"><span class="speaker-avatar" aria-hidden="true">${escapeText(speaker.slice(0, 1))}</span>${escapeText(speaker)}</div><p>${escapeText(text)}</p></div>`; }
function availableActions() {
  const state = data.stories[current];
  if (current === 'orbit') {
    const actions = [];
    if (!state.flags.record) actions.push(['inspect', '核对两张记录的时间', '观察']);
    if (!state.flags.asked) actions.push(['ask', '听听林澈的发现', '交流']);
    if (state.location.includes('维修舱')) actions.push(['travel_dispatch', '前往调度室了解情况', '前往']);
    else {
      if (!state.flags.source) actions.push(['source', '向调度员询问记录来源', '调查']);
      actions.push(['travel_repair', '与林澈一起返回维修舱', '前往']);
    }
    if (!actions.length) actions.push(['travel_dispatch', '前往调度室', '前往']);
    return actions.slice(0, 3);
  }
  const actions = [];
  if (!state.flags.late) actions.push(['hours', '这一次，我想晚一点开门', '表达']);
  if (!state.flags.asked) actions.push(['ask', '问问许宁与这间店的故事', '交流']);
  if (!state.flags.promise) actions.push(['promise', '约好下次一起挑选新书', '约定']);
  else if (!state.flags.visited) actions.push(['visit', '继续到约定的那个上午', '继续']);
  return actions;
}
function renderTranscript() {
  const state = data.stories[current];
  const definition = definitions[current];
  element('transcript').innerHTML = `${paragraphs(definition.opening)}${dialogue(definition.person, definition.dialogue)}` + state.turns.map((turn, index) => `<article class="turn" id="turn-${index}"><div class="user-action"><small>你的行动</small>${escapeText(turn.action)}</div>${paragraphs(turn.paragraphs)}${turn.dialogue ? dialogue(turn.speaker || definition.person, turn.dialogue) : ''}<div class="change-note">${turn.changes.map(change => `<span>${escapeText(change)}</span>`).join('')}</div></article>`).join('');
}
function factsMarkup(facts) {
  return facts.length ? facts.map(fact => `<div class="fact"><p>${escapeText(fact.text)}</p><button data-source="${fact.turn}">查看这段经历 ↗</button></div>`).join('') : '<p class="empty-note">新的经历会从你的行动中留下。此刻还没有新增记录。</p>';
}
function panelMarkup(prefix) {
  const state = data.stories[current];
  const definition = definitions[current];
  let content = '';
  if (activeTab === 'overview') {
    content = `<section class="panel-section"><h3>此刻，你在</h3><div class="location-card"><span class="location-symbol">⌖</span><strong>${escapeText(state.location)}</strong><small>${escapeText(state.clock)} · ${current === 'orbit' ? '停泊中 / 无资源消耗' : '按自己的节奏生活'}</small></div></section><section class="panel-section"><h3>${current === 'orbit' ? '你的航程' : '我的小店'}</h3>${current === 'orbit' ? `<div class="stat-row"><span>剧情信用点</span><strong>${state.credits.toLocaleString()} CR</strong></div><div class="stat-row"><span>当前线索</span><strong>${state.facts.filter(fact => fact.kind === 'clue').length} 条</strong></div><div class="stat-row"><span>航船</span><strong>白隼号 · 停泊</strong></div>` : `<div class="stat-row"><span>开门时间</span><strong>${escapeText(state.hours)}</strong></div><div class="stat-row"><span>共同约定</span><strong>${state.flags.promise ? state.flags.visited ? '已赴约' : '待赴约' : '尚未约定'}</strong></div>`}</section><section class="panel-section"><h3>与你同行的人</h3>${personMarkup()}</section><section class="panel-section"><h3>这段经历留下了什么</h3>${factsMarkup(state.facts.slice(-3))}</section>`;
  } else if (activeTab === 'people') {
    content = `<section class="panel-section">${personMarkup()}<p class="panel-copy">${current === 'orbit' ? '林澈负责航行与记录核对。她把疑点交给你，也愿意听你如何决定下一步。' : '许宁经营隔壁的花店。你可以和她熟悉起来，也可以慢慢决定相处的距离。'}</p></section><section class="panel-section"><h3>已经发生的共同经历</h3>${factsMarkup(state.facts.filter(fact => fact.kind !== 'clue'))}</section>`;
  } else if (activeTab === 'items') {
    content = `<section class="panel-section"><h3>随身资料</h3><div class="location-card"><strong>两份航行记录</strong><p class="panel-copy">${state.flags.record ? '核对后确认：06:10 与 12:10，相差六小时。第二份留下蓝色修订印记。' : '林澈带来的两份资料。想了解具体差异，可以在行动区选择核对记录。'}</p><small>查看此资料不会推进剧情</small></div></section><section class="panel-section"><h3>已确认线索</h3>${factsMarkup(state.facts.filter(fact => fact.kind === 'clue'))}</section>`;
  } else if (activeTab === 'promises') {
    content = `<section class="panel-section"><h3>我们说好的事</h3>${factsMarkup(state.facts.filter(fact => ['promise', 'preference'].includes(fact.kind)))}</section><p class="panel-copy">这里记录已经发生的表达和约定，不推测未说出口的感受。</p>`;
  } else if (activeTab === 'map') {
    const here = state.location.includes('维修舱') ? 'repair' : 'dispatch';
    const selected = selectedNode || here;
    content = `<section class="panel-section"><h3>已知地点 · 星港局部</h3><div class="node-map">${['repair', 'dispatch'].map((node, index) => `${index ? '<span class="node-line" aria-hidden="true"></span>' : ''}<button class="node ${node === here ? 'current' : ''} ${node === selected ? 'selected' : ''}" data-node="${node}" aria-pressed="${node === selected}">${node === 'repair' ? '白隼号 · 维修舱' : '星港 · 调度室'}<small>${node === here ? '你在这里' : '已知地点'}</small></button>`).join('')}</div><div class="map-detail"><h3>${selected === 'repair' ? '维修舱' : '调度室'}</h3><p>${selected === 'repair' ? '白隼号内整理航行资料的舱室。' : '负责本次航行登记的调度员在这里。'} 选择地点只查看说明；前往会推进剧情。</p>${selected !== here ? `<button class="primary-button" data-action="travel_${selected}" ${pending ? 'disabled' : ''}>前往${selected === 'repair' ? '维修舱' : '调度室'} →</button>` : '<p class="empty-note">当前所在地点</p>'}</div></section>`;
  }
  return `<div class="state-heading"><h2>此次游玩</h2><span>本地示例</span></div><div class="state-tabs" role="tablist" aria-label="游玩资料">${definition.tabs.map(([key, label]) => `<button id="${prefix}-tab-${key}" role="tab" data-tab="${key}" aria-selected="${activeTab === key}" aria-controls="${prefix}-panel" tabindex="${activeTab === key ? '0' : '-1'}">${label}</button>`).join('')}</div><div id="${prefix}-panel" role="tabpanel" aria-labelledby="${prefix}-tab-${activeTab}">${content}</div>`;
}
function personMarkup() { return `<div class="person"><span class="portrait" aria-hidden="true">${definitions[current].person.slice(0, 1)}</span><div><strong>${definitions[current].person}</strong><small>${definitions[current].role}</small></div></div>`; }
function renderPanels() {
  if (!current) return;
  element('desktop-state').innerHTML = panelMarkup('desktop');
  element('mobile-state').innerHTML = panelMarkup('mobile');
}
function render() {
  applyAppearance();
  element('gallery').hidden = current !== null || pageName !== 'discover';
  element('reader').hidden = current === null;
  element('header-context').textContent = current ? `${definitions[current].title} / 独立样例存档` : '让每一个选择，留下回声。';
  element('save-status').textContent = pending ? '正在续写样例…' : storageAvailable ? current ? '此浏览器已保存' : '本地样例' : '未能保存进度';
  element('reset-button').disabled = !current || !!pending;
  renderGallery();
  renderSitePages();
  if (!current) return;
  const scroll = element('reading-scroll');
  const offset = scroll.scrollTop;
  const state = data.stories[current];
  element('scene-eyebrow').textContent = `${current === 'orbit' ? 'VOYAGE LOG' : 'A LIFE OF YOUR OWN'} / ${definitions[current].title}`;
  element('scene-title').textContent = state.location;
  element('scene-context').textContent = `${state.clock} · 在场：${state.identity || '你'}、${definitions[current].person}${state.location.includes('调度室') ? '、调度员' : ''}`;
  renderTranscript();
  element('choices').innerHTML = availableActions().map(([key, label, kind], index) => `<button class="choice" data-action="${key}" ${pending ? 'disabled' : ''}><span class="choice-number">0${index + 1}</span><span class="choice-label">${label}</span><span class="choice-type">${kind}</span><span class="choice-arrow" aria-hidden="true">↗</span></button>`).join('') || '<p class="empty-note">这个样例片段暂告一段落。你可以查看留下的约定，或返回体验另一个故事。</p>';
  element('action-input').value = state.draft;
  element('action-input').disabled = !!pending;
  element('send-button').hidden = !!pending;
  element('stop-button').hidden = !pending;
  element('live-reply').hidden = !pending;
  element('live-text').textContent = pending?.visible || '';
  element('input-help').textContent = definitions[current].help;
  element('action-error').hidden = !errorMessage;
  element('error-text').textContent = errorMessage;
  element('retry-button').hidden = !lastRetry;
  renderPanels();
  scroll.scrollTop = offset;
}
function addFact(state, kind, text) { state.facts.push({ kind, text, turn: state.turns.length }); }
function advanceClock(state) {
  const previousTrips = state.turns.filter(turn => turn.changes.some(change => change.startsWith('位置更新'))).length;
  const minutes = 19 * 60 + 10 + (previousTrips + 1) * 10;
  const day = Math.floor(minutes / 1440);
  state.clock = `${day ? `第 ${day + 1} 日 ` : ''}${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function transition(action) {
  const state = structuredClone(data.stories[current]);
  let result;
  if (current === 'orbit') {
    if (action === 'inspect' && !state.flags.record) {
      state.flags.record = true;
      addFact(state, 'clue', '航行记录分别登记为 06:10 与 12:10，第二份带有蓝色修订印记。');
      result = { paragraphs: ['你将两份记录并排放在灯下。06:10，12:10。差异并不只是一个潦草的数字：第二张记录在签发之后，又被人修订过。', '林澈没有催促。她拿来一支笔，等你决定要标记哪一处。'], dialogue: '“六个小时。我们可以从改动记录的人查起。”', changes: ['线索 +1 · 时间差异', '剧情信用点未变化'] };
    } else if (action === 'ask' && !state.flags.asked) {
      state.flags.asked = true;
      addFact(state, 'relationship', '你听取了林澈的疑点：她希望先核对事实，再决定是否继续出港。');
      result = { paragraphs: ['你没有急着作出判断，而是请林澈把她注意到的细节说完。她把手指停在第二张记录的页脚。'], dialogue: '“我担心的不是晚六小时，是有人替我们作了决定。我想先查清楚，再听你定航线。”', changes: ['新增共同经历 · 听取林澈的判断'] };
    } else if (action === 'travel_dispatch' && state.location.includes('维修舱')) {
      state.location = '星港 · 调度室'; advanceClock(state);
      addFact(state, 'event', '你与林澈从维修舱来到调度室，准备询问航行记录。');
      result = { paragraphs: ['你收好记录，示意林澈一起去调度室。穿过短短的连廊，泊位的灯光渐渐留在身后。', `调度员看见你手里的纸，停下了正在盖章的动作。墙上的钟指向 ${state.clock}。`], dialogue: '“你们是白隼号的人？想核对哪一份？”', speaker: '调度员', changes: ['位置更新 · 调度室', '剧情时间 +10 分钟'] };
    } else if (action === 'travel_repair' && state.location.includes('调度室')) {
      state.location = '白隼号 · 维修舱'; advanceClock(state);
      addFact(state, 'event', '你与林澈返回白隼号，保留了已经获得的资料。');
      result = { paragraphs: ['你们沿连廊回到白隼号。林澈把记录放回桌上，已经确认的疑点仍清楚地标在纸边。'], dialogue: '“接下来怎么查，听你的。”', changes: ['位置更新 · 维修舱', '已发现线索保留'] };
    } else if (action === 'source' && !state.flags.source && state.location.includes('调度室')) {
      state.flags.source = true;
      addFact(state, 'clue', '调度员指出修订通知来自港务处；原因尚未确认。');
      result = { paragraphs: ['调度员翻出一份修订通知，上面只有港务处的落款。他承认时间被更改过，但无法解释原因。', '这回答了一部分问题，也留下了下一步的方向。你把通知来源记下来，没有替未知的事情下结论。'], dialogue: '“至少现在，我们知道该向谁继续问了。”', changes: ['线索 +1 · 通知来源'] };
    }
  } else {
    if (action === 'hours' && !state.flags.late) {
      state.flags.late = true; state.hours = '10:00';
      addFact(state, 'preference', '你希望按自己的节奏生活，把书店的开门时间定在 10:00。');
      if (state.flags.promise && !state.flags.visited) {
        addFact(state, 'promise', '你与许宁将先前 09:30 的选书约定改为 10:30，以此约定为准。');
      }
      result = { paragraphs: ['你拿起笔，在营业牌上写下“十点”。这一次，不必沿用谁的时间表。', '许宁看了一眼新写的字，轻轻把备用钥匙推到你手边。'], dialogue: state.flags.promise && !state.flags.visited ? '“那我们也晚一点见。十点半，我带着书过来。”' : '“那就十点。以后来找你，我会记得的。”', changes: ['开门时间 · 09:00 → 10:00', '记录了你的生活偏好'] };
    } else if (action === 'ask' && !state.flags.asked) {
      state.flags.asked = true;
      addFact(state, 'relationship', '许宁告诉你，她喜欢在靠窗的位置翻书，愿意下次带两本喜欢的书来。');
      result = { paragraphs: ['你请她讲讲这间店以前的样子。她指了指还没有摆上椅子的窗边，语气渐渐松弛下来。'], dialogue: '“以前我总坐在那里。下次我带两本书来，你也可以告诉我，你想把这里变成什么样。”', changes: ['新增共同经历 · 窗边的位置'] };
    } else if (action === 'promise' && !state.flags.promise) {
      state.flags.promise = true;
      const time = state.flags.late ? '10:30' : '09:30';
      addFact(state, 'promise', `你与许宁约定下次开门后 ${time} 一起挑选新书。`);
      result = { paragraphs: ['你们约好了一个不匆忙的上午。许宁在小纸条上写下时间，把它留在柜台边。'], dialogue: `“${time}，我带书，你留个位置。那就说好了。”`, changes: [`新增约定 · ${time} 一起选书`] };
    } else if (action === 'visit' && state.flags.promise && !state.flags.visited) {
      state.flags.visited = true; state.clock = state.flags.late ? '次日 10:30' : '次日 09:30';
      addFact(state, 'event', `许宁按约定在 ${state.clock} 到来，带了两本书。`);
      result = { paragraphs: ['时间来到约定的那个上午。你翻过营业牌，不久后，门口传来熟悉的敲门声。', '许宁抱着两本书站在那里。她没有提前催你开门，也没有把上次的约定当成随口一句话。'], dialogue: state.flags.late ? '“十点以后再来，我记得。今天，我们先看哪一本？”' : '“九点半，刚刚好。今天，我们先看哪一本？”', changes: ['约定已赴约', '上次的表达影响了这次相遇'] };
    }
  }
  return result ? { state, ...result } : null;
}
function scrollToLatest() { const scroll = element('reading-scroll'); scroll.scrollTop = scroll.scrollHeight; element('new-content').hidden = true; }
function perform(action, customText) {
  if (!current || pending) return;
  const result = transition(action);
  if (!result) { errorMessage = '这个行动已经完成，或尚不适用于当前地点。可以查看已有记录或选择其他行动。'; lastRetry = null; render(); return; }
  const label = customText || availableActions().find(item => item[0] === action)?.[1] || (action === 'travel_repair' ? '返回维修舱' : '前往调度室');
  errorMessage = ''; lastRetry = null;
  data.stories[current].draft = label;
  persist();
  const responseText = [...result.paragraphs, result.dialogue ? `${result.speaker || definitions[current].person}：${result.dialogue}` : ''].filter(Boolean).join('\n\n');
  pending = { story: current, action, label, result, responseText, visible: '', progress: 0, fail: failNext, timer: null };
  failNext = false;
  element('failure-status').textContent = '';
  render();
  scrollToLatest();
  pending.timer = window.setInterval(() => {
    const running = pending;
    if (!running) return;
    if (running.fail) {
      clearInterval(running.timer); pending = null;
      lastRetry = { action: running.action, text: running.label };
      errorMessage = '本次模拟生成失败，输入已保留，剧情和状态没有推进。';
      render(); element('retry-button').focus(); return;
    }
    const scroll = element('reading-scroll');
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
    running.progress += 5;
    running.visible = running.responseText.slice(0, running.progress);
    element('live-text').textContent = running.visible;
    if (atBottom) scrollToLatest(); else element('new-content').hidden = false;
    if (running.progress >= running.responseText.length) {
      clearInterval(running.timer);
      const next = running.result.state;
      next.turns.push({ action: running.label, paragraphs: running.result.paragraphs, dialogue: running.result.dialogue, speaker: running.result.speaker, changes: running.result.changes });
      next.draft = '';
      data.stories[running.story] = next;
      pending = null; persist(); render();
      if (atBottom) scrollToLatest(); else element('new-content').hidden = false;
    }
  }, 28);
}
function stop() {
  if (!pending) return;
  const running = pending;
  clearInterval(running.timer);
  const state = data.stories[running.story];
  if (running.visible) state.turns.push({ action: running.label, paragraphs: [running.visible], changes: ['已停止 · 本轮未确认状态变化'] });
  pending = null; lastRetry = null;
  errorMessage = '已停止。收到的片段和输入已保留，本轮状态变化未提交。';
  persist(); render();
}
function openStory(key) {
  if (!definitions[key]) return;
  stop(); current = key; activeTab = 'overview'; selectedNode = null; errorMessage = ''; lastRetry = null;
  data.stories[key].started = true; persist(); render();
  element('scene-title').focus({ preventScroll: true });
  element('new-content').hidden = true;
  if (data.stories[key].turns.length) scrollToLatest();
  else element('reading-scroll').scrollTop = 0;
}
function sendInput() {
  if (!current || pending || composing) return;
  const text = element('action-input').value.trim();
  if (!text) return;
  data.stories[current].draft = text; persist();
  let action;
  if (current === 'orbit') {
    if (/前往.*调度|去.*调度|调度室/.test(text)) action = 'travel_dispatch';
    else if (/返回|回.*维修/.test(text)) action = 'travel_repair';
    else if (/来源|调度员/.test(text)) action = 'source';
    else if (/核对|记录|时间|查看/.test(text)) action = 'inspect';
    else if (/询问|问|林澈/.test(text)) action = 'ask';
  } else {
    if (/晚一点|晚点|晚一些|十点|10点|开门/.test(text)) action = 'hours';
    else if (/次日|赴约|约定的.*上午|继续/.test(text)) action = 'visit';
    else if (/约定|约好|选书|见面/.test(text)) action = 'promise';
    else if (/问|许宁|故事/.test(text)) action = 'ask';
  }
  if (action) perform(action, text);
  else { errorMessage = '演示尚未覆盖这类行动，输入已保留。请选择推荐行动，或展开“样例输入说明”查看支持的表达。'; lastRetry = null; render(); element('action-input').focus(); }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.start) navigate('play', button.dataset.start);
  if (button.dataset.themeChoice) { data.theme = button.dataset.themeChoice; applyAppearance(); persist(); }
  if (button.dataset.action) { if (element('state-dialog').open) element('state-dialog').close(); perform(button.dataset.action); }
  if (button.dataset.close) element(button.dataset.close).close();
  if (button.dataset.tab) {
    activeTab = button.dataset.tab;
    const prefix = button.id.startsWith('mobile') ? 'mobile' : 'desktop';
    renderPanels(); element(`${prefix}-tab-${activeTab}`).focus();
  }
  if (button.dataset.node) { selectedNode = button.dataset.node; const container = button.closest('#mobile-state') ? 'mobile-state' : 'desktop-state'; renderPanels(); element(container).querySelector(`[data-node="${selectedNode}"]`).focus(); }
  if (button.dataset.source !== undefined) { element('state-dialog').close(); element(`turn-${button.dataset.source}`)?.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  if (button.dataset.font) { data.font = Number(button.dataset.font); applyAppearance(); persist(); }
});
document.addEventListener('keydown', event => {
  const target = event.target;
  if (target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...target.parentElement.querySelectorAll('[role=tab]')];
  const index = tabs.indexOf(target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click();
});
element('home-button').addEventListener('click', () => navigate('discover'));
element('theme-button').addEventListener('click', () => { data.theme = data.theme === 'light' ? 'dark' : 'light'; applyAppearance(); persist(); });
element('settings-button').addEventListener('click', () => element('settings-dialog').showModal());
element('state-button').addEventListener('click', event => { drawerTrigger = event.currentTarget; element('state-dialog').showModal(); });
element('state-dialog').addEventListener('close', () => drawerTrigger?.focus({ preventScroll: true }));
element('arm-failure').addEventListener('click', () => { failNext = true; element('failure-status').textContent = '下一次行动将模拟失败，不会提交剧情或状态变化。'; });
element('reset-button').addEventListener('click', () => { if (!current || pending) return; element('settings-dialog').close(); element('reset-dialog').showModal(); });
element('confirm-reset').addEventListener('click', () => { if (!current || pending) return; data.stories[current] = initialStory(current); element('reset-dialog').close(); openStory(current); });
element('action-form').addEventListener('submit', event => { event.preventDefault(); sendInput(); });
element('action-input').addEventListener('compositionstart', () => { composing = true; });
element('action-input').addEventListener('compositionend', () => { composing = false; });
element('action-input').addEventListener('input', () => { if (current) { data.stories[current].draft = element('action-input').value; persist(); } });
element('action-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); sendInput(); } });
element('stop-button').addEventListener('click', stop);
element('retry-button').addEventListener('click', () => { if (lastRetry) perform(lastRetry.action, lastRetry.text); });
element('new-content').addEventListener('click', scrollToLatest);
element('reading-scroll').addEventListener('scroll', () => { const scroll = element('reading-scroll'); if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60) element('new-content').hidden = true; });
function navigate(page, story) {
  const hash = `#${page}${story ? `/${story}` : ''}`;
  if (location.hash === hash) showRoute();
  else location.hash = hash;
}
function showRoute() {
  const parts = location.hash.slice(1).split('/');
  const requested = parts[0] || 'discover';
  const pages = ['discover', 'detail', 'setup', 'play', 'stories', 'create', 'account'];
  const needsStory = ['detail', 'setup', 'play'].includes(requested);
  const valid = pages.includes(requested) && (!needsStory || Object.hasOwn(definitions, parts[1]));
  stop();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  pageName = valid ? requested : 'discover';
  pageStory = valid && needsStory ? parts[1] : 'orbit';
  if (!valid) history.replaceState(null, '', '#discover');
  current = null; errorMessage = ''; lastRetry = null;
  if (pageName === 'play') openStory(pageStory);
  else {
    render();
    const heading = document.querySelector('main:not([hidden]) h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}
function detailMarkup(key) {
  const definition = definitions[key];
  const state = data.stories[key];
  const space = key === 'orbit';
  return `<a class="back-link" href="#discover">← 返回发现</a><div class="detail-hero"><div class="detail-art">${artworkFor(key, 'detail')}</div><div class="detail-intro"><p class="eyebrow">${space ? 'BEYOND THE MIST' : 'A SLOWER MORNING'}</p><p class="card-tags">${definition.tag}</p><h1 tabindex="-1">${definition.title}</h1><p class="detail-subtitle">${definition.subtitle}</p><p class="detail-description">${definition.description}</p><div class="detail-actions"><button class="primary-button" data-start="${key}">${state.started ? '继续这段经历' : '直接开始'} ↗</button><a class="secondary-link" href="#setup/${key}">${state.started ? '查看这次的身份' : '调整我的称呼'}</a></div><small class="muted">${state.started ? '继续保留的本地进度，不会重新开局。' : '已有默认身份，无需配置世界或模型。'}</small></div></div><div class="detail-columns"><section class="surface-section"><p class="eyebrow">YOUR PLACE IN THIS STORY</p><h2>你会成为谁？</h2><p>${definition.identity.replace('你的身份：', '')}。${space ? '拥有自己的船，也拥有决定下一步航向的权利。' : '不必照着别人的时间表生活，可以慢慢决定这里的样子。'}</p><h3>与你相遇的人</h3>${personMarkupFor(key)}<h3>可以怎样参与</h3><div class="experience-tags">${(space ? ['核对线索', '与同伴交流', '探索已知地点'] : ['表达自己的偏好', '了解邻里往事', '留下共同约定']).map(label => `<span>${label}</span>`).join('')}</div></section><section class="surface-section"><p class="eyebrow">THE WORLD COMES WITH IT</p><h2>设定，随故事一起进入</h2><div class="binding-row"><span>◇</span><div><strong>${space ? '雾海星港 · 卡内背景' : '南巷生活 · 卡内背景'}</strong><small>${space ? '航船、星港与航行登记的基础设定。' : '书店、花店与邻里关系的基础设定。'}</small></div><span class="status-pill">自带</span></div><p>本例无需另选世界。只有作者明确绑定的补充资料，才应随卡加载。</p><details class="opening-preview"><summary>读一小段开场</summary><p>${definition.opening[0]}</p></details><p class="section-footnote">原创交互样例 · 预写片段。题材用于评审，不是上线内容承诺。</p></section></div>`;
}
function personMarkupFor(key) {
  const definition = definitions[key];
  return `<div class="person"><span class="portrait" aria-hidden="true">${definition.person.slice(0, 1)}</span><div><strong>${definition.person}</strong><small>${definition.role}</small></div></div>`;
}
function setupMarkup(key) {
  const definition = definitions[key];
  const state = data.stories[key];
  return `<a class="back-link" href="#detail/${key}">← ${definition.title}</a><div class="setup-layout"><div class="setup-intro"><p class="eyebrow">STEP INTO THE STORY</p><h1 tabindex="-1">带着你的名字，<br>走进这段经历。</h1><p>身份已经为你准备好。你可以直接出发，<br>也可以留下一个喜欢的称呼。</p><div class="setup-art">${artworkFor(key, 'setup')}</div></div><form id="identity-form" class="surface-section identity-form"><span class="status-pill">${state.started ? '此次游玩的身份' : '可选开局信息'}</span><h2>${definition.title}</h2><label for="identity-name">在这里，怎么称呼你？</label><input id="identity-name" name="identity" maxlength="24" value="${escapeText(state.identity || '')}" placeholder="留空，使用“你”" ${state.started ? 'readonly' : ''}><div class="identity-role"><span>你的身份</span><strong>${definition.identity.replace('你的身份：', '')}</strong><p>${key === 'orbit' ? '白隼号的船长。林澈会与你一起查清那两份记录。' : '南巷新来的书店店主。今天，你将收到一把备用钥匙。'}</p></div><div class="identity-binding"><span>◇</span>已带入本卡设定，无需再选世界</div><button class="primary-button" type="submit">${state.started ? '继续这段经历' : '以这个身份开始'} ↗</button><p class="section-footnote">${state.started ? '此示例每张卡保留一份进度。需要重开时，可在游玩设置中重置；这里不会改写已经发生的经历。' : '称呼仅保存在本次本地示例中，不改变你的账户资料。'}</p></form></div>`;
}
function storiesMarkup() {
  const stories = Object.entries(definitions).filter(([key]) => data.stories[key].started);
  return `<div class="page-heading heading-row"><div><p class="eyebrow">YOUR UNFINISHED ADVENTURES</p><h1 tabindex="-1">有些故事，<br>还在等你回来。</h1><p>从上次的地方继续。已经说过的话，不必再说一遍。</p></div><a class="secondary-link" href="#discover">寻找新的经历 ↗</a></div><div class="library-heading"><h2>我的故事 <span>${stories.length}</span></h2><span class="muted">此浏览器 · 每张示例卡一份进度</span></div>${stories.length ? `<div class="library-list">${stories.map(([key, definition]) => {
    const state = data.stories[key];
    const last = state.turns.at(-1);
    const excerpt = last ? last.paragraphs.join(' ').slice(0, 155) : definition.opening[0];
    return `<article class="library-card"><a class="library-art" href="#play/${key}" aria-label="继续${definition.title}">${artworkFor(key, 'library')}</a><div class="library-copy"><p class="card-tags">${escapeText(state.identity || definition.identity.replace('你的身份：', ''))} · ${escapeText(state.clock)}</p><h2>${definition.title}</h2><p class="library-excerpt">${escapeText(excerpt)}</p><div class="library-meta"><span>⌖ ${escapeText(state.location)}</span><span>${state.turns.length} 段记录</span>${state.draft ? '<span>有未发送的草稿</span>' : ''}</div></div><button class="primary-button" data-start="${key}">继续经历 ↗</button></article>`;
  }).join('')}</div>` : '<div class="library-empty"><span>◇</span><h2>你的第一段故事，还没有开始。</h2><p>选一个让你想走进去的场景。不需要先了解所有设定。</p><a class="primary-button" href="#discover">去发现一个起点 ↗</a></div>'}<div class="quiet-note"><span>◇</span><p>这里展示当前浏览器实际保存的示例进度。多存档、云端同步和长期记忆仍需正式系统支持。</p></div>`;
}
function accountMarkup() {
  const count = Object.values(data.stories).filter(story => story.started).length;
  return `<div class="page-heading"><p class="eyebrow">A SPACE OF YOUR OWN</p><h1 tabindex="-1">按你舒服的方式，<br>留在故事里。</h1><p>故事之外，也留一点安静的空间给自己。</p></div><div class="account-layout"><section class="surface-section account-profile"><div class="profile-avatar">旅</div><span class="status-pill">本地体验</span><h2>故事旅人</h2><p>这里还没有登录真实账户。所有示例进度只留在这个浏览器。</p><div class="account-count"><strong>${count}</strong><span>段已经开始的经历</span></div><a class="secondary-link" href="#stories">回到我的故事 →</a></section><div class="account-sections"><section class="surface-section"><h2>阅读偏好</h2><div class="preference-row"><div><strong>页面主题</strong><p>选择更适合此刻的光线。</p></div><div class="segmented"><button data-theme-choice="dark">暖黑</button><button data-theme-choice="light">暖纸</button></div></div><div class="preference-row"><div><strong>正文字号</strong><p>只调整故事正文，保留界面层级。</p></div><div class="segmented">${[17, 19, 21].map(size => `<button data-font="${size}">${size}px</button>`).join('')}</div></div></section><section class="surface-section"><h2>进度与数据</h2><div class="account-info-row"><span>保存位置</span><strong>当前浏览器</strong></div><div class="account-info-row"><span>云端同步</span><strong>未接入</strong></div><p class="section-footnote">清理浏览器站点数据会删除本地进度。单个故事可在游玩设置中重置，另一份进度不受影响。</p></section><section class="account-service-note"><h3>账户与余额</h3><p>此示例不连接登录、充值或订阅服务，不展示虚构余额，也不会产生费用。</p></section></div></div>`;
}
function renderSitePages() {
  document.documentElement.dataset.page = pageName;
  element('site-nav').hidden = current !== null;
  document.querySelectorAll('#site-nav a').forEach(link => {
    const active = link.hash === `#${['detail', 'setup'].includes(pageName) ? 'discover' : pageName}`;
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  for (const page of ['detail', 'setup', 'stories', 'create', 'account']) element(`page-${page}`).hidden = pageName !== page;
  if (pageName === 'detail') element('page-detail').innerHTML = detailMarkup(pageStory);
  if (pageName === 'setup') element('page-setup').innerHTML = setupMarkup(pageStory);
  if (pageName === 'stories') element('page-stories').innerHTML = storiesMarkup();
  if (pageName === 'account') element('page-account').innerHTML = accountMarkup();
  if (pageName === 'create' && !creatorLoaded) {
    const draft = data.creatorDraft || { title: '雨停之前', description: '回到久别的小城，在最后一班渡船开出前，与老朋友重新认识。', role: '回到故乡的旅人', opening: '雨把码头的路灯连成一片。你在候船室门口收起伞，听见有人叫出了你的名字。\n\n“好久不见。要不要等雨小一点，再走？”' };
    for (const field of ['title', 'description', 'role', 'opening']) element(`creator-${field}`).value = draft[field] || '';
    creatorLoaded = true;
    element('creator-save-status').textContent = data.creatorDraft ? '已从此浏览器恢复草稿' : '示例草稿 · 尚未保存';
    renderCreatorPreview();
  }
  applyAppearance();
  const titles = { discover: '发现', detail: definitions[pageStory].title, setup: '开局身份', play: current ? definitions[current].title : '探索游玩', stories: '我的故事', create: '创作', account: '我的' };
  document.title = `${titles[pageName]} · 小方桌交互示例`;
}
function renderCreatorPreview() {
  for (const field of ['title', 'description', 'role', 'opening']) element(`preview-${field}`).textContent = element(`creator-${field}`).value || { title: '尚未命名的故事', description: '一句话，让人想走进你的故事。', role: '玩家身份待补充', opening: '你的第一段开场，将在这里出现。' }[field];
}
document.addEventListener('submit', event => {
  if (event.target.id !== 'identity-form') return;
  event.preventDefault();
  if (!data.stories[pageStory].started) data.stories[pageStory].identity = element('identity-name').value.trim();
  persist();
  navigate('play', pageStory);
});
element('creator-form').addEventListener('input', () => { renderCreatorPreview(); element('creator-save-status').textContent = '有未保存的修改'; });
element('creator-form').addEventListener('submit', event => {
  event.preventDefault();
  data.creatorDraft = Object.fromEntries(['title', 'description', 'role', 'opening'].map(field => [field, element(`creator-${field}`).value]));
  persist();
  element('creator-save-status').textContent = storageAvailable ? '草稿已保存到此浏览器' : '未能保存，请保留当前页面后重试';
});
window.addEventListener('hashchange', showRoute);
window.addEventListener('beforeunload', () => { if (pending) stop(); });
showRoute();
