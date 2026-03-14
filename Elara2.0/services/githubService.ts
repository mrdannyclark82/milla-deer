export interface GitHubNode {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
}

class GitHubService {
  private token: string | null = null;

  initialize(token: string) {
    this.token = token;
    if (token) {
      localStorage.setItem('github_token', token);
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('github_token');
    }
    return this.token;
  }

  parseRepoString(input: string): { owner: string; repo: string } | null {
    const match = input.match(/(?:https?:\/\/github\.com\/)?([^\/]+)\/([^\/\s]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace('.git', '') };
    }
    return null;
  }

  async fetchRepoContents(owner: string, repo: string, path: string = ''): Promise<GitHubNode[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json'
    };
    
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Repository not found or private' : 'Failed to fetch repo contents');
    }

    const data = await response.json();
    return Array.isArray(data) ? data.map((item: any) => ({
      path: item.path,
      type: item.type,
      sha: item.sha,
      url: item.url
    })) : [];
  }

  async fetchFileContent(url: string): Promise<string> {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3.raw'
    };
    
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error('Failed to fetch file content');
    }

    return await response.text();
  }
}

export const githubService = new GitHubService();
