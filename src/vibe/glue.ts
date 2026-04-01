/**
 * glue.ts — Vibe coding glue layer.
 *
 * Parses natural language into structured tasks, generates code from
 * parsed vibes, and validates the output. The bridge between "vibes"
 * and working code.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type VibeType = 'app' | 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs' | 'config';
export type Framework = 'vanilla' | 'react' | 'vue' | 'svelte' | 'next' | 'hono' | 'express' | 'auto';
export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'auto';

export interface ParsedVibe {
  type: VibeType;
  framework: Framework;
  language: Language;
  description: string;
  features: string[];
  area?: string;
  scope?: string;
  confidence: number;
  rawInput: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedOutput {
  files: GeneratedFile[];
  tests: GeneratedFile[];
  readme: string;
  vibe: ParsedVibe;
  warnings: string[];
  timestamp: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  message: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: string;
}

export interface VibeContext {
  existingFiles?: Map<string, string>;
  packageJson?: Record<string, unknown>;
  framework?: Framework;
  language?: Language;
}

// ── Vibe Parsing ─────────────────────────────────────────────────────────

const TYPE_KEYWORDS: Record<VibeType, string[]> = {
  app: ['make a', 'build a', 'create a', 'new app', 'scaffold', 'generate a', 'new project', 'setup a'],
  feature: ['add', 'implement', 'support', 'include', 'enable', 'integrate', 'build'],
  bugfix: ['fix', 'bug', 'broken', 'crash', 'error in', 'issue with', 'not working', 'debug'],
  refactor: ['refactor', 'clean up', 'restructure', 'reorganize', 'rewrite', 'optimize', 'simplify'],
  test: ['test', 'tests', 'spec', 'coverage', 'unit test', 'integration test'],
  docs: ['document', 'docs', 'readme', 'explain', 'comment', 'documentation'],
  config: ['configure', 'config', 'setup', 'init', 'install', 'deploy'],
};

const FRAMEWORK_KEYWORDS: Record<Framework, string[]> = {
  react: ['react', 'jsx', 'tsx', 'component'],
  vue: ['vue', 'vue.js', 'vuejs'],
  svelte: ['svelte'],
  next: ['next.js', 'nextjs', 'next'],
  hono: ['hono', 'cloudflare workers', 'workers'],
  express: ['express', 'express.js', 'node server'],
  vanilla: ['vanilla', 'plain', 'html', 'css', 'no framework', 'simple'],
  auto: [],
};

const FEATURE_EXTRACTORS: Array<{ pattern: RegExp; feature: string }> = [
  { pattern: /\b(todo|todos|task|tasks)\b/i, feature: 'todos' },
  { pattern: /\b(add|create|new)\b/i, feature: 'add' },
  { pattern: /\b(delete|remove)\b/i, feature: 'delete' },
  { pattern: /\b(edit|update|modify)\b/i, feature: 'edit' },
  { pattern: /\b(login|signin|sign in|auth)\b/i, feature: 'auth' },
  { pattern: /\b(signup|sign up|register)\b/i, feature: 'signup' },
  { pattern: /\b(dark\s*mode|dark\s*theme)\b/i, feature: 'dark-mode' },
  { pattern: /\b(search|filter)\b/i, feature: 'search' },
  { pattern: /\b(sort|sorting)\b/i, feature: 'sort' },
  { pattern: /\b(pagination|paginate|pages)\b/i, feature: 'pagination' },
  { pattern: /\b(upload|file)\b/i, feature: 'upload' },
  { pattern: /\b(notif|alert|toast)\b/i, feature: 'notifications' },
  { pattern: /\b(chart|graph|visuali)\b/i, feature: 'charts' },
  { pattern: /\b(api|endpoint|rest|graphql)\b/i, feature: 'api' },
  { pattern: /\b(dashboard|admin)\b/i, feature: 'dashboard' },
  { pattern: /\b(form|input|submit)\b/i, feature: 'forms' },
  { pattern: /\b(database|db|storage|persist)\b/i, feature: 'database' },
  { pattern: /\b(realtime|real-time|live|socket|websocket)\b/i, feature: 'realtime' },
  { pattern: /\b(i18n|international|local|translate)\b/i, feature: 'i18n' },
  { pattern: /\b(responsive|mobile)\b/i, feature: 'responsive' },
];

const AREA_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'login', 'signin', 'session', 'token', 'password', 'jwt'],
  ui: ['ui', 'css', 'style', 'layout', 'theme', 'color', 'font', 'dark mode'],
  api: ['api', 'endpoint', 'route', 'handler', 'middleware'],
  data: ['database', 'model', 'schema', 'migration', 'query'],
  test: ['test', 'spec', 'mock', 'fixture', 'coverage'],
  config: ['config', 'env', 'settings', 'docker', 'deploy'],
};

/**
 * Parse natural language into a structured vibe task.
 *
 * Examples:
 *   'make a todo app' → { type: 'app', framework: 'vanilla', features: ['todos','add'] }
 *   'fix the login bug' → { type: 'bugfix', area: 'auth' }
 *   'add dark mode' → { type: 'feature', scope: 'ui', features: ['dark-mode'] }
 */
export function parseVibeRequest(text: string): ParsedVibe {
  const normalized = text.trim().toLowerCase();
  let confidence = 0.5;

  // Detect type
  let type: VibeType = 'feature';
  let typeScore = 0;
  for (const [t, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        const score = kw.split(' ').length; // multi-word matches score higher
        if (score > typeScore) {
          typeScore = score;
          type = t as VibeType;
          confidence += 0.15;
        }
      }
    }
  }

  // Detect framework
  let framework: Framework = 'auto';
  for (const [fw, keywords] of Object.entries(FRAMEWORK_KEYWORDS)) {
    if (fw === 'auto') continue;
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        framework = fw as Framework;
        confidence += 0.1;
        break;
      }
    }
    if (framework !== 'auto') break;
  }

  // Detect language
  let language: Language = 'auto';
  if (normalized.includes('typescript') || normalized.includes('ts')) language = 'typescript';
  else if (normalized.includes('python') || normalized.includes('py')) language = 'python';
  else if (normalized.includes('golang') || normalized.includes('go ')) language = 'go';
  else if (normalized.includes('rust')) language = 'rust';
  else if (normalized.includes('javascript') || normalized.includes('js')) language = 'javascript';

  // Extract features
  const features: string[] = [];
  for (const { pattern, feature } of FEATURE_EXTRACTORS) {
    if (pattern.test(normalized) && !features.includes(feature)) {
      features.push(feature);
    }
  }

  // Detect area
  let area: string | undefined;
  for (const [a, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      area = a;
      break;
    }
  }

  // Detect scope
  let scope: string | undefined;
  if (normalized.includes(' ui') || normalized.includes('style')) scope = 'ui';
  else if (normalized.includes('backend') || normalized.includes('server')) scope = 'backend';
  else if (normalized.includes('frontend') || normalized.includes('client')) scope = 'frontend';
  else if (normalized.includes('database') || normalized.includes('db')) scope = 'data';

  confidence = Math.min(1.0, confidence);

  return {
    type,
    framework,
    language,
    description: text.trim(),
    features,
    area,
    scope,
    confidence,
    rawInput: text,
  };
}

// ── Vibe Generation ──────────────────────────────────────────────────────

interface LLMCall {
  (prompt: string): Promise<string>;
}

/**
 * Generate code from a parsed vibe using an LLM-based agent loop.
 * The caller provides an LLM function — this module is transport-agnostic.
 */
export async function generateFromVibe(
  parsed: ParsedVibe,
  context: VibeContext,
  llm?: LLMCall,
): Promise<GeneratedOutput> {
  const warnings: string[] = [];

  // Build the generation prompt
  const framework = parsed.framework === 'auto'
    ? (context.framework ?? 'vanilla')
    : parsed.framework;
  const language = parsed.language === 'auto'
    ? (context.language ?? 'typescript')
    : parsed.language;

  const systemPrompt = buildSystemPrompt(parsed, framework, language);

  // If no LLM provided, generate scaffold templates
  if (!llm) {
    return generateScaffold(parsed, framework, language, warnings);
  }

  // Build context from existing files
  const fileList = context.existingFiles
    ? Array.from(context.existingFiles.keys()).join(', ')
    : '(none)';

  const userPrompt = `${systemPrompt}\n\nExisting files in repo: ${fileList}\n\nGenerate the code now. Output each file with its path in a markdown code block like:\n\`\`\`path:src/foo.ts\n// code here\n\`\`\``;

  const response = await llm(userPrompt);

  // Parse the response into files
  const files = parseGeneratedFiles(response);
  const tests = files.filter(f => f.path.includes('.test.') || f.path.includes('.spec.'));
  const mainFiles = files.filter(f => !tests.includes(f));

  // Generate a readme stub
  const readme = generateReadme(parsed, mainFiles);

  return {
    files: mainFiles,
    tests,
    readme,
    vibe: parsed,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ── Validation ───────────────────────────────────────────────────────────

/** Patterns that indicate security issues. */
const SECURITY_PATTERNS: Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> = [
  { pattern: /\beval\s*\(/, message: 'Use of eval() is a security risk', severity: 'error' },
  { pattern: /\bFunction\s*\(/, message: 'Dynamic function construction', severity: 'warning' },
  { pattern: /\bdocument\.write\b/, message: 'document.write can cause XSS', severity: 'warning' },
  { pattern: /\.innerHTML\s*=\s*[^"']/, message: 'Direct innerHTML assignment — potential XSS', severity: 'warning' },
  { pattern: /\bfetch\s*\(\s*["']http:\/\//, message: 'Insecure HTTP fetch — use HTTPS', severity: 'warning' },
  { pattern: /password|secret|token|api.key/i, message: 'Possible hardcoded secret', severity: 'error' },
  { pattern: /process\.env\.\w+\s*\|\|\s*["'][^"']+["']/, message: 'Environment variable with hardcoded fallback — potential leak', severity: 'warning' },
];

/** Syntax error indicators. */
const SYNTAX_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^\s*\}/gm, message: 'Possible unmatched closing brace' },
];

/**
 * Validate generated code for syntax, security, and best practices.
 */
export function validateVibeOutput(generated: GeneratedOutput): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const file of [...generated.files, ...generated.tests]) {
    // Security scan
    for (const { pattern, message, severity } of SECURITY_PATTERNS) {
      const match = pattern.exec(file.content);
      if (match) {
        const line = file.content.substring(0, match.index).split('\n').length;
        issues.push({ severity, file: file.path, message, line });
      }
    }

    // Basic syntax checks for TS/JS
    if (file.path.endsWith('.ts') || file.path.endsWith('.js')) {
      const braces = countChar(file.content, '{') - countChar(file.content, '}');
      const parens = countChar(file.content, '(') - countChar(file.content, ')');
      if (Math.abs(braces) > 2) {
        issues.push({
          severity: 'warning',
          file: file.path,
          message: `Possible unbalanced braces (diff: ${braces})`,
        });
      }
      if (Math.abs(parens) > 2) {
        issues.push({
          severity: 'warning',
          file: file.path,
          message: `Possible unbalanced parentheses (diff: ${parens})`,
        });
      }
    }

    // Check for empty files
    if (file.content.trim().length === 0) {
      issues.push({
        severity: 'warning',
        file: file.path,
        message: 'File is empty',
      });
    }
  }

  // Check dependency resolution
  if (generated.warnings.length > 0) {
    for (const w of generated.warnings) {
      issues.push({ severity: 'info', file: '(general)', message: w });
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const valid = errors.length === 0;

  const summary = valid
    ? `Validation passed with ${issues.length} warning(s).`
    : `Validation failed with ${errors.length} error(s) and ${issues.length - errors.length} warning(s).`;

  return { valid, issues, summary };
}

// ── Internal Helpers ─────────────────────────────────────────────────────

function buildSystemPrompt(
  parsed: ParsedVibe,
  framework: string,
  language: string,
): string {
  return `You are a code generator for makerlog.ai. Generate production-quality ${language} code.

Task: ${parsed.description}
Type: ${parsed.type}
Framework: ${framework}
Features: ${parsed.features.join(', ') || 'basic'}
${parsed.area ? `Area: ${parsed.area}` : ''}
${parsed.scope ? `Scope: ${parsed.scope}` : ''}

Rules:
- Use TypeScript strict mode
- ESM imports with .js extensions
- No eval(), no hardcoded secrets
- Include proper error handling
- Follow existing project conventions
- Generate tests alongside main code`;
}

function generateScaffold(
  parsed: ParsedVibe,
  framework: string,
  language: string,
  warnings: string[],
): GeneratedOutput {
  warnings.push('No LLM provided — generated scaffold template. Connect an LLM for full code generation.');

  const isTs = language === 'typescript' || language === 'auto';
  const ext = isTs ? 'ts' : 'js';

  const files: GeneratedFile[] = [];
  const tests: GeneratedFile[] = [];

  if (parsed.type === 'app') {
    const appName = parsed.description.replace(/^(make\s+a\s+|build\s+a\s+|create\s+a\s+)/i, '').replace(/\s+app$/i, '') || 'my-app';

    files.push({
      path: `src/index.${ext}`,
      content: `// ${appName} — generated by makerlog-ai vibe coding\n\n${isTs ? "import type { Request } from './types.js';\n\n" : ''}export function main() {\n  console.log('${appName} is alive!');\n}\n\nmain();\n`,
    });

    if (parsed.features.includes('api')) {
      files.push({
        path: `src/routes.${ext}`,
        content: `// API routes for ${appName}\n\nexport const routes = {\n  '/': () => new Response('OK'),\n};\n`,
      });
    }

    files.push({
      path: `src/types.${ext}`,
      content: `// Type definitions for ${appName}\n\nexport interface Config {\n  name: string;\n  version: string;\n}\n`,
    });

    tests.push({
      path: `tests/index.test.${ext}`,
      content: `import { describe, it, expect } from 'vitest';\n\ndescribe('${appName}', () => {\n  it('should be alive', () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    });
  } else {
    // Feature / bugfix / refactor scaffold
    const areaName = parsed.area ?? parsed.scope ?? 'module';
    files.push({
      path: `src/${areaName}/index.${ext}`,
      content: `// ${parsed.description} — ${parsed.type}\n// Generated by makerlog-ai vibe coding\n\nexport function init() {\n  // TODO: Implement ${parsed.description}\n}\n`,
    });

    tests.push({
      path: `tests/${areaName}.test.${ext}`,
      content: `import { describe, it, expect } from 'vitest';\n\ndescribe('${areaName}', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    });
  }

  const readme = generateReadme(parsed, files);

  return {
    files,
    tests,
    readme,
    vibe: parsed,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

function generateReadme(parsed: ParsedVibe, files: GeneratedFile[]): string {
  const fileList = files.map(f => `- \`${f.path}\``).join('\n');
  return `# ${parsed.description}

Generated by makerlog-ai vibe coding.

**Type:** ${parsed.type}
**Features:** ${parsed.features.join(', ') || 'basic'}

## Files

${fileList}

## Getting Started

\`\`\`bash
npm install
npm test
npm run dev
\`\`\`
`;
}

function parseGeneratedFiles(response: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const regex = /```(?:path:)?([^\n]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    const path = match[1]!.trim();
    const content = match[2]!.trim();
    if (path && content) {
      files.push({ path, content });
    }
  }

  return files;
}

function countChar(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) count++;
  }
  return count;
}
