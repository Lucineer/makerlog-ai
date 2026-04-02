// src/core/code-index.ts
// Indexes code symbols, patterns, and dependencies for the self-building agent.

export interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum';
  file: string;
  line: number;
  exports: boolean;
  docs?: string;
  dependencies: string[];
}

export interface CodePattern {
  name: string;
  description: string;
  files: string[];
  frequency: number;
  quality: 'good' | 'bad' | 'neutral';
}

export interface FileIndex {
  path: string;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  lines: number;
  language: string;
}

export class CodeIndex {
  private files: Map<string, FileIndex> = new Map();
  private patterns: CodePattern[] = [];

  public indexFile(path: string, content: string): FileIndex {
    const lines = content.split('\n');
    const symbols: CodeSymbol[] = [];
    const imports: string[] = [];
    const exports: string[] = [];

    const regexMap: Record<CodeSymbol['type'], RegExp> = {
      function: /export\s+(?:async\s+)?function\s+(\w+)/,
      class: /export\s+(?:default\s+)?class\s+(\w+)/,
      interface: /export\s+interface\s+(\w+)/,
      type: /export\s+type\s+(\w+)/,
      constant: /export\s+const\s+(\w+)/,
      variable: /export\s+let\s+(\w+)/,
      enum: /export\s+enum\s+(\w+)/,
    };

    lines.forEach((line, index) => {
      for (const [type, regex] of Object.entries(regexMap)) {
        const match = line.match(regex);
        if (match) {
          const name = match[1];
          symbols.push({ name, type: type as CodeSymbol['type'], file: path, line: index + 1, exports: true, dependencies: [] });
          exports.push(name);
          break;
        }
      }

      const importMatch = line.match(/from\s+['"](.*?)['"]/);
      if (importMatch) {
        imports.push(importMatch[1]);
      }
    });

    const fileIndex: FileIndex = { path, symbols, imports, exports, lines: lines.length, language: path.endsWith('.ts') ? 'typescript' : 'javascript' };
    
    // Resolve dependencies between symbols in this file
    symbols.forEach(symbol => {
      const blockStart = symbol.line - 1;
      const blockEnd = lines.findIndex((l, i) => i > blockStart && /^\S/.test(l));
      const block = lines.slice(blockStart, blockEnd === -1 ? lines.length : blockEnd).join('\n');
      
      const deps = new Set<string>();
      exports.filter(e => e !== symbol.name).forEach(e => { if (block.includes(e)) deps.add(e); });
      imports.forEach(imp => { if (block.includes(imp)) deps.add(imp); });
      symbol.dependencies = Array.from(deps);
    });

    this.files.set(path, fileIndex);
    return fileIndex;
  }

  public removeFile(path: string): void {
    this.files.delete(path);
  }

  public getSymbol(name: string): CodeSymbol[] {
    const result: CodeSymbol[] = [];
    for (const file of this.files.values()) {
      for (const symbol of file.symbols) {
        if (symbol.name === name) result.push(symbol);
      }
    }
    return result;
  }

  public getSymbolsByType(type: string): CodeSymbol[] {
    const result: CodeSymbol[] = [];
    for (const file of this.files.values()) {
      result.push(...file.symbols.filter(s => s.type === type));
    }
    return result;
  }

  public getSymbolsInFile(path: string): CodeSymbol[] {
    return this.files.get(path)?.symbols || [];
  }

  public getDependencies(symbolName: string): string[] {
    const symbol = this.getSymbol(symbolName)[0];
    return symbol ? symbol.dependencies : [];
  }

  public getDependents(symbolName: string): string[] {
    const dependents = new Set<string>();
    for (const file of this.files.values()) {
      for (const symbol of file.symbols) {
        if (symbol.dependencies.includes(symbolName)) {
          dependents.add(symbol.name);
        }
      }
    }
    return Array.from(dependents);
  }

  public findReferences(symbolName: string): Array<{ file: string; line: number }> {
    const refs: Array<{ file: string; line: number }> = [];
    for (const file of this.files.values()) {
      // Check imports as a reference
      if (file.imports.some(i => i.includes(symbolName))) {
        refs.push({ file: file.path, line: 1 }); // Aggregated at file level for simplicity
      }
      // Check other symbols depending on it
      for (const symbol of file.symbols) {
        if (symbol.dependencies.includes(symbolName)) {
          refs.push({ file: symbol.file, line: symbol.line });
        }
      }
    }
    return refs;
  }

  public getImportGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [path, file] of this.files.entries()) {
      graph[path] = file.imports;
    }
    return graph;
  }

  public detectPatterns(): CodePattern[] {
    this.patterns = [];
    const symbolCounts: Record<string, string[]> = {};
    for (const file of this.files.values()) {
      for (const symbol of file.symbols) {
        if (!symbolCounts[symbol.type]) symbolCounts[symbol.type] = [];
        symbolCounts[symbol.type].push(file.path);
      }
    }

    for (const [type, files] of Object.entries(symbolCounts)) {
      if (files.length >= 2) {
        this.patterns.push({
          name: `Frequent ${type} exports`,
          description: `Discovered high frequency of exported ${type} declarations across the codebase.`,
          files: [...new Set(files)],
          frequency: files.length,
          quality: 'neutral'
        });
      }
    }
    
    // Detect circular dependencies (bad pattern)
    const importGraph = this.getImportGraph();
    for (const [file, imports] of Object.entries(importGraph)) {
      for (const imp of imports) {
        if (importGraph[imp]?.includes(file)) {
          this.patterns.push({
            name: 'Circular Dependency',
            description: `Detected circular import between ${file} and ${imp}`,
            files: [file, imp],
            frequency: 1,
            quality: 'bad'
          });
        }
      }
    }

    return this.patterns;
  }

  public getDeadCode(): string[] {
    const allExports = new Map<string, number>();
    const allImports = new Set<string>();

    for (const file of this.files.values()) {
      file.exports.forEach(e => allExports.set(e, file.path.length));
      file.imports.forEach(i => allImports.add(i));
    }

    const deadCode: string[] = [];
    for (const [exp] of allExports) {
      const isUsed = Array.from(this.files.values()).some(f => 
        f.symbols.some(s => s.name !== exp && s.dependencies.includes(exp))
      );
      // Primitives: exact name match usage
      if (!isUsed && !allImports.has(exp)) {
        deadCode.push(exp);
      }
    }
    return deadCode;
  }

  public getComplexity(file: string): number {
    const fileData = this.files.get(file);
    if (!fileData) return 0;
    const lines = fileData.lines || 1;
    const symbols = fileData.symbols.length || 1;
    return Math.round((lines / symbols + lines * 0.1) * 10) / 10;
    // Simple branch density representation
  }

  public search(query: string): CodeSymbol[] {
    const results: CodeSymbol[] = [];
    const lowerQuery = query.toLowerCase();
    for (const file of this.files.values()) {
      for (const symbol of file.symbols) {
        if (symbol.name.toLowerCase().includes(lowerQuery)) {
          results.push(symbol);
        }
      }
    }
    return results;
  }

  public getStats(): { files: number; symbols: number; patterns: number; avgComplexity: number } {
    let totalComplexity = 0;
    let fileCount = 0;
    for (const file of this.files.keys()) {
      totalComplexity += this.getComplexity(file);
      fileCount++;
    }
    return {
      files: this.files.size,
      symbols: Array.from(this.files.values()).reduce((acc, f) => acc + f.symbols.length, 0),
      patterns: this.patterns.length,
      avgComplexity: fileCount > 0 ? Math.round((totalComplexity / fileCount) * 10) / 10 : 0
    };
  }

  public serialize(): string {
    return JSON.stringify({
      files: Array.from(this.files.entries()),
      patterns: this.patterns
    });
  }

  public deserialize(json: string): void {
    try {
      const state = JSON.parse(json);
      this.files