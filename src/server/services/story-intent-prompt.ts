export function buildStoryIntentPrompt(actions: Array<{ id: string; label: string }>, confirmed = false) {
  if (confirmed) return [
    '[Completed turn recommendations]',
    'The current action was already approved by the server. Narrate the approved result without asking for confirmation again. Then end with newline and <story-intent>JSON</story-intent>, nothing after it.',
    'JSON: {"version":1,"disposition":"expression","steps":[],"facts":[],"recommendations":[{"label":"short button text","input":"first-person action/question"}, ...]}. Include exactly 3 distinct recommendations grounded in this completed reply, not the pre-action scene. They are suggestions submitted as free input, never rule actions or completed outcomes. Do not promise unspecified results, prices, rewards or undiscovered facts.',
  ].join('\n');
  return [
    '[Action interpretation protocol v1]',
    'Reply naturally; do not execute unconfirmed actions. End with newline then <story-intent>JSON</story-intent>, nothing after it. JSON keys: version:1, disposition, steps, facts, recommendations; question only for clarification. No extra keys; at most 6 steps and 6 facts.',
    'Always include exactly 3 distinct, concise recommendations grounded in the current scene and your reply. Each is {"label":"short button text","input":"a first-person player action/question to send"}. They are optional suggestions, not rules or completed actions. Never promise outcomes, costs, rewards or facts not established in the story. They must offer meaningfully different ways forward and preserve player agency.',
    'expression: answer questions, explain, converse or acknowledge refusal. A request to explain is NOT clarification. clarification: only ambiguous/contradictory player intent; MUST include a nonempty top-level question asking what the player wants. Neither may contain execute steps. Mixed refusal/execution requires clarification. proposal: concrete action awaiting separate confirmation, at least one step or fact; no completed consequences.',
    'Steps: {kind:"execute",actionId:"available ID",evidence:"exact player substring"}; {kind:"explore",intent:"observe|talk|act|travel",description:"free action",evidence:"exact player substring"}; {kind:"refuse",description:"refusal",evidence:"exact player substring"}. Preserve negation/conditions. Use explore outside the menu; never invent rule IDs or numeric patches.',
    'In a proposal, kind:"execute" identifies the requested available action; it does NOT perform it. If the player chooses an available action in their own words and asks to wait for confirmation, propose that action ID with exact evidence of the choice, not an explore step describing waiting. Waiting for confirmation is not refusal of the requested choice. Quoting or asking about an action without choosing remains expression.',
    'Facts: {kind:"claim|intention|inference|observation|style",content:"attributed qualified statement",speaker:"player|character",evidence:"exact substring of that speaker input/reply"}. Preserve literal Markdown in evidence, including emphasis markers; omit facts if exact quotation is uncertain. Claims are not assets; intentions are not completed events. Omit uncertain facts.',
    'Explanation example: <story-intent>{"version":1,"disposition":"expression","steps":[],"facts":[],"recommendations":[{"label":"观察门边","input":"我检查门边的痕迹"},{"label":"询问来客","input":"我想问来客刚才发生了什么"},{"label":"暂不行动","input":"我先不做决定，继续留意周围"}]}</story-intent>',
    'Ambiguity example: <story-intent>{"version":1,"disposition":"clarification","question":"你希望现在行动，还是先了解情况？","steps":[],"facts":[],"recommendations":[{"label":"先了解情况","input":"我先了解现在的情况"},{"label":"检查周围","input":"我检查一下周围"},{"label":"暂缓选择","input":"我先不做决定"}]}</story-intent>',
    ...(actions.length ? [`Protocol example only, not a saved player choice. For player input ${JSON.stringify(`${actions[0].label}，先等我确认`)}: <story-intent>${JSON.stringify({ version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: actions[0].id, evidence: actions[0].label }], facts: [], recommendations: [
      { label: '继续行动', input: `我确认执行${actions[0].label}` },
      { label: '先询问细节', input: '我先了解行动的具体影响' },
      { label: '暂缓决定', input: '我暂时不确认这个行动' },
    ] })}</story-intent>`] : []),
    `Available action IDs: ${JSON.stringify(actions)}.`,
  ].join('\n');
}
