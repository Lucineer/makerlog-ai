interface BuildStep { id:string; name:string; type:'check'|'compile'|'test'|'lint'|'bundle'|'deploy'; status:'pending'|'running'|'passed'|'failed'|'skipped'; output:string; duration:number }
interface BuildResult { id:string; startTime:number; endTime:number; status:'success'|'failed'|'partial'; steps:BuildStep[]; errors:string[]; warnings:string[] }
export class BuildPipeline {
  private history: BuildResult[] = [];
  private current: BuildResult | null = null;
  startBuild(): BuildResult { this.current = { id: crypto.randomUUID(), startTime: Date.now(), endTime: 0, status: 'partial', steps: [], errors: [], warnings: [] }; return this.current; }
  addStep(name: string, type: BuildStep['type'], command: string): BuildStep { const s: BuildStep = { id: crypto.randomUUID(), name, type, command, status: 'pending', output: '', duration: 0 }; this.current?.steps.push(s); return s; }
  passStep(id: string, output: string): void { const s = this.current?.steps.find(s => s.id === id); if (s) { s.status = 'passed'; s.output = output; s.duration = Math.random() * 2000 + 100; } }
  failStep(id: string, error: string): void { const s = this.current?.steps.find(s => s.id === id); if (s) { s.status = 'failed'; s.output = error; s.duration = Math.random() * 1000; this.current!.errors.push(error); } }
  skipStep(id: string): void { const s = this.current?.steps.find(s => s.id === id); if (s) s.status = 'skipped'; }
  getCurrent(): BuildResult | null { return this.current; }
  completeBuild(): BuildResult { if (!this.current) throw new Error('No build'); this.current.endTime = Date.now(); this.current.status = this.current.errors.length === 0 ? 'success' : 'failed'; this.history.push(this.current); return this.current; }
  getHistory(limit = 10): BuildResult[] { return this.history.slice(-limit).reverse(); }
  getLastSuccess(): BuildResult | null { return [...this.history].reverse().find(b => b.status === 'success') || null; }
  getLastFailed(): BuildResult | null { return [...this.history].reverse().find(b => b.status === 'failed') || null; }
  getSuccessRate(): number { return this.history.length ? this.history.filter(b => b.status === 'success').length / this.history.length : 0; }
  getAvgDuration(): number { const s = this.history.filter(b => b.status === 'success'); return s.length ? s.reduce((t, b) => t + (b.endTime - b.startTime), 0) / s.length : 0; }
  getCommonErrors(n = 5): Array<{error:string;count:number}> { const counts = new Map<string, number>(); for (const b of this.history) for (const e of b.errors) counts.set(e, (counts.get(e) || 0) + 1); return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([error, count]) => ({ error, count })); }
  standardPipeline(): BuildResult { const b = this.startBuild(); this.addStep('Type Check', 'check', 'tsc --noEmit'); this.addStep('Lint', 'lint', 'eslint src/'); this.addStep('Test', 'test', 'vitest run'); this.addStep('Build', 'bundle', 'npx wrangler deploy --dry-run'); return b; }
  getStatus(): string { if (!this.current) return 'No build running'; const done = this.current.steps.filter(s => s.status !== 'pending' && s.status !== 'running').length; return `Build ${this.current.id.slice(0, 8)}: ${done}/${this.current.steps.length} steps`; }
  serialize(): string { return JSON.stringify({ history: this.history, current: this.current }); }
  deserialize(data: string): void { const d = JSON.parse(data); this.history = d.history; this.current = d.current; }
}
