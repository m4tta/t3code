/**
 * Agents that cannot attach the `t3-code` MCP server reach its tools through
 * a terminal command instead: ACP agents through the `acp-mcp-call` CLI, and
 * Claude's terminal transport through the `t3-mcp` shim that wraps it. These
 * helpers recover the MCP call from that command line and its stdout so the
 * call can render like a native T3 tool call.
 */

export interface T3McpTerminalCall {
  readonly tool: string;
  /** The arguments object, when the arguments parsed as one. */
  readonly input?: Record<string, unknown>;
  /** Whether anything followed the tool name, parsed or not. */
  readonly hasArgs: boolean;
}

export interface T3McpTerminalOutput {
  /** The tool result's `structuredContent`, else its `content`. */
  readonly output: unknown;
  readonly isError: boolean;
}

// Tool names start with a letter, so flags such as `--schema` stay plain
// commands instead of rendering as a call to a tool named after the flag.

/** An invocation anywhere in a command line, such as after `"$T3_ACP_MCP_NODE" ...`. */
const T3_MCP_TERMINAL_CALL =
  /(?:^|[\s"'=/])(?:acp-mcp-call|t3-mcp)[\s"']+([A-Za-z][A-Za-z0-9_.-]*)(?:\s+(.+?))?\s*$/u;

/** An invocation that is the whole command line, optionally path-prefixed. */
const T3_MCP_WHOLE_TERMINAL_CALL =
  /^\s*(?:[^\s"'|&;<>()$`]*\/)?(?:acp-mcp-call|t3-mcp)\s+([A-Za-z][A-Za-z0-9_.-]*)(?:\s+(.+?))?\s*$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function terminalCallInput(value: string | undefined): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const candidates = [
    trimmed,
    ...(trimmed.startsWith("'") && trimmed.endsWith("'") ? [trimmed.slice(1, -1)] : []),
  ];
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const unwrapped = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
      if (isRecord(unwrapped)) return unwrapped;
    } catch {
      // Agents choose their own shell quoting. An unrecognized form keeps
      // the MCP identity but leaves the input empty instead of misreporting it.
    }
  }
  return undefined;
}

/**
 * Parses a terminal call to T3's MCP tools. With `wholeCommand`, the call must
 * be the entire command line, so a pipe or `&&` before it does not match; a
 * pipe after it leaves `input` unparsed.
 */
export function parseT3McpTerminalCommand(
  command: string,
  options?: { readonly wholeCommand?: boolean },
): T3McpTerminalCall | undefined {
  const match = (
    options?.wholeCommand === true ? T3_MCP_WHOLE_TERMINAL_CALL : T3_MCP_TERMINAL_CALL
  ).exec(command);
  const tool = match?.[1];
  if (tool === undefined) return undefined;
  const input = terminalCallInput(match?.[2]);
  return { tool, ...(input === undefined ? {} : { input }), hasArgs: match?.[2] !== undefined };
}

/** Parses the tool result `acp-mcp-call` prints as one JSON line. */
export function parseT3McpTerminalOutput(stdout: string): T3McpTerminalOutput | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  return {
    output: parsed.structuredContent ?? parsed.content ?? parsed,
    isError: parsed.isError === true,
  };
}
