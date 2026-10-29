import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { compileStoryAdapter } from './story-adapter-compiler';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import type { AdapterArtifact, AdapterJobView } from '../../types/story-adapter';

export async function runAdapterGraph(input: {
  jobId: string; sourceRevision: string;
  collect: () => Promise<{ content: StoryContentSnapshot; sources: StorySources }>;
  checkpoint: (stage: AdapterJobView['stage']) => Promise<void>;
}): Promise<AdapterArtifact> {
  const state = Annotation.Root({
    content: Annotation<StoryContentSnapshot>(), sources: Annotation<StorySources>(), artifact: Annotation<AdapterArtifact>(),
  });
  const graph = new StateGraph(state)
    .addNode('collect', async () => { await input.checkpoint('collect'); return input.collect(); })
    .addNode('inspect', async () => { await input.checkpoint('inspect'); return {}; })
    .addNode('compile', async current => {
      await input.checkpoint('compile');
      return { artifact: compileStoryAdapter(current.content, current.sources, input.jobId, input.sourceRevision) };
    })
    .addEdge(START, 'collect').addEdge('collect', 'inspect').addEdge('inspect', 'compile').addEdge('compile', END).compile();
  const result = await graph.invoke({}, { recursionLimit: 6 });
  return result.artifact;
}
