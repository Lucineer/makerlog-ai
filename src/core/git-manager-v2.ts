interface Commit { hash:string; message:string; author:string; date:number; files:string[]; additions:number; deletions:number }
interface Branch { name:string; ahead:number; behind:number; lastCommit:number; protected:boolean }
export class GitManagerV2 {
  private commits: Commit[] = []; private branches = new Map<string, Branch>(); private activeBranch = 'main';
  constructor() { this.branches.set('main', { name:'main', ahead:0, behind:0, lastCommit:Date.now(), protected:true }); }
  commit(message: string, author: string, files: string[]): Commit { const c: Commit = { hash:Math.random().toString(36).slice(2,10), message, author, date:Date.now(), files, additions:files.length*10, deletions:files.length*3 }; this.commits.push(c); const b = this.branches.get(this.activeBranch); if (b) { b.ahead++; b.lastCommit = c.date; } return c; }
  getCommit(hash: string): Commit | undefined { return this.commits.find(c => c.hash === hash); }
  getRecent(n: number): Commit[] { return [...this.commits].reverse().slice(0, n); }
  getByAuthor(author: string): Commit[] { return this.commits.filter(c => c.author === author); }
  createBranch(name: string, protected_ = false): Branch { const b: Branch = { name, ahead:0, behind:0, lastCommit:Date.now(), protected:protected_ }; this.branches.set(name, b); return b; }
  deleteBranch(name: string): void { const b = this.branches.get(name); if (b && !b.protected) this.branches.delete(name); }
  mergeBranch(source: string, target: string): void { const s = this.branches.get(source); const t = this.branches.get(target); if (s && t) { t.ahead += s.ahead; s.ahead = 0; s.behind = t.ahead; } }
  getBranch(name: string): Branch | undefined { return this.branches.get(name); }
  getAllBranches(): Branch[] { return [...this.branches.values()]; }
  getActiveBranch(): string { return this.activeBranch; }
  switchBranch(name: string): void { if (this.branches.has(name)) this.activeBranch = name; }
  getStats() { return { totalCommits:this.commits.length, totalFiles:this.commits.reduce((a,c) => a+c.files.length, 0), totalAdditions:this.commits.reduce((a,c) => a+c.additions, 0), totalDeletions:this.commits.reduce((a,c) => a+c.deletions, 0), activeBranches:this.branches.size, contributors:[...new Set(this.commits.map(c => c.author))] }; }
  getChangelog(days: number): string { const cutoff = Date.now() - days*86400000; return this.commits.filter(c => c.date > cutoff).reverse().map(c => `- ${c.hash.slice(0,7)} ${c.message} (${c.author})`).join('\n'); }
  getContributors() { const map = new Map<string,{commits:number;additions:number}>(); this.commits.forEach(c => { const e = map.get(c.author) || {commits:0,additions:0}; e.commits++; e.additions += c.additions; map.set(c.author, e); }); return [...map.entries()].map(([name, d]) => ({name, ...d})).sort((a,b) => b.commits - a.commits); }
  searchCommits(q: string): Commit[] { const l = q.toLowerCase(); return this.commits.filter(c => c.message.toLowerCase().includes(l)); }
  serialize(): string { return JSON.stringify({ commits:this.commits, branches:[...this.branches.values()], activeBranch:this.activeBranch }); }
  deserialize(data: string): void { const d = JSON.parse(data); this.commits = d.commits; this.branches = new Map(d.branches.map((b: Branch) => [b.name, b])); this.activeBranch = d.activeBranch; }
}
