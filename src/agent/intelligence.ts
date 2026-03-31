/**
 * Intelligence Engine — code understanding, repo analysis, and CLAUDE.md
 * generation.
 *
 * Scans the repo structure, detects languages and architecture patterns,
 * and can generate or update a CLAUDE.md guidance file.  Uses the shared
 * Storage interface from the tools layer and the Provider type from the
 * providers registry.
 */

import type { Storage } from '../tools/search.js';
import type { Provider, Message } from '../providers/index.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface RepoAnalysis {
  languages: Record<string, number>;
  entryPoints: string[];
  dependencies: string[];
  architecture: string;
  summary: string;
  fileCount: number;
  totalBytes: number;
}

// ── Known patterns for architecture detection ────────────────────────────

const ARCH_PATTERNS: Array<{
  test: (files: string[]) => boolean;
  label: string;
}> = [
  {
    test: (f) => f.some((p) => p.includes('wrangler.toml')),
    label: 'Cloudflare Workers',
  },
  {
    test: (f) => f.some((p) => p.endsWith('next.config.js') || p.endsWith('next.config.mjs')),
    label: 'Next.js',
  },
  {
    test: (f) =>
      f.some((p) => p.endsWith('package.json')) &&
      f.some((p) => p.startsWith('src/')),
    label: 'Node.js / TypeScript monolith',
  },
  {
    test: (f) => f.some((p) => p.includes('packages/')),
    label: 'Monorepo (packages)',
  },
  {
    test: (f) => f.some((p) => p.startsWith('cmd/')),
    label: 'Go CLI / service',
  },
  {
    test: (f) => f.some((p) => p.endsWith('Cargo.toml')),
    label: 'Rust project',
  },
  {
    test: (f) =>
      f.some((p) => p.endsWith('requirements.txt') || p.endsWith('pyproject.toml')),
    label: 'Python project',
  },
];

const ENTRY_POINT_FILES = new Set([
  'index.ts',
  'index.js',
  'main.ts',
  'main.js',
  'worker.ts',
  'worker.js',
  'app.ts',
  'app.js',
  'server.ts',
  'server.js',
  'src/index.ts',
  'src/index.js',
  'src/main.ts',
  'src/main.js',
  'src/worker.ts',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  '__pycache__',
  '.venv',
  'vendor',
  'coverage',
]);

// ── Engine ───────────────────────────────────────────────────────────────

export class IntelligenceEngine {
  /**
   * Analyze the entire repo: language breakdown, entry points,
   * architecture pattern, and a textual summary.
   */
  async analyzeRepo(storage: Storage): Promise<RepoAnalysis> {
    const languages: Record<string, number> = {};
    const allFiles: string[] = [];
    const entryPoints: string[] = [];
    const dependencies: string[] = [];
    let totalBytes = 0;

    // Phase 1: walk all files
    for await (const filePath of storage.listFiles()) {
      const segments = filePath.split('/');
      if (segments.some((s) => SKIP_DIRS.has(s))) continue;

      allFiles.push(filePath);

      // Detect language from extension
      const ext = this.getExtension(filePath);
      const lang = this.extensionToLanguage(ext);
      if (lang) {
        languages[lang] = (languages[lang] || 0) + 1;
      }

      // Detect entry points
      if (
        ENTRY_POINT_FILES.has(filePath) ||
        ENTRY_POINT_FILES.has(segments.slice(-1)[0])
      ) {
        entryPoints.push(filePath);
      }

      // Accumulate size estimate and extract imports
      try {
        const content = await storage.readFile(filePath);
        totalBytes += content.length;

        if (
          ext === '.ts' ||
          ext === '.js' ||
          ext === '.tsx' ||
          ext === '.jsx'
        ) {
          const importMatches = content.matchAll(
            /(?:import|require)\s.*['"]([^'"]+)['"]/g,
          );
          for (const match of importMatches) {
            const dep = match[1];
            if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
              const pkgName = dep.startsWith('@')
                ? dep.split('/').slice(0, 2).join('/')
                : dep.split('/')[0];
              if (!dependencies.includes(pkgName)) {
                dependencies.push(pkgName);
              }
            }
          }
        }
      } catch {
        // Unreadable file, skip
      }
    }

    // Phase 2: detect architecture
    const architecture = this.detectArchitecture(allFiles);

    // Phase 3: build summary
    const topLang = Object.entries(languages).sort((a, b) => b[1] - a[1]);
    const langBreakdown = topLang
      .map(([lang, count]) => `${lang}: ${count} files`)
      .join(', ');
    const summary = [
      `${allFiles.length} files (${this.formatBytes(totalBytes)})`,
      `Languages: ${langBreakdown || 'unknown'}`,
      `Architecture: ${architecture}`,
      `Entry points: ${entryPoints.join(', ') || 'none detected'}`,
      `Dependencies: ${dependencies.slice(0, 20).join(', ')}${dependencies.length > 20 ? '...' : ''}`,
    ].join('\n');

    return {
      languages,
      entryPoints,
      dependencies,
      architecture,
      summary,
      fileCount: allFiles.length,
      totalBytes,
    };
  }

  /**
   * Generate a CLAUDE.md file from a RepoAnalysis.
   * Can be used to bootstrap or update the repo's guidance file.
   */
  async generateClaudeMd(analysis: RepoAnalysis): Promise<string> {
    const topLang = Object.entries(analysis.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);

    const lines: string[] = [
      '# CLAUDE.md',
      '',
      '> Auto-generated by makerlog-ai Intelligence Engine.',
      '',
      '## Repo Overview',
      '',
      analysis.summary,
      '',
      '## Primary Languages',
      '',
      ...topLang.map((lang) => `- ${lang}`),
      '',
      '## Entry Points',
      '',
      ...analysis.entryPoints.map((ep) => `- \`${ep}\``),
      '',
      '## Architecture',
      '',
      `This project follows a **${analysis.architecture}** pattern.`,
      '',
      '## Key Dependencies',
      '',
      ...analysis.dependencies.slice(0, 30).map((d) => `- ${d}`),
      '',
      '## Conventions',
      '',
      '- TypeScript strict mode',
      '- ESM modules only',
      '- Tests in `tests/` directory',
      '- Use Logger class, not console.log',
      '',
      '---',
      `*Last updated: ${new Date().toISOString()}*`,
    ];

    return lines.join('\n');
  }

  /**
   * Explain a specific file or function using the LLM.
   */
  async explain(
    path: string,
    storage: Storage,
    llm: Provider,
  ): Promise<string> {
    let content: string;
    try {
      content = await storage.readFile(path);
    } catch {
      return `Error: could not read file ${path}`;
    }

    const messages: Message[] = [
      {
        role: 'user',
        content:
          `Explain the following file (\`${path}\`) in clear, concise terms. ` +
          `Describe its purpose, key functions, exports, and how it fits into the broader project.\n\n` +
          `\`\`\`${this.getExtension(path).slice(1)}\n${content}\n\`\`\``,
      },
    ];

    const response = await llm.chat(messages);
    return response.content;
  }

  // ── Internal helpers ────────────────────────────────────────────────

  private detectArchitecture(files: string[]): string {
    for (const { test, label } of ARCH_PATTERNS) {
      if (test(files)) return label;
    }
    return 'Unknown / unstructured';
  }

  private getExtension(filePath: string): string {
    const dotIdx = filePath.lastIndexOf('.');
    return dotIdx === -1 ? '' : filePath.slice(dotIdx);
  }

  private extensionToLanguage(ext: string): string | null {
    const map: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript (React)',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript (React)',
      '.mjs': 'JavaScript (ESM)',
      '.py': 'Python',
      '.rs': 'Rust',
      '.go': 'Go',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.html': 'HTML',
      '.json': 'JSON',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.md': 'Markdown',
      '.sql': 'SQL',
      '.sh': 'Shell',
      '.toml': 'TOML',
    };
    return map[ext] ?? null;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
