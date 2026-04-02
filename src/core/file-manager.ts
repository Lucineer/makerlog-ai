interface FileNode { path: string; type: 'file' | 'directory'; content?: string; children?: FileNode[]; size: number; lastMod: number; lang?: string }
interface FileChange { path: string; type: 'create' | 'modify' | 'delete'; content?: string; ts: number }

export class FileManager {
  private root: FileNode = { path: '/', type: 'directory', children: [], size: 0, lastMod: Date.now() };
  private history: FileChange[] = [];

  private resolve(path: string): string[] {
    const parts = path.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const p of parts) { if (p === '..') resolved.pop(); else if (p !== '.') resolved.push(p); }
    return resolved;
  }

  private findNode(path: string): FileNode | null {
    const parts = this.resolve(path);
    if (parts.length === 0) return this.root;
    let node = this.root;
    for (const p of parts) {
      const child = node.children?.find(c => c.path.endsWith('/' + p) || c.path === p);
      if (!child || child.type !== 'directory') return null;
      node = child;
    }
    return node;
  }

  private detectLang(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = { ts: 'TypeScript', js: 'JavaScript', py: 'Python', md: 'Markdown', json: 'JSON', html: 'HTML', css: 'CSS', toml: 'TOML', yaml: 'YAML', sh: 'Shell' };
    return map[ext || ''] || 'Unknown';
  }

  createFile(path: string, content: string): FileNode {
    const parts = this.resolve(path);
    const name = parts.pop()!;
    let dir = this.root;
    for (const p of parts) {
      let child = dir.children?.find(c => c.path.endsWith('/' + p));
      if (!child) { child = { path: p, type: 'directory', children: [], size: 0, lastMod: Date.now() }; dir.children!.push(child); }
      dir = child;
    }
    const node: FileNode = { path: name, type: 'file', content, size: content.length, lastMod: Date.now(), lang: this.detectLang(name) };
    dir.children!.push(node);
    this.history.push({ path, type: 'create', content, ts: Date.now() });
    return node;
  }

  readFile(path: string): string { return this.createFile(path, '').content || ''; }

  updateFile(path: string, content: string): FileNode {
    const parts = this.resolve(path);
    const name = parts.pop()!;
    const dir = this.findNode(parts.join('/'));
    if (!dir) throw new Error(`Directory not found: ${parts.join('/')}`);
    const existing = dir.children?.find(c => c.path === name);
    if (existing && existing.type === 'file') { existing.content = content; existing.size = content.length; existing.lastMod = Date.now(); }
    else { dir.children!.push({ path: name, type: 'file', content, size: content.length, lastMod: Date.now(), lang: this.detectLang(name) }); }
    this.history.push({ path, type: 'modify', content, ts: Date.now() });
    return existing || dir.children!.find(c => c.path === name)!;
  }

  deleteFile(path: string): void {
    const parts = this.resolve(path);
    const name = parts.pop()!;
    const dir = this.findNode(parts.join('/'));
    if (!dir) return;
    dir.children = dir.children?.filter(c => c.path !== name);
    this.history.push({ path, type: 'delete', ts: Date.now() });
  }

  createDirectory(path: string): FileNode {
    const parts = this.resolve(path);
    let node = this.root;
    for (const p of parts) {
      let child = node.children?.find(c => c.path === p);
      if (!child) { child = { path: p, type: 'directory', children: [], size: 0, lastMod: Date.now() }; node.children!.push(child); }
      node = child;
    }
    return node;
  }

  listDirectory(path: string): FileNode[] {
    const node = this.findNode(path);
    return node?.children || [];
  }

  exists(path: string): boolean { return !!this.findNode(path); }
  isFile(path: string): boolean { const n = this.findNode(path); return n?.type === 'file'; }
  isDirectory(path: string): boolean { const n = this.findNode(path); return n?.type === 'directory'; }

  search(query: string, path?: string): Array<{ path: string; line: number; content: string }> {
    const results: Array<{ path: string; line: number; content: string }> = [];
    const q = query.toLowerCase();
    const root = path ? this.findNode(path) || this.root : this.root;
    const walk = (node: FileNode, prefix: string) => {
      if (node.type === 'file' && node.content) {
        node.content.split('\n').forEach((line, i) => {
          if (line.toLowerCase().includes(q)) results.push({ path: prefix + node.path, line: i + 1, content: line.trim() });
        });
      }
      node.children?.forEach(c => walk(c, prefix + node.path + '/'));
    };
    walk(root, '/');
    return results;
  }

  getTree(path?: string, depth: number = 3): string {
    const node = path ? this.findNode(path) || this.root : this.root;
    const lines: string[] = [];
    const walk = (n: FileNode, prefix: string, d: number) => {
      if (d > depth) return;
      const icon = n.type === 'directory' ? '📁' : '📄';
      lines.push(`${prefix}${icon} ${n.path}${n.type === 'file' && n.lang ? ` (${n.lang})` : ''}`);
      n.children?.forEach((c, i) => walk(c, prefix + '  ', d + 1));
    };
    walk(node, '', 0);
    return lines.join('\n');
  }

  getSize(path?: string): number {
    const node = path ? this.findNode(path) || this.root : this.root;
    if (node.type === 'file') return node.size;
    return (node.children || []).reduce((s, c) => s + this.getSize('/' + c.path), 0);
  }

  getLineCount(path: string): number { const n = this.findNode(path); return n?.content?.split('\n').length || 0; }
  getHistory(path?: string): FileChange[] { return path ? this.history.filter(h => h.path === path) : this.history; }

  serialize(): string { return JSON.stringify({ root: this.root, history: this.history }); }
  deserialize(data: string): void { const d = JSON.parse(data); this.root = d.root; this.history = d.history; }
}
