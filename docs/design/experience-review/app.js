const element = id => document.getElementById(id);
const storageKey = 'squaretable-experience-review-v1';
const pages = { discover: '发现', detail: '故事详情', identity: '可选身份', library: '我的故事', create: '创作', account: '账户', play: '游玩' };
const differences = {
  discover: '核对首次选卡、搜索与继续入口的层级。两侧使用相同故事素材；没有真实数据时不补造推荐数量。',
  detail: '重点差异：正式768px页面仍是横向封面与介绍，原型为通栏封面。身份/资料双卡在正式页以真实诊断和背景呈现；布局仍待确认。',
  identity: '可直接开始，也可使用真实账户人设；固定称呼和读取失败必须说明。两侧使用相同故事素材。',
  library: '核对继续原档、同卡另开与真实经历摘要。没有摘要时应显示缺省说明，不伪造保存成功。',
  create: '正式编辑器保留绑定、版本与完整字段，明显长于原型。两侧比较功能结构，数据并不相同；高级设置如何分组待确认。',
  account: '正式页使用真实账户资料、权限与阅读偏好，点数在独立页。两侧数据并不相同，原型余额不能作为正式验收依据。',
  play: '这是已归档正式构建的游玩页截图。没有同场景原型截图，因此不显示假的左右对照；下一步可试用独立的预写交互。',
};
const freshFeedback = () => ({ version: 1, status: 'unconfirmed_draft', pages: {}, actionMode: null, correctionNote: '' });
let feedback = freshFeedback();
let canPersist = true;
let storageMessage = '反馈仅保存在此浏览器，仍是待确认草稿。';
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || saved.status !== 'unconfirmed_draft' || !saved.pages || typeof saved.pages !== 'object' || Array.isArray(saved.pages)
      || ![null, 'draft', 'direct'].includes(saved.actionMode) || typeof saved.correctionNote !== 'string' || saved.correctionNote.length > 3000) throw new Error('Invalid draft');
    for (const [key, value] of Object.entries(saved.pages)) {
      if (!/^(discover|detail|identity|library|create|account|play)-(390|768|1440)-(light|dark)$/.test(key)
        || !value || !['pending', 'adjust', 'ready'].includes(value.verdict) || typeof value.note !== 'string' || value.note.length > 2000) throw new Error('Invalid page draft');
    }
    feedback = { version: 1, status: 'unconfirmed_draft', pages: saved.pages, actionMode: saved.actionMode, correctionNote: saved.correctionNote };
    storageMessage = '已恢复此浏览器的待确认反馈；不代表产品决策已确认。';
  }
} catch {
  canPersist = false;
  storageMessage = '浏览器存储不可用或旧草稿格式异常，未覆盖旧数据。本页新反馈可通过导出保留。';
}
function saveFeedback() {
  if (canPersist) {
    try { localStorage.setItem(storageKey, JSON.stringify(feedback)); storageMessage = '已保存在此浏览器 · 待确认草稿，没有上传或修改产品决策。'; }
    catch { canPersist = false; storageMessage = '浏览器未能保存；反馈仍在本页，请导出后再离开。'; }
  }
  element('storage-status').textContent = storageMessage;
  renderFeedback();
}
function pageKey() { return `${element('page-select').value}-${element('width-select').value}-${element('image-theme').value}`; }
function updateComparison() {
  const page = element('page-select').value;
  const width = element('width-select').value;
  const theme = element('image-theme').value;
  element('page-difference').textContent = differences[page];
  element('reference-link').hidden = page === 'play';
  element('reference-unavailable').hidden = page !== 'play';
  element('image-status').textContent = '正在读取已归档截图……';
  for (const kind of ['reference', 'production']) {
    if (page === 'play' && kind === 'reference') { element(`${kind}-image`).removeAttribute('src'); continue; }
    const path = page === 'play' ? `/play/play-${width}-${theme}.webp` : `/compare/${kind}-${page}-${width}-${theme}.webp`;
    element(`${kind}-link`).href = path;
    element(`${kind}-image`).src = path;
  }
  const saved = feedback.pages[pageKey()];
  element('page-verdict').value = saved?.verdict ?? 'pending';
  element('page-note').value = saved?.note ?? '';
}
function imageStatus() {
  const images = [element('production-image'), ...(element('page-select').value === 'play' ? [] : [element('reference-image')])];
  if (images.every(image => image.complete && image.naturalWidth > 0)) element('image-status').textContent = '截图已载入；点击图片可查看原尺寸。截图可见不等于视觉验收通过。';
}
for (const kind of ['reference', 'production']) {
  element(`${kind}-image`).addEventListener('load', imageStatus);
  element(`${kind}-image`).addEventListener('error', () => { element('image-status').textContent = '截图读取失败，请重新选择或刷新；不能将缺失图片当作通过。'; });
}
for (const id of ['page-select', 'width-select', 'image-theme']) element(id).addEventListener('change', updateComparison);
function savePageNote() {
  feedback.pages[pageKey()] = { verdict: element('page-verdict').value, note: element('page-note').value };
  saveFeedback();
}
element('page-verdict').addEventListener('change', savePageNote);
element('page-note').addEventListener('input', savePageNote);
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-pressed', String(tab === button));
  for (const section of document.querySelectorAll('.tab-panel')) section.hidden = section.id !== button.dataset.tab;
  element(button.dataset.tab).querySelector('h2').focus();
  renderFeedback();
});
element('theme-toggle').addEventListener('click', () => document.body.classList.toggle('dark'));
const desktopState = matchMedia('(min-width: 901px)');
element('state-details').open = desktopState.matches;
desktopState.addEventListener('change', event => { element('state-details').open = event.matches; });

const scenes = {
  harbor: {
    title: '雾港，钟声响起之前',
    text: '你递出二十枚金币。守卫收下钱，把通行证推到你面前。\n“天黑前去灯塔吧。她一直在等消息。”',
    source: '纠错用的预置矛盾：介绍信原文写着“持信者可免费领取通行证”，但示例中的这轮仍扣了钱。',
    state: [['金币', '100'], ['通行证', '已取得'], ['位置', '港口'], ['已记录经历', '支付20金币，领取通行证']],
    actions: ['询问是谁在灯塔等消息', '出示介绍信，询问为何收费'],
    note: '阅读标注：介绍信写着免费领取，这一处收费值得核对。',
    rewrite: '二十枚金币在木桌上轻响。守卫递来通行证，压低了声音：“天黑前去灯塔。有人在等你的消息。”',
    fact: '预写修正分支：守卫看过介绍信，免费将通行证交给你。',
    factState: [['金币', '120'], ['通行证', '已取得'], ['位置', '港口'], ['已记录经历', '凭介绍信免费领取通行证']],
    branch: '预写另一选择：你收起金币，暂不领取通行证，转身向码头的船夫问路。',
    branchState: [['金币', '120'], ['通行证', '尚未取得'], ['位置', '码头'], ['已记录经历', '向船夫问路；没有购买记录']],
  },
  bookshop: {
    title: '雨停之前，书店仍亮着灯',
    text: '“林小姐，下周四还在这里见吧。”她把那本旧诗集留在靠窗的桌上。\n你点了点头，答应了这次见面。',
    source: '纠错用的预置矛盾：此前可见原文是“叫我阿岚就好”，本轮却用了“林小姐”。本卡没有金币或关系分数。',
    state: [['希望的称呼', '阿岚'], ['已记录约定', '下周四在书店见面'], ['位置', '书店'], ['已知关系', '初识；对方愿意留书']],
    actions: ['问问她为什么留下这本诗集', '提醒她叫我阿岚就好'],
    note: '阅读标注：这里的称呼与此前约定不一致；标注本身不会改变人物记忆。',
    rewrite: '她将旧诗集轻轻放在窗边。“林小姐，下周四，我们还在这里见？”你点头应下。',
    fact: '预写修正分支：“阿岚，下周四还在这里见吧。”她把旧诗集留在窗边，你答应了这次见面。',
    factState: [['希望的称呼', '阿岚'], ['已记录约定', '下周四在书店见面'], ['位置', '书店'], ['称呼依据', '此前原文：叫我阿岚就好']],
    branch: '预写另一选择：你还没确定下周的安排，只请她暂时留着诗集，没有答应见面的日期。',
    branchState: [['希望的称呼', '阿岚'], ['已记录约定', '尚未约定见面日期'], ['位置', '书店'], ['已知关系', '初识；对方愿意留书']],
  },
};
let scene = scenes.harbor;
let pendingAction = false;
let actionTimer;
let composing = false;
let pendingRecommendation = '';
let correction = 'note';
function renderState(target, state) {
  target.replaceChildren();
  for (const [name, value] of state) {
    const term = document.createElement('dt'); term.textContent = name;
    const description = document.createElement('dd'); description.textContent = value;
    target.append(term, description);
  }
}
function setPending(value) {
  pendingAction = value;
  for (const button of element('recommendations').querySelectorAll('button')) button.disabled = value;
  element('send-action').disabled = value;
}
function submitAction(text, clearDraft) {
  if (pendingAction || !text.trim()) return;
  setPending(true);
  element('action-status').textContent = '正在演示提交状态……';
  const submitted = text.trim();
  if (clearDraft) element('action-draft').value = '';
  actionTimer = setTimeout(() => {
    setPending(false);
    element('action-status').textContent = `示例已接收行动：“${submitted}”。这里只演示提交动作，未生成后续剧情。`;
  }, 400);
}
function chooseRecommendation(text) {
  if (pendingAction) return;
  if (element('action-mode').value === 'direct') { submitAction(text, false); return; }
  if (element('action-draft').value.trim() && element('action-draft').value !== text) {
    pendingRecommendation = text;
    element('draft-dialog').showModal();
    return;
  }
  element('action-draft').value = text;
  element('action-draft').focus();
  element('action-status').textContent = '推荐已放入草稿，可以修改；尚未提交。';
}
function renderScene() {
  clearTimeout(actionTimer); setPending(false);
  scene = scenes[element('scene-select').value];
  element('scene-title').textContent = scene.title;
  element('original-text').textContent = scene.text;
  element('scene-source').textContent = scene.source;
  renderState(element('original-state'), scene.state);
  element('recommendations').replaceChildren();
  for (const text of scene.actions) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', () => chooseRecommendation(text));
    element('recommendations').append(button);
  }
  element('action-draft').value = '';
  element('action-status').textContent = '尚未提交示例行动。切换场景会重置预写示例。';
  element('correction-result').hidden = true;
}
element('scene-select').addEventListener('change', renderScene);
element('action-form').addEventListener('submit', event => { event.preventDefault(); if (!composing) submitAction(element('action-draft').value, true); });
element('action-draft').addEventListener('compositionstart', () => { composing = true; });
element('action-draft').addEventListener('compositionend', () => { composing = false; });
element('action-draft').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); submitAction(element('action-draft').value, true); }
});
element('keep-draft').addEventListener('click', () => element('draft-dialog').close());
element('replace-draft').addEventListener('click', () => {
  element('action-draft').value = pendingRecommendation;
  element('draft-dialog').close(); element('action-draft').focus();
  element('action-status').textContent = '已替换示例草稿，尚未提交。';
});
element('record-mode').addEventListener('click', () => { feedback.actionMode = element('action-mode').value; saveFeedback(); });

const corrections = {
  note: { title: '阅读标注', description: '把疑问留在原文旁；原文、已确认事实与后续人物认知保持原样。要改变人物认知，请讨论事实纠正。', impacts: [['原文', '保留；旁边显示阅读标注'], ['状态与记忆', '全部保持原样，标注不进入模型上下文'], ['原故事', '继续保留'], ['生成与消费', '不生成新内容']] },
  rewrite: { title: '同事件的表达候选', description: '先预览另一种说法。必须验证没有改变事件结果、关系和知情范围；无法证明一致时不能作为纯表达修订采用。', impacts: [['原文', '保留原文与候选版本；采用前不替换'], ['状态与记忆', '事实保持不变；不能夹带新设定或秘密'], ['并发边界', '后续轮次已开始或候选过期时拒绝采用'], ['生成与消费', '真实新生成按既有规则计量；此演示不生成']] },
  fact: { title: '有依据的修正分支', description: '从受影响事件之前预览修正路线。原故事保留，新路线重新建立事件和记忆；不能只改面板数字。', impacts: [['原文', '原档保留，新分支写入修正后的经过'], ['状态与记忆', '从分叉前状态重建，不带入分叉之后的记忆'], ['纠正依据', '必须是可见原文或规则，猜测不能裁决为事实'], ['生成与消费', '旧计量保留；新生成另按既有规则处理']] },
  branch: { title: '另一个选择的故事线', description: '回到本轮行动之前，试一个不同选择。原故事继续存在，未来的物品、约定和秘密不跟过来。', impacts: [['原文', '保留原档，新分支从行动前接续'], ['状态与记忆', '只继承已确认前缀，不复制未来结果'], ['世界与身份', '继承当时冻结的版本，不加载后来改过的卡'], ['生成与消费', '创建分支本身不生成；后续行动才可能产生新生成']] },
};
for (const button of document.querySelectorAll('[data-correction]')) button.addEventListener('click', () => {
  correction = button.dataset.correction;
  const proposal = corrections[correction];
  element('correction-title').textContent = proposal.title;
  element('correction-description').textContent = proposal.description;
  element('impact-rows').replaceChildren();
  for (const [label, value] of proposal.impacts) {
    const row = document.createElement('tr');
    for (const text of [label, value]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
    element('impact-rows').append(row);
  }
  element('evidence-label').hidden = correction !== 'fact';
  element('evidence-select').value = 'known';
  element('evidence-warning').hidden = true;
  element('preview-correction').disabled = false;
  element('correction-dialog').showModal();
});
element('evidence-select').addEventListener('change', () => {
  const missing = element('evidence-select').value === 'missing';
  element('preview-correction').disabled = missing;
  element('evidence-warning').hidden = !missing;
});
element('cancel-correction').addEventListener('click', () => element('correction-dialog').close());
element('preview-correction').addEventListener('click', () => {
  if (correction === 'fact' && element('evidence-select').value !== 'known') return;
  element('result-title').textContent = `${corrections[correction].title} · 预写示例`;
  element('result-text').textContent = scene[correction];
  renderState(element('result-state'), scene[`${correction}State`] ?? scene.state);
  element('result-memory').textContent = ['fact', 'branch'].includes(correction)
    ? '建议的新分支只使用分叉前来源重建记忆；原故事记录未变。此处只是固定示例，尚未实现真实记忆重建。'
    : '原故事的事实与记忆记录保持原样；这里没有调用模型或保存修订。';
  element('correction-result').hidden = false;
  element('correction-dialog').close();
  element('correction-result').scrollIntoView({ block: 'nearest' });
});
element('reset-example').addEventListener('click', () => { element('correction-result').hidden = true; });

function renderFeedback() {
  const entries = Object.entries(feedback.pages).filter(([, value]) => value.note.trim() || value.verdict !== 'pending');
  element('feedback-count').textContent = `已记录 ${entries.length} 组页面反馈`;
  element('mode-preference').textContent = feedback.actionMode === null ? '尚未记录推荐提交方式的倾向。' : `已记下的倾向：${feedback.actionMode === 'draft' ? '先填入草稿，再发送' : '点击即执行'}。仍待讨论确认。`;
  element('feedback-list').replaceChildren();
  if (!entries.length) element('feedback-list').textContent = '还没有页面反馈。可以先在对照页记下最想调整的一处。';
  for (const [key, value] of entries) {
    const [page, width, theme] = key.split('-');
    const item = document.createElement('article'); item.className = 'feedback-item';
    const heading = document.createElement('strong'); heading.textContent = `${pages[page]} · ${width}px · ${theme === 'light' ? '浅色' : '深色'}`;
    const verdict = document.createElement('p'); verdict.textContent = { pending: '尚未判断', adjust: '需要调整', ready: '可进入正式验收（不是已验收）' }[value.verdict];
    const note = document.createElement('p'); note.textContent = value.note;
    item.append(heading, verdict, note); element('feedback-list').append(item);
  }
}
element('correction-note').value = feedback.correctionNote;
element('correction-note').addEventListener('input', () => { feedback.correctionNote = element('correction-note').value; saveFeedback(); });
element('export-feedback').addEventListener('click', () => {
  const exported = { ...feedback, exportedAt: new Date().toISOString(), reference: '07ac-2cee2683-790c-4bdc-83a2-6712240aeace', limitations: ['unconfirmed product proposal', 'local scripted interactions only', 'no production changes or acceptance sign-off'] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'squaretable-review-draft.json'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element('storage-status').textContent = storageMessage;
updateComparison(); renderScene(); renderFeedback();
