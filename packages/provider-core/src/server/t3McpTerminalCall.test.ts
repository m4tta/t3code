import { describe, expect, it } from "@effect/vitest";
import { parseT3McpTerminalCommand, parseT3McpTerminalOutput } from "./t3McpTerminalCall.ts";

describe("parseT3McpTerminalCommand", () => {
  it("reads the tool and arguments of t3-mcp and acp-mcp-call invocations", () => {
    expect(parseT3McpTerminalCommand(`t3-mcp delegate_task '{"task":"a | b; c"}'`)).toEqual({
      tool: "delegate_task",
      input: { task: "a | b; c" },
      hasArgs: true,
    });
    expect(
      parseT3McpTerminalCommand(
        `ELECTRON_RUN_AS_NODE=1 "$T3_ACP_MCP_NODE" "$T3_ACP_MCP_ENTRYPOINT" acp-mcp-call task_status '{}'`,
      ),
    ).toEqual({ tool: "task_status", input: {}, hasArgs: true });
    expect(parseT3McpTerminalCommand("/t3/userdata/bin/t3-mcp orchestrator_capabilities")).toEqual({
      tool: "orchestrator_capabilities",
      hasArgs: false,
    });
  });

  it("keeps the identity but not the input when the arguments are not one JSON object", () => {
    expect(parseT3McpTerminalCommand(`t3-mcp task_status '{"taskId":1}' | jq .`)).toEqual({
      tool: "task_status",
      hasArgs: true,
    });
  });

  it("matches only a whole-command invocation when asked to", () => {
    const options = { wholeCommand: true };
    expect(
      parseT3McpTerminalCommand(`  /t3/bin/t3-mcp task_status '{"taskId":"t"}' `, options),
    ).toEqual({ tool: "task_status", input: { taskId: "t" }, hasArgs: true });
    expect(
      parseT3McpTerminalCommand(`cd /tmp && t3-mcp task_status '{"taskId":"t"}'`, options),
    ).toBeUndefined();
    expect(parseT3McpTerminalCommand(`echo t3-mcp task_status '{}'`, options)).toBeUndefined();
    expect(parseT3McpTerminalCommand("git status", options)).toBeUndefined();
  });

  it("leaves schema lookups as plain commands", () => {
    expect(parseT3McpTerminalCommand("t3-mcp --schema delegate_task")).toBeUndefined();
    expect(parseT3McpTerminalCommand("t3-mcp --schema", { wholeCommand: true })).toBeUndefined();
  });
});

describe("parseT3McpTerminalOutput", () => {
  it("prefers structured content and carries the error flag", () => {
    expect(
      parseT3McpTerminalOutput(
        `${JSON.stringify({ content: [{ type: "text", text: "x" }], structuredContent: { a: 1 } })}\n`,
      ),
    ).toEqual({ output: { a: 1 }, isError: false });
    expect(
      parseT3McpTerminalOutput(
        JSON.stringify({ content: [{ type: "text", text: "nope" }], isError: true }),
      ),
    ).toEqual({ output: [{ type: "text", text: "nope" }], isError: true });
  });

  it("rejects output that is not a JSON object", () => {
    expect(parseT3McpTerminalOutput("not json")).toBeUndefined();
    expect(parseT3McpTerminalOutput("[1]")).toBeUndefined();
  });
});
