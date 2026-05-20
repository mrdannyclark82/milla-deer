/**
 * Legacy reference only.
 *
 * This root-level `server/` tree is not the active application runtime.
 * The live MCP and shell integrations now run from:
 * - `Milla-Rayne/server/mcpRuntimeService.ts`
 * - `Milla-Rayne/server/shellExecutionService.ts`
 *
 * This dispatcher snippet is incomplete (`registerAsSkill()` is not defined here)
 * and is retained only as historical/reference code so future work does not
 * accidentally target it instead of the active app.
 */
import { McpProvider } from '../mcp/McpProvider';

// Add to your ProviderDispatcher class
export class ProviderDispatcher {
  private mcpProvider: McpProvider | null = null;
  
  async initializeMcp(): Promise<void> {
    this.mcpProvider = new McpProvider();
    await this.mcpProvider.initialize();
  }

  registerMcpTools(): void {
    if (!this.mcpProvider) return;
    
    const tools = this.mcpProvider.getAllTools();
    
    tools.then(availableTools => {
      for (const { server, tool } of availableTools) {
        this.registerAsSkill(`mcp_${server}_${tool.name}`, {
          description: `[MCP:${server}] ${tool.description || tool.name}`,
          handler: async (args) => {
            return this.mcpProvider!.executeTool(server, tool.name, args);
          }
        });
      }
    });
  }
}
