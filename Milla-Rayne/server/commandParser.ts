import { parseCalendarCommand } from './gemini';
import {
  sanitizePromptInput,
  sanitizeEmail,
  sanitizeUrl,
  sanitizePath,
} from './sanitization';

export interface ParsedCommand {
  service:
    | 'calendar'
    | 'gmail'
    | 'mcp'
    | 'shell'
    | 'youtube'
    | 'tasks'
    | 'profile'
    | 'consciousness'
    | 'repository'
    | null;
  action:
    | 'list'
    | 'add'
    | 'delete'
    | 'send'
    | 'check'
    | 'get'
    | 'update'
    | 'complete'
    | 'trigger'
    | 'status'
    | 'run'
    | 'cancel'
    | null;
  entities: { [key: string]: string };
}

function createMcpRunCommand(
  entities: Record<string, string>
): ParsedCommand {
  return {
    service: 'mcp',
    action: 'run',
    entities,
  };
}

function normalizeBrowserUrlCandidate(candidate: string): string | null {
  let normalized = sanitizePromptInput(candidate).replace(/[),.!?]+$/, '').trim();
  if (!normalized) {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    if (/^[a-z0-9-]+$/i.test(normalized)) {
      normalized = `${normalized}.com`;
    }
    normalized = `https://${normalized}`;
  }

  return sanitizeUrl(normalized);
}

function isLikelyFilePath(candidate: string): boolean {
  return (
    /[\\/]/.test(candidate) ||
    /\.(?:ts|tsx|js|jsx|json|md|py|css|html|yml|yaml|sh|txt|sql|xml|env|lock|toml|ini)$/i.test(
      candidate
    )
  );
}

function toFileSearchPattern(query: string): string | null {
  const normalized = sanitizePromptInput(query)
    .replace(/^['"]|['"]$/g, '')
    .replace(/\bfiles?\b$/i, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const extensionFilesMatch = normalized.match(/\b([a-z0-9]+)\s+files?\b/i);
  if (extensionFilesMatch?.[1]) {
    return `**/*.${extensionFilesMatch[1].toLowerCase()}`;
  }

  if (/^\*\.[a-z0-9]+$/i.test(normalized)) {
    return `**/${normalized}`;
  }

  if (/^\.[a-z0-9]+$/i.test(normalized)) {
    return `**/*${normalized}`;
  }

  const sanitized = sanitizePath(normalized);
  if (!sanitized) {
    return null;
  }

  if (isLikelyFilePath(sanitized)) {
    return `**/${sanitized}`;
  }

  return `**/*${sanitized}*`;
}

function sanitizeCapturedContent(candidate: string): string {
  return sanitizePromptInput(candidate).replace(/^['"]|['"]$/g, '').trim();
}

function inferNaturalLanguageMcpRequest(message: string): ParsedCommand | null {
  const sanitizedMessage = sanitizePromptInput(message);
  const lowerMessage = sanitizedMessage.toLowerCase();

  const browserNavigationMatch = sanitizedMessage.match(
    /(?:open|navigate(?:\s+to)?|go\s+to|visit|load)(?:\s+the\s+browser(?:\s+to)?)?\s+((?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i
  );
  if (browserNavigationMatch?.[1]) {
    const url = normalizeBrowserUrlCandidate(browserNavigationMatch[1]);
    if (url) {
      return createMcpRunCommand({
        toolName: 'browser_navigate',
        url,
      });
    }
  }

  if (
    /(?:take|capture|grab).*(?:screenshot|snapshot)/i.test(lowerMessage) ||
    /(?:screenshot|snapshot).*(?:page|browser|site|screen)/i.test(lowerMessage)
  ) {
    return createMcpRunCommand({
      toolName: 'browser_screenshot',
      name: 'milla-hub-screenshot',
      fullPage:
        lowerMessage.includes('full page') ||
        lowerMessage.includes('whole page') ||
        lowerMessage.includes('entire page')
          ? 'true'
          : 'false',
      });
  }

  if (
    /\b(?:git|repo|repository)\s+status\b/i.test(lowerMessage) ||
    /\bstatus\s+(?:of\s+)?(?:the\s+)?(?:repo|repository)\b/i.test(lowerMessage)
  ) {
    return createMcpRunCommand({
      toolName: 'git-status',
    });
  }

  if (
    /\b(?:list|show|what are)\s+(?:the\s+)?branches\b/i.test(lowerMessage) ||
    /\bwhat\s+branch\s+(?:am\s+i\s+on|is\s+this)\b/i.test(lowerMessage)
  ) {
    return createMcpRunCommand({
      toolName: 'git-branch',
    });
  }

  if (
    /(?:git\s+log|commit\s+history|show(?:\s+the)?(?:\s+last\s+\d+)?\s+commits|recent\s+commits)/i.test(
      lowerMessage
    )
  ) {
    const countMatch = sanitizedMessage.match(/\b(?:last|recent)\s+(\d+)\b/i);
    return createMcpRunCommand({
      toolName: 'git-log',
      maxCount: sanitizePromptInput(countMatch?.[1] || '10'),
    });
  }

  if (/\b(?:git\s+diff|show\s+diff|diff\s+against)\b/i.test(lowerMessage)) {
    const targetMatch = sanitizedMessage.match(
      /(?:against|vs|versus|compared to|compare to)\s+([a-zA-Z0-9._/-]+)/i
    );
    return createMcpRunCommand({
      toolName: 'git-diff',
      target: sanitizePromptInput(targetMatch?.[1] || ''),
    });
  }

  const pullRequestUrl = sanitizedMessage.match(
    /https?:\/\/github\.com\/[^\s]+\/pull\/\d+/i
  )?.[0];
  if (
    pullRequestUrl &&
    /(review|analyze|analyse|check)\b/i.test(lowerMessage)
  ) {
    return createMcpRunCommand({
      toolName: 'codeReviewWithGithubUrl',
      url: pullRequestUrl,
    });
  }

  if (
    /(?:review|analyze|analyse|check)\s+(?:my\s+)?(?:changes|diff|code)\b/i.test(
      lowerMessage
    ) ||
    /\bcode review\b/i.test(lowerMessage)
  ) {
    const baseBranchMatch = sanitizedMessage.match(
      /(?:against|vs|versus|compared to|compare to)\s+([a-zA-Z0-9._/-]+)/i
    );

    return createMcpRunCommand({
      toolName: 'codeReview',
      baseBranch: sanitizePromptInput(baseBranchMatch?.[1] || 'main'),
    });
  }

  const fileReadMatch = sanitizedMessage.match(
    /(?:read|show|view|open)\s+(?:the\s+)?(?:file\s+)?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)/i
  );
  if (
    fileReadMatch?.[1] &&
    !lowerMessage.includes('browser') &&
    !lowerMessage.includes('website')
  ) {
    const filePath = sanitizePath(fileReadMatch[1]);
    if (filePath && isLikelyFilePath(filePath)) {
      return createMcpRunCommand({
        toolName: 'read_text_file',
        path: filePath,
      });
    }
  }

  const createFileMatch = sanitizedMessage.match(
    /(?:create|make)\s+(?:a\s+)?file\s+([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)\s+(?:with\s+content|containing)\s+([\s\S]+)/i
  );
  if (createFileMatch?.[1] && createFileMatch?.[2]) {
    const path = sanitizePath(createFileMatch[1]);
    const content = sanitizeCapturedContent(createFileMatch[2]);
    if (path && content) {
      return createMcpRunCommand({
        toolName: 'write_file',
        path,
        content,
      });
    }
  }

  const writeFileMatch = sanitizedMessage.match(
    /(?:write|save)\s+([\s\S]+?)\s+to\s+([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_-]+)/i
  );
  if (writeFileMatch?.[1] && writeFileMatch?.[2]) {
    const path = sanitizePath(writeFileMatch[2]);
    const content = sanitizeCapturedContent(writeFileMatch[1]);
    if (path && content) {
      return createMcpRunCommand({
        toolName: 'write_file',
        path,
        content,
      });
    }
  }

  const createDirectoryMatch = sanitizedMessage.match(
    /(?:create|make)\s+(?:a\s+)?(?:directory|folder)\s+([a-zA-Z0-9_./-]+)/i
  );
  if (createDirectoryMatch?.[1]) {
    const path = sanitizePath(createDirectoryMatch[1]);
    if (path) {
      return createMcpRunCommand({
        toolName: 'create_directory',
        path,
      });
    }
  }

  const fileSearchMatch = sanitizedMessage.match(
    /(?:find|search for|look for|locate)\s+(.+)$/i
  );
  if (fileSearchMatch?.[1]) {
    const query = fileSearchMatch[1].trim();
    const shouldSearchFiles =
      lowerMessage.includes('file') ||
      lowerMessage.includes('files') ||
      isLikelyFilePath(query);

    if (shouldSearchFiles) {
      const pattern = toFileSearchPattern(query);
      if (pattern) {
        return createMcpRunCommand({
          toolName: 'search_files',
          pattern,
        });
      }
    }
  }

  const listDirectoryMatch = sanitizedMessage.match(
    /(?:list|show)\s+(?:the\s+)?files?\s+(?:in|under)\s+([a-zA-Z0-9_./-]+)/i
  );
  if (listDirectoryMatch?.[1]) {
    const path = sanitizePath(listDirectoryMatch[1]);
    if (path) {
      return createMcpRunCommand({
        toolName: 'list_directory',
        path,
      });
    }
  }

  const directoryTreeMatch = sanitizedMessage.match(
    /(?:show|display|get)\s+(?:the\s+)?(?:directory\s+)?tree\s+(?:for|of)\s+([a-zA-Z0-9_./-]+)/i
  );
  if (directoryTreeMatch?.[1]) {
    const path = sanitizePath(directoryTreeMatch[1]);
    if (path) {
      return createMcpRunCommand({
        toolName: 'directory_tree',
        path,
      });
    }
  }

  const pollinationsTextMatch = sanitizedMessage.match(
    /(?:generate|create|write)\s+(?:text|copy|response)\s+(?:with|using)\s+pollinations(?:\s+about|\s+for)?\s+([\s\S]+)/i
  );
  if (pollinationsTextMatch?.[1]) {
    return createMcpRunCommand({
      toolName: 'generateText',
      prompt: sanitizeCapturedContent(pollinationsTextMatch[1]),
    });
  }

  const pollinationsSayMatch = sanitizedMessage.match(
    /(?:say|speak|read\s+aloud)\s+(?:with|using)\s+pollinations\s+([\s\S]+)/i
  );
  if (pollinationsSayMatch?.[1]) {
    return createMcpRunCommand({
      toolName: 'sayText',
      text: sanitizeCapturedContent(pollinationsSayMatch[1]),
    });
  }

  return null;
}

export async function parseCommand(message: string): Promise<ParsedCommand> {
  // Sanitize input to prevent prompt injection
  const sanitizedMessage = sanitizePromptInput(message);
  const lowerMessage = sanitizedMessage.toLowerCase();
  const result: ParsedCommand = {
    service: null,
    action: null,
    entities: {},
  };

  // Calendar
  if (
    lowerMessage.includes('calendar') ||
    lowerMessage.includes('event') ||
    lowerMessage.includes('schedule')
  ) {
    result.service = 'calendar';
    if (
      lowerMessage.includes('list') ||
      lowerMessage.includes('show') ||
      lowerMessage.includes('what is on')
    ) {
      result.action = 'list';
    } else if (
      lowerMessage.includes('add') ||
      lowerMessage.includes('create')
    ) {
      result.action = 'add';
      const calendarEntities = await parseCalendarCommand(message);
      if (calendarEntities) {
        result.entities.title = calendarEntities.title;
        result.entities.date = calendarEntities.date;
        result.entities.time = calendarEntities.time;
      }
    } else if (
      lowerMessage.includes('delete') ||
      lowerMessage.includes('remove')
    ) {
      result.action = 'delete';
    }
  }

  // Gmail
  else if (
    lowerMessage.includes('email') ||
    lowerMessage.includes('mail') ||
    lowerMessage.includes('inbox')
  ) {
    result.service = 'gmail';
    if (
      lowerMessage.includes('list') ||
      lowerMessage.includes('check') ||
      lowerMessage.includes('show')
    ) {
      result.action = 'list';
    } else if (lowerMessage.includes('send')) {
      result.action = 'send';
      const toMatch = lowerMessage.match(/to ([\w\s\d@.]+)/);
      if (toMatch) {
        const email = sanitizeEmail(toMatch[1].trim());
        if (email) result.entities.to = email;
      }
      const subjectMatch = lowerMessage.match(/subject (.*?)(?:and body|$)/);
      if (subjectMatch)
        result.entities.subject = sanitizePromptInput(subjectMatch[1].trim());
      const bodyMatch = lowerMessage.match(/body (.*)/);
      if (bodyMatch)
        result.entities.body = sanitizePromptInput(bodyMatch[1].trim());
    }
  }

  // MCP tools
  else if (
    lowerMessage.includes('mcp') ||
    lowerMessage.includes('model context protocol')
  ) {
    result.service = 'mcp';

    if (
      lowerMessage.includes('status') ||
      lowerMessage.includes('connected server') ||
      lowerMessage.includes('runtime')
    ) {
      result.action = 'status';
    } else if (
      (lowerMessage.includes('tool') &&
        (lowerMessage.includes('list') ||
          lowerMessage.includes('show') ||
          lowerMessage.includes('what are'))) ||
      lowerMessage.includes('list mcp tools')
    ) {
      result.action = 'list';
    } else {
      result.action = 'run';

      const imagePatterns = [
        /(?:generate|create|make)\s+(?:an?\s+)?image\s+(?:with|using)\s+mcp(?:\s+of|\s+for|\s+about)?\s+(.+)$/i,
        /(?:use|run|call)\s+(?:the\s+)?mcp\s+(?:image|generate image)\s+(?:tool\s+)?(?:for|with|on)?\s*(.+)$/i,
      ];
      const storyPatterns = [
        /(?:generate|create|write)\s+(?:an?\s+)?story\s+(?:with|using)\s+mcp(?:\s+about|\s+for)?\s+(.+)$/i,
        /(?:use|run|call)\s+(?:the\s+)?mcp\s+(?:story|generate story)\s+(?:tool\s+)?(?:for|with|on)?\s*(.+)$/i,
      ];

      for (const pattern of imagePatterns) {
        const match = sanitizedMessage.match(pattern);
        if (match?.[1]) {
          result.entities.toolName = 'generate_image';
          result.entities.prompt = sanitizePromptInput(match[1].trim());
          break;
        }
      }

      if (!result.entities.toolName) {
        for (const pattern of storyPatterns) {
          const match = sanitizedMessage.match(pattern);
          if (match?.[1]) {
            result.entities.toolName = 'generate_story';
            result.entities.prompt = sanitizePromptInput(match[1].trim());
            break;
          }
        }
      }
    }
  }

  const inferredMcpCommand = inferNaturalLanguageMcpRequest(sanitizedMessage);
  if (inferredMcpCommand) {
    return inferredMcpCommand;
  }

  // Shell runner
  if (
    lowerMessage.includes('shell') ||
    lowerMessage.includes('terminal') ||
    lowerMessage === 'ls' ||
    lowerMessage.startsWith('ls ') ||
    lowerMessage === 'pwd' ||
    lowerMessage.startsWith('pwd ') ||
    lowerMessage.includes('workspace check') ||
    lowerMessage.includes('workspace lint') ||
    lowerMessage.includes('workspace build') ||
    lowerMessage.includes('workspace test') ||
    lowerMessage.includes('git status') ||
    lowerMessage.includes('git diff') ||
    lowerMessage.includes('current directory') ||
    lowerMessage.includes('list files') ||
    lowerMessage.includes('repo tree') ||
    lowerMessage.includes('project tree') ||
    lowerMessage.includes('android directory') ||
    lowerMessage.includes('adb') ||
    lowerMessage.includes('network interfaces') ||
    lowerMessage.includes('ip addr') ||
    lowerMessage.includes('routing table') ||
    lowerMessage.includes('ip route') ||
    lowerMessage.includes('listening ports') ||
    lowerMessage.includes('open ports')
  ) {
    result.service = 'shell';

    if (
      (lowerMessage.includes('shell') && lowerMessage.includes('status')) ||
      (lowerMessage.includes('terminal') && lowerMessage.includes('status')) ||
      lowerMessage.includes('queue') ||
      lowerMessage.includes('shell runs')
    ) {
      result.action = 'status';
    } else if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('stop') ||
      lowerMessage.includes('abort')
    ) {
      result.action = 'cancel';
    } else {
      result.action = 'run';

      if (
        lowerMessage.includes('workspace check') ||
        (lowerMessage.includes('check') && lowerMessage.includes('workspace'))
      ) {
        result.entities.commandId = 'workspace-check';
      } else if (
        lowerMessage.includes('workspace lint') ||
        lowerMessage.includes('run lint') ||
        lowerMessage.includes('lint the workspace')
      ) {
        result.entities.commandId = 'workspace-lint';
      } else if (
        lowerMessage.includes('workspace build') ||
        lowerMessage.includes('run build') ||
        lowerMessage.includes('build the workspace')
      ) {
        result.entities.commandId = 'workspace-build';
      } else if (
        lowerMessage.includes('workspace test') ||
        lowerMessage.includes('run tests') ||
        lowerMessage.includes('run test') ||
        lowerMessage.includes('test the workspace')
      ) {
        result.entities.commandId = 'workspace-test';
      } else if (
        lowerMessage === 'pwd' ||
        lowerMessage.includes('current directory') ||
        lowerMessage.includes('repo path')
      ) {
        result.entities.commandId = 'repo-pwd';
      } else if (
        lowerMessage === 'ls' ||
        lowerMessage.includes('list files') ||
        lowerMessage.includes('list repo files') ||
        lowerMessage.includes('repository listing')
      ) {
        result.entities.commandId = 'repo-list';
      } else if (
        lowerMessage.includes('repo tree') ||
        lowerMessage.includes('project tree') ||
        lowerMessage.includes('directory tree')
      ) {
        result.entities.commandId = 'repo-tree';
      } else if (
        lowerMessage.includes('android directory') ||
        lowerMessage.includes('list android files')
      ) {
        result.entities.commandId = 'android-list';
      } else if (lowerMessage.includes('git status')) {
        result.entities.commandId = 'git-status';
      } else if (
        lowerMessage.includes('git diff') ||
        lowerMessage.includes('git diff stat') ||
        lowerMessage.includes('git diff summary') ||
        lowerMessage.includes('git diff stats')
      ) {
        result.entities.commandId = 'git-diff-stat';
      } else if (lowerMessage.includes('adb devices')) {
        result.entities.commandId = 'adb-devices';
      } else if (
        lowerMessage.includes('adb info') ||
        lowerMessage.includes('adb device info') ||
        lowerMessage.includes('tablet info') ||
        lowerMessage.includes('device info')
      ) {
        result.entities.commandId = 'adb-device-info';
      } else if (
        lowerMessage.includes('adb network') ||
        lowerMessage.includes('tablet network') ||
        lowerMessage.includes('device network')
      ) {
        result.entities.commandId = 'adb-network-info';
      } else if (
        lowerMessage.includes('network interfaces') ||
        lowerMessage.includes('ip addr')
      ) {
        result.entities.commandId = 'host-network-interfaces';
      } else if (
        lowerMessage.includes('routing table') ||
        lowerMessage.includes('ip route')
      ) {
        result.entities.commandId = 'host-network-routes';
      } else if (
        lowerMessage.includes('listening ports') ||
        lowerMessage.includes('open ports')
      ) {
        result.entities.commandId = 'host-listening-ports';
      }
    }
  }

  // YouTube - flexible natural language matching
  else if (
    lowerMessage.includes('youtube') ||
    lowerMessage.includes('subscriptions') ||
    lowerMessage.includes('play') ||
    lowerMessage.includes('watch') ||
    lowerMessage.includes('show me') ||
    lowerMessage.includes('find') ||
    lowerMessage.includes('put on') ||
    lowerMessage.includes('search for')
  ) {
    result.service = 'youtube';

    if (
      lowerMessage.includes('list') ||
      lowerMessage.includes('my subscriptions')
    ) {
      result.action = 'list';
    } else if (
      lowerMessage.includes('play') ||
      lowerMessage.includes('watch') ||
      lowerMessage.includes('show me') ||
      lowerMessage.includes('find') ||
      lowerMessage.includes('put on') ||
      lowerMessage.includes('search')
    ) {
      result.action = 'get';

      // Extract search query using flexible patterns
      let query = '';

      // Try various patterns to extract the search query
      const patterns = [
        /(?:play|watch|show me|find|put on|search for)\s+(?:some\s+)?(?:me\s+)?(.+?)(?:\s+(?:video|videos|on youtube|music|song))?$/i,
        /(?:i want to|i wanna|i'd like to)\s+(?:watch|see|hear)\s+(.+)$/i,
      ];

      for (const pattern of patterns) {
        const match = lowerMessage.match(pattern);
        if (match && match[1]) {
          query = match[1].trim();
          // Remove common filler words
          query = query
            .replace(
              /(?:some|a|the|for me|please|video|videos|on youtube|music|song)\s*/gi,
              ''
            )
            .trim();
          break;
        }
      }

      // If no pattern matched, use everything after the trigger word
      if (!query) {
        const triggerWords = [
          'play',
          'watch',
          'show me',
          'find',
          'put on',
          'search for',
        ];
        for (const trigger of triggerWords) {
          if (lowerMessage.includes(trigger)) {
            const parts = lowerMessage.split(trigger);
            if (parts[1]) {
              query = parts[1].trim();
              break;
            }
          }
        }
      }

      if (query) {
        result.entities.query = sanitizePromptInput(query);
        result.entities.sortBy = 'relevance';

        // Adjust sorting based on keywords
        if (
          lowerMessage.includes('popular') ||
          lowerMessage.includes('most viewed')
        ) {
          result.entities.sortBy = 'viewCount';
        } else if (
          lowerMessage.includes('recent') ||
          lowerMessage.includes('latest') ||
          lowerMessage.includes('new')
        ) {
          result.entities.sortBy = 'date';
        }
      }
    }
  }

  // Google Tasks
  else if (
    lowerMessage.includes('task') ||
    lowerMessage.includes('todo') ||
    lowerMessage.includes('to-do') ||
    lowerMessage.includes('reminder')
  ) {
    result.service = 'tasks';

    if (
      lowerMessage.includes('list') ||
      lowerMessage.includes('show') ||
      lowerMessage.includes('what are') ||
      lowerMessage.includes('check my')
    ) {
      result.action = 'list';
    } else if (
      lowerMessage.includes('add') ||
      lowerMessage.includes('create') ||
      lowerMessage.includes('make')
    ) {
      result.action = 'add';
      const addMatch = sanitizedMessage.match(
        /(?:add|create|make)\s+(?:a\s+)?(?:task|todo|to-do|reminder)\s+(?:to\s+)?(.+)/i
      );
      if (addMatch?.[1]) {
        result.entities.title = sanitizePromptInput(addMatch[1].trim());
      }
    } else if (
      lowerMessage.includes('complete') ||
      lowerMessage.includes('finish') ||
      lowerMessage.includes('done')
    ) {
      result.action = 'complete';
      const taskIdMatch = sanitizedMessage.match(
        /(?:complete|finish|mark)\s+(?:task\s+)?([a-zA-Z0-9_-]{6,})/i
      );
      if (taskIdMatch?.[1]) {
        result.entities.taskId = sanitizePromptInput(taskIdMatch[1].trim());
      }
    } else if (
      lowerMessage.includes('delete') ||
      lowerMessage.includes('remove')
    ) {
      result.action = 'delete';
      const taskIdMatch = sanitizedMessage.match(
        /(?:delete|remove)\s+(?:task\s+)?([a-zA-Z0-9_-]{6,})/i
      );
      if (taskIdMatch?.[1]) {
        result.entities.taskId = sanitizePromptInput(taskIdMatch[1].trim());
      }
    }
  }

  // Consciousness cycles
  else if (
    lowerMessage.includes('gim cycle') ||
    lowerMessage.includes('rem cycle') ||
    lowerMessage.includes('dream cycle') ||
    lowerMessage.includes('consciousness')
  ) {
    result.service = 'consciousness';
    if (
      lowerMessage.includes('run') ||
      lowerMessage.includes('start') ||
      lowerMessage.includes('trigger')
    ) {
      result.action = 'trigger';
      if (lowerMessage.includes('gim')) {
        result.entities.cycle = 'gim';
      } else if (
        lowerMessage.includes('rem') ||
        lowerMessage.includes('dream')
      ) {
        result.entities.cycle = 'rem';
      }
    } else {
      result.action = 'status';
    }
  }

  // Repository discovery / proactive scan
  else if (
    lowerMessage.includes('repo discovery') ||
    lowerMessage.includes('repository discovery') ||
    lowerMessage.includes('feature discovery') ||
    lowerMessage.includes('scan github') ||
    lowerMessage.includes('search repositories')
  ) {
    result.service = 'repository';
    if (
      lowerMessage.includes('run') ||
      lowerMessage.includes('start') ||
      lowerMessage.includes('trigger') ||
      lowerMessage.includes('scan')
    ) {
      result.action = 'trigger';
    } else {
      result.action = 'status';
    }
  }

  // Profile
  else if (lowerMessage.startsWith('my name is')) {
    result.service = 'profile';
    result.action = 'update';
    result.entities.name = sanitizePromptInput(
      sanitizedMessage.substring('my name is'.length).trim()
    );
  } else if (lowerMessage.startsWith('i like')) {
    result.service = 'profile';
    result.action = 'update';
    result.entities.interest = sanitizePromptInput(
      sanitizedMessage.substring('i like'.length).trim()
    );
  }

  return result;
}
