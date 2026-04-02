/**
 * src/core/terminal.ts
 * 
 * In-memory terminal emulator for the MakerLog.ai self-building agent.
 * This class provides a sandboxed command-line interface, managing its own
 * state including CWD, environment variables, and command history. It interacts
 * with a virtual filesystem via a provided `fileManager` dependency.
 */

// --- Interfaces ---

export interface TerminalLine {
  content: string;
  type: 'input' | 'output' | 'error' | 'system';
  timestamp: number;
}

export interface TabCompletion {
  matches: string[];
  common: string;
}

export interface TerminalState {
  cwd: string;
  env: Map<string, string>;
  history: string[];
  historyIndex: number;
  lines: TerminalLine[];
  running: boolean;
}

// --- FileManager Dependency Interface (for clarity) ---
// The Terminal expects a fileManager object with an API similar to this.
interface IFileManager {
  list(path: string): { name: string, isDirectory: boolean }[];
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  createDirectory(path: string): void;
  delete(path: string): void;
  move(src: string, dest: string): void;
  copy(src: string, dest: string): void;
  find(path: string, pattern: string): string[];
  resolvePath(path: string, cwd: string): string;
  isDirectory(path: string): boolean;
  dirname(path: string): string;
  basename(path: string): string;
  join(...paths: string[]): string;
}

// --- Terminal Class ---

export class Terminal {
  private state: TerminalState;
  private fileManager: IFileManager;
  private commands = new Map<string, (args: string[]) => string>();

  constructor(fileManager: IFileManager, initialState?: Partial<TerminalState>) {
    this.fileManager = fileManager;
    const defaultState: TerminalState = {
      cwd: '/app',
      env: new Map([['HOME', '/home/user'], ['PATH', '/bin']]),
      history: [],
      historyIndex: -1,
      lines: [],
      running: false,
    };

    this.state = { ...defaultState, ...initialState };
    if (initialState?.env && !(initialState.env instanceof Map)) {
      this.state.env = new Map(Object.entries(initialState.env));
    }

    this._registerBuiltinCommands();
    this.writeOutput('MakerLog.ai Terminal Initialized.', 'system');
  }

  // --- Public API ---

  /** Executes a command string. */
  public execute(input: string): string {
    const trimmedInput = input.trim();
    if (!trimmedInput) return '';

    this.writeOutput(`$ ${trimmedInput}`, 'input');
    if (this.state.