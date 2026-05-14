import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JiraClientConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
  defaultProject?: string;
};

class JiraReadOnlyClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  readonly defaultProject?: string;

  constructor(private readonly config: JiraClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
    this.defaultProject = config.defaultProject;
  }

  async getIssue(issueKey: string): Promise<JsonValue> {
    return this.get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      fields: "summary,status,issuetype,priority,assignee,reporter,description,project,labels,created,updated",
      expand: "renderedFields"
    });
  }

  async searchIssues(params: {
    jql: string;
    maxResults?: number;
    startAt?: number;
  }): Promise<JsonValue> {
    return this.get("/rest/api/3/search/jql", {
      jql: params.jql,
      maxResults: String(params.maxResults ?? 20),
      startAt: String(params.startAt ?? 0),
      fields: "summary,status,issuetype,priority,assignee,project,created,updated"
    });
  }

  async getProjectIssues(projectKey: string, maxResults?: number): Promise<JsonValue> {
    return this.searchIssues({
      jql: `project = ${projectKey} ORDER BY updated DESC`,
      maxResults
    });
  }

  async getComments(issueKey: string): Promise<JsonValue> {
    return this.get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
      orderBy: "created"
    });
  }

  private async get(path: string, query?: Record<string, string>): Promise<JsonValue> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${this.authHeader}`
      }
    });

    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? ((await response.json()) as JsonValue)
      : ((await response.text()) as JsonValue);

    if (!response.ok) {
      throw new Error(`Jira request failed (${response.status} ${response.statusText}): ${JSON.stringify(responseBody)}`);
    }

    return responseBody;
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function toTextResult(payload: JsonValue) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

async function main() {
  const client = new JiraReadOnlyClient({
    baseUrl: getRequiredEnv("JIRA_BASE_URL"),
    email: getRequiredEnv("JIRA_EMAIL"),
    apiToken: getRequiredEnv("JIRA_API_TOKEN"),
    defaultProject: process.env.JIRA_DEFAULT_PROJECT?.trim() || undefined
  });

  const server = new McpServer({
    name: "jira-readonly",
    version: "0.1.0"
  });

  server.registerTool(
    "jira_get_issue",
    {
      title: "Get Jira issue",
      description: "Fetch a Jira issue by key in read-only mode.",
      inputSchema: {
        issueKey: z.string().min(2)
      }
    },
    async ({ issueKey }) => toTextResult(await client.getIssue(issueKey))
  );

  server.registerTool(
    "jira_search_issues",
    {
      title: "Search Jira issues",
      description: "Run a JQL search against Jira in read-only mode.",
      inputSchema: {
        jql: z.string().min(1),
        maxResults: z.number().int().min(1).max(100).optional(),
        startAt: z.number().int().min(0).optional()
      }
    },
    async ({ jql, maxResults, startAt }) => toTextResult(await client.searchIssues({ jql, maxResults, startAt }))
  );

  server.registerTool(
    "jira_get_project_issues",
    {
      title: "Get Jira project issues",
      description: "List issues from a Jira project ordered by last update.",
      inputSchema: {
        projectKey: z.string().min(1).optional(),
        maxResults: z.number().int().min(1).max(100).optional()
      }
    },
    async ({ projectKey, maxResults }) => {
      const resolvedProject = projectKey ?? client.defaultProject;

      if (!resolvedProject) {
        throw new Error("projectKey is required when JIRA_DEFAULT_PROJECT is not set");
      }

      return toTextResult(await client.getProjectIssues(resolvedProject, maxResults));
    }
  );

  server.registerTool(
    "jira_get_comments",
    {
      title: "Get Jira comments",
      description: "Fetch comments for a Jira issue in read-only mode.",
      inputSchema: {
        issueKey: z.string().min(2)
      }
    },
    async ({ issueKey }) => toTextResult(await client.getComments(issueKey))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});