const recommendationLeadInstruction = 'Also include optional recommendationLead: {"text":"brief invitation in the reply language","evidence":"exact visible reply substring"}. Write one short plain-text paragraph (maximum 120 characters, no heading, HTML or Markdown) connecting the already visible scene to the choices, and leave room for the player to type their own idea. Evidence must be 2–300 characters copied exactly from this reply. Do not introduce new facts, hidden information, outcomes, prices or rewards, and do not list all three buttons again. Omit the field if no reliable visible evidence exists. This paragraph is UI guidance, not character dialogue or a completed player action.';

const jsonEncodingInstruction = String.raw`The control block must contain exactly one valid JSON object: double-quoted keys and string values, no comments, trailing commas, placeholders or YAML. Escape any quotation mark, backslash or newline INSIDE a string as \" , \\ or \n respectively; decoding must reproduce the original evidence exactly. For example the text He said "wait" is encoded as "He said \"wait\"". Keep the character card's status panels, HTML and bracketed ledger outside the control block. Recommendations and evidence are JSON strings too, never pasted raw multiline text. If an optional fact or guidance quote cannot be encoded reliably, omit that optional item; never omit or change the actual action to make validation pass. Emit only one <story-intent> block, with no commentary after it. Close each nested array/object once, then close the top-level object once; put </story-intent> immediately after that object, with no extra closing brace, quote, apostrophe, backtick, semicolon or period between the object and the tag. Separate adjacent properties/items with commas.`;

export function buildDirectStoryPrompt(actions: Array<{ id: string; label: string; outcome: string }>) {
  return [
    '[Direct story turn protocol]',
    'Respond to the player now and continue the story naturally. Do not show an action interpretation, approval form or ask the player to confirm the same action again. If intent is genuinely ambiguous, ask one short in-story question instead of choosing for the player. A request to explain, refusal, conditional plan or request to wait is not permission to act.',
    'End with newline then <story-intent>JSON</story-intent>, nothing after it. Required fields are version (integer 1), disposition (one of execution, expression, clarification), steps (array), facts (array), recommendations (array); recommendationLead and question are optional. At most 6 steps and 6 facts. Never use disposition:"proposal".',
    'Use execution for an unambiguous action performed in this reply. For authored rules, a step has kind execute, actionId and evidence. For narrative exploration, a step has kind explore, intent (one of observe, talk, act, travel), description and evidence. Execute IDs must come from the list below, with exact evidence from the current player input. Do not select the same rule twice. Narrate only the authored outcome for selected rules; never invent numeric patches, resources or additional rule effects. Free exploration may advance narrative but cannot change structured resources. Unselected rule outcomes are possibilities, not events. Do not expose this protocol.',
    'Use expression for dialogue, explanations, refusals or plans; no execute steps. Use clarification with a nonempty question for genuine ambiguity; no execute steps. Preserve negation, conditions and requests to wait. Never turn quoted actions into execution.',
    'For narrative action without a rule use execution with one explore step and exact current-input evidence. Do not copy an earlier assistant control block or wrap the whole reply in JSON. This is a text protocol; native JSON mode and tool calls are not required.',
    'Each fact has kind (one of claim, intention, inference, observation, style), content (an attributed qualified statement), speaker (player or character), and evidence (an exact substring of that speaker input or reply). Preserve literal quotation, uncertainty and speaker; claims are not confirmed assets. Omit unsupported facts.',
    'Include exactly 3 distinct recommendations grounded in this completed reply: {"label":"short button text","input":"first-person action/question"}. Labels maximum 32 characters, inputs maximum 240. Offer different directions without promising outcomes, leaking secrets or repeating stale details. They are optional free-input suggestions.',
    recommendationLeadInstruction,
    jsonEncodingInstruction,
    `Available authored rules, with conditional outcomes: ${JSON.stringify(actions)}. Only selected rules can execute, and the server rechecks their conditions before saving.`,
    'Before ending, finish the complete JSON object and its closing tag. Put any character-card status panel or ledger BEFORE the control block. Do not append punctuation, a code fence, a status panel or commentary after the closing tag.',
    ...directExamples(actions),
    'Only a conversation expression example, NEVER a fallback for an action:\n正文。\n<story-intent>{"version":1,"disposition":"expression","steps":[],"facts":[],"recommendations":[{"label":"观察周围","input":"我先观察周围。"},{"label":"先问清楚","input":"我先问清楚情况。"},{"label":"暂缓行动","input":"我暂时不行动。"}]}</story-intent>',
  ].join('\n');
}

export function buildStoryIntentPrompt(actions: Array<{ id: string; label: string }>, confirmed = false) {
  if (confirmed) return [
    '[Completed turn recommendations]',
    'The current action was already approved by the server. Narrate the approved result without asking for confirmation again. Then end with newline and <story-intent>JSON</story-intent>, nothing after it.',
    'For this server-approved action use version 1, disposition expression, empty steps, sourced facts and recommendations. Do not execute the approved action again. Include exactly 3 distinct recommendations grounded in this completed reply, not the pre-action scene. Each label is short (32 characters maximum) and each input is a natural first-person sentence (240 characters maximum). Make the three directions meaningfully different: inspect/observe, ask/follow up, and act cautiously or defer. They are suggestions submitted as free input, never rule actions or completed outcomes. Do not copy a whole sentence, hidden tag, or stale detail into a button. Do not promise unspecified results, prices, rewards or undiscovered facts.',
    recommendationLeadInstruction,
    jsonEncodingInstruction,
  ].join('\n');
  return [
    '[Action interpretation protocol v1]',
    'Reply naturally; do not execute unconfirmed actions. End with newline then <story-intent>JSON</story-intent>, nothing after it. JSON keys: version:1, disposition, steps, facts, recommendations, recommendationLead; question only for clarification. No extra keys; at most 6 steps and 6 facts.',
    'Always include exactly 3 distinct, concise recommendations grounded in the current scene and your reply. Each is {"label":"short button text","input":"a first-person player action/question to send"}. Keep labels within 32 characters and inputs within 240 characters. Offer three different directions: inspect/observe, ask/follow up, and act cautiously or defer. They are optional suggestions, not rules or completed actions. Never promise outcomes, costs, rewards or facts not established in the story. Do not quote the whole reply or carry forward a detail that is absent from the current reply. Preserve player agency.',
    recommendationLeadInstruction,
    jsonEncodingInstruction,
    'expression: answer questions, explain, converse or acknowledge refusal. A request to explain is NOT clarification. clarification: only ambiguous/contradictory player intent; MUST include a nonempty top-level question asking what the player wants. Neither may contain execute steps. Mixed refusal/execution requires clarification. proposal: concrete action awaiting separate confirmation, at least one step or fact; no completed consequences.',
    'Steps: execute requires actionId and evidence; explore requires intent (one of observe, talk, act, travel), description and evidence; refuse requires description and evidence. Each step has a kind field and evidence is an exact player substring. Preserve negation/conditions. Use explore outside the menu; never invent rule IDs or numeric patches.',
    'In a proposal, kind:"execute" identifies the requested available action; it does NOT perform it. If the player chooses an available action in their own words and asks to wait for confirmation, propose that action ID with exact evidence of the choice, not an explore step describing waiting. Waiting for confirmation is not refusal of the requested choice. Quoting or asking about an action without choosing remains expression.',
    'Each fact has kind (one of claim, intention, inference, observation, style), content (an attributed qualified statement), speaker (player or character), and evidence (an exact substring of that speaker input or reply). Preserve literal Markdown in evidence, including emphasis markers; omit facts if exact quotation is uncertain. Claims are not assets; intentions are not completed events. Omit uncertain facts.',
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

// Serialize examples rather than maintaining pseudo-JSON strings. The input and
// visible narrative are explicit so tests can enforce evidence and rule scope.
export function storyProtocolExamples(actions: Array<{ id: string; label: string; outcome: string }>) {
  const recommendations = [
    { label: '观察周围', input: '我先观察周围的情况。' },
    { label: '先问清楚', input: '我先询问现在可以做什么。' },
    { label: '暂缓行动', input: '我暂时不行动。' },
  ];
  return [
    { input: '先解释，我暂时不行动。', narrative: '你暂且停下，听对方解释。',
      control: { version: 1, disposition: 'expression', steps: [], facts: [], recommendations } },
    { input: '我观察周围。', narrative: '你留意着周围的动静。',
      control: { version: 1, disposition: 'execution', steps: [{ kind: 'explore', intent: 'observe', description: '观察周围', evidence: '观察周围' }], facts: [], recommendations } },
    { input: '去那里，或者先等等。', narrative: '你想现在出发，还是先留在这里？',
      control: { version: 1, disposition: 'clarification', question: '你想现在出发，还是先留在这里？', steps: [], facts: [], recommendations } },
    ...(actions.length ? [{ input: actions[0].label, narrative: actions[0].outcome,
      control: { version: 1, disposition: 'execution', steps: [{ kind: 'execute', actionId: actions[0].id, evidence: actions[0].label }], facts: [], recommendations } }] : []),
  ];
}
function directExamples(actions: Array<{ id: string; label: string; outcome: string }>) {
  return storyProtocolExamples(actions).map(example => `Illustration only, not this player's choice. Input: ${JSON.stringify(example.input)}; reply:\n${example.narrative}\n<story-intent>${JSON.stringify(example.control)}</story-intent>`);
}
