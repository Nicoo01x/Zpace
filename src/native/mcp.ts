import { invoke, listen } from './bridge';

/**
 * The app's own MCP server (Rust, loopback HTTP): the voice assistant's Claude
 * calls tools there, the page carries them out. `mcpStart` returns the port;
 * `onMcpCall` delivers each call; `mcpReply` answers it.
 */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export const mcpStart = () => invoke<number>('mcp_start');
export const mcpSetTools = (tools: McpToolDef[]) => invoke<void>('mcp_set_tools', { tools });
export const mcpReply = (id: string, result: { text: string; isError?: boolean }) => invoke<void>('mcp_reply', { id, result });
export const onMcpCall = (handler: (call: McpCall) => void) => listen<McpCall>('mcp://call', handler);
