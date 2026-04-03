import { parseCommand } from '../commandParser';

describe('commandParser', () => {
  it('should parse "my name is" command', async () => {
    const command = 'my name is John Doe';
    const parsed = await parseCommand(command);
    expect(parsed.service).toBe('profile');
    expect(parsed.action).toBe('update');
    expect(parsed.entities.name).toBe('John Doe');
  });

  it('should parse "i like" command', async () => {
    const command = 'i like AI';
    const parsed = await parseCommand(command);
    expect(parsed.service).toBe('profile');
    expect(parsed.action).toBe('update');
    expect(parsed.entities.interest).toBe('AI');
  });

  it('should parse task list requests', async () => {
    const parsed = await parseCommand('show my tasks');
    expect(parsed.service).toBe('tasks');
    expect(parsed.action).toBe('list');
  });

  it('should parse GIM cycle trigger requests', async () => {
    const parsed = await parseCommand('run the gim cycle');
    expect(parsed.service).toBe('consciousness');
    expect(parsed.action).toBe('trigger');
    expect(parsed.entities.cycle).toBe('gim');
  });

  it('should parse repository discovery trigger requests', async () => {
    const parsed = await parseCommand('scan github for features');
    expect(parsed.service).toBe('repository');
    expect(parsed.action).toBe('trigger');
  });

  it('should parse MCP tool listing requests', async () => {
    const parsed = await parseCommand('list mcp tools');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('list');
  });

  it('should parse MCP story generation requests', async () => {
    const parsed = await parseCommand(
      'generate a story with mcp about a cyber deer in space'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('generate_story');
    expect(parsed.entities.prompt).toBe('a cyber deer in space');
  });

  it('should infer MCP browser navigation from natural language', async () => {
    const parsed = await parseCommand('open github.com in the browser');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('browser_navigate');
    expect(parsed.entities.url).toBe('https://github.com');
  });

  it('should infer MCP screenshots from natural language', async () => {
    const parsed = await parseCommand('take a full page screenshot');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('browser_screenshot');
    expect(parsed.entities.fullPage).toBe('true');
  });

  it('should infer MCP code review from natural language', async () => {
    const parsed = await parseCommand('review my changes against develop');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('codeReview');
    expect(parsed.entities.baseBranch).toBe('develop');
  });

  it('should infer MCP file reads from natural language', async () => {
    const parsed = await parseCommand('read package.json');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('read_text_file');
    expect(parsed.entities.path).toBe('package.json');
  });

  it('should infer MCP git status from natural language', async () => {
    const parsed = await parseCommand('check repository status');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('git-status');
  });

  it('should infer MCP git log from natural language', async () => {
    const parsed = await parseCommand('show the last 5 commits');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('git-log');
    expect(parsed.entities.maxCount).toBe('5');
  });

  it('should infer MCP file writes from natural language', async () => {
    const parsed = await parseCommand('create file notes.txt with content hello world');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('write_file');
    expect(parsed.entities.path).toBe('notes.txt');
    expect(parsed.entities.content).toBe('hello world');
  });

  it('should infer MCP directory listing from natural language', async () => {
    const parsed = await parseCommand('list files in client/src');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('list_directory');
    expect(parsed.entities.path).toBe('client/src');
  });

  it('should infer Pollinations text generation from natural language', async () => {
    const parsed = await parseCommand(
      'generate text with pollinations about a glowing cyber forest'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('generateText');
    expect(parsed.entities.prompt).toBe('a glowing cyber forest');
  });

  it('should infer Pollinations speech generation from natural language', async () => {
    const parsed = await parseCommand(
      'say with pollinations welcome back commander'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('sayText');
    expect(parsed.entities.text).toBe('welcome back commander');
  });

  it('should infer recent message lookup from natural language', async () => {
    const parsed = await parseCommand('show my recent saved messages limit 5');
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('listRecentMessages');
    expect(parsed.entities.limit).toBe('5');
  });

  it('should infer stored message search from natural language', async () => {
    const parsed = await parseCommand(
      'search my saved messages for google auth'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('searchStoredMessages');
    expect(parsed.entities.query).toBe('google auth');
  });

  it('should infer memory summary search from natural language', async () => {
    const parsed = await parseCommand(
      'search my memory summaries about dashboard layout'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('searchMemorySummaries');
    expect(parsed.entities.query).toBe('dashboard layout');
  });

  it('should infer broker memory context lookup from natural language', async () => {
    const parsed = await parseCommand(
      'pull my memory context for screen share debugging'
    );
    expect(parsed.service).toBe('mcp');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.toolName).toBe('getBrokerMemoryContext');
    expect(parsed.entities.query).toBe('screen share debugging');
  });

  it('should parse adb devices requests as shell commands', async () => {
    const parsed = await parseCommand('adb devices');
    expect(parsed.service).toBe('shell');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.commandId).toBe('adb-devices');
  });

  it('should parse pwd requests as shell commands', async () => {
    const parsed = await parseCommand('pwd');
    expect(parsed.service).toBe('shell');
    expect(parsed.action).toBe('run');
    expect(parsed.entities.commandId).toBe('repo-pwd');
  });
});
