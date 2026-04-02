interface Module { id:string; name:string; path:string; imports:string[]; exports:string[]; size:number; lang:string }
interface Edge { from:string; to:string; type:'import'|'export'|'dynamic' }
export class DependencyGraph {
  private nodes = new Map<string, Module>();
  private edges: Edge[] = [];
  addModule(d: Partial<Module>): Module { const m: Module = { id:d.id||d.name||'', name:d.name||'', path:d.path||'', imports:d.imports||[], exports:d.exports||[], size:d.size||0, lang:d.lang||'ts' }; this.nodes.set(m.id, m); return m; }
  removeModule(id: string): void { this.nodes.delete(id); this.edges = this.edges.filter(e => e.from !== id && e.to !== id); }
  addEdge(from: string, to: string, type: Edge['type'] = 'import'): void { this.edges.push({ from, to, type }); }
  removeEdge(from: string, to: string): void { this.edges = this.edges.filter(e => !(e.from === from && e.to === to)); }
  get(id: string): Module | undefined { return this.nodes.get(id); }
  getDeps(id: string): Module[] { const ids = this.edges.filter(e => e.from === id).map(e => e.to); return ids.map(i => this.nodes.get(i)).filter(Boolean) as Module[]; }
  getDependents(id: string): Module[] { const ids = this.edges.filter(e => e.to === id).map(e => e.from); return ids.map(i => this.nodes.get(i)).filter(Boolean) as Module[]; }
  getTransitiveDeps(id: string): Module[] { const visited = new Set<string>(); const walk = (nid: string) => { for (const dep of this.getDeps(nid)) { if (!visited.has(dep.id)) { visited.add(dep.id); walk(dep.id); } } }; walk(id); return [...visited].map(i => this.nodes.get(i)).filter(Boolean) as Module[]; }
  getTransitiveDependents(id: string): Module[] { const visited = new Set<string>(); const walk = (nid: string) => { for (const dep of this.getDependents(nid)) { if (!visited.has(dep.id)) { visited.add(dep.id); walk(dep.id); } } }; walk(id); return [...visited].map(i => this.nodes.get(i)).filter(Boolean) as Module[]; }
  detectCycles(): string[][] { const cycles: string[][] = []; const visited = new Set<string>(); const stack = new Set<string>(); const path: string[] = []; const walk = (id: string) => { if (stack.has(id)) { cycles.push(path.slice(path.indexOf(id))); return; } if (visited.has(id)) return; visited.add(id); stack.add(id); path.push(id); for (const e of this.edges.filter(e => e.from === id)) walk(e.to); path.pop(); stack.delete(id); }; for (const id of this.nodes.keys()) if (!visited.has(id)) walk(id); return cycles; }
  hasCycles(): boolean { return this.detectCycles().length > 0; }
  topoSort(): Module[] { const inDeg = new Map<string, number>(); for (const id of this.nodes.keys()) inDeg.set(id, 0); for (const e of this.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1); const queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id); const sorted: Module[] = []; while (queue.length) { const id = queue.shift()!; const m = this.nodes.get(id); if (m) sorted.push(m); for (const e of this.edges.filter(e => e.from === id)) { const d = inDeg.get(e.to)! - 1; inDeg.set(e.to, d); if (d === 0) queue.push(e.to); } } return sorted; }
  getEntryModules(): Module[] { const imported = new Set(this.edges.map(e => e.to)); return [...this.nodes.values()].filter(m => !imported.has(m.id)); }
  getLeafModules(): Module[] { const importing = new Set(this.edges.map(e => e.from)); return [...this.nodes.values()].filter(m => !importing.has(m.id)); }
  getCriticality(id: string): number { return Math.min(1, this.getTransitiveDependents(id).length / (this.nodes.size || 1)); }
  getSize() { return { modules: this.nodes.size, edges: this.edges.length, avgDeps: this.nodes.size ? this.edges.length / this.nodes.size : 0 }; }
  serialize(): string { return JSON.stringify({ nodes: [...this.nodes.values()], edges: this.edges }); }
  deserialize(data: string): void { const d = JSON.parse(data); this.nodes = new Map(d.nodes.map((n: Module) => [n.id, n])); this.edges = d.edges; }
}
