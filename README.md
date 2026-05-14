# Jira Read-Only MCP Server

TypeScript MCP server for Jira Cloud with read-only access.

## Capabilities

- Read a Jira issue by key
- Search issues by JQL
- List project issues
- Read comments for an issue
- Read transitions and issue metadata exposed by Jira REST GET endpoints

This server does not expose any methods for creating or updating issues, comments, transitions, or any other Jira entities.

## Environment

Copy `.env.example` to `.env` and fill in your credentials.

Required variables:

- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

Optional variables:

- `JIRA_DEFAULT_PROJECT`

## Install

```bash
npm install
```

## Run

```bash
npm run build
npm start
```

The server reads variables from `.env` automatically at startup.

For local development:

```bash
npm run dev
```

## MCP Tools

- `jira_get_issue`
- `jira_search_issues`
- `jira_get_project_issues`
- `jira_get_comments`

## Security model

- The server uses Jira REST API GET endpoints only.
- The HTTP client rejects non-GET methods at runtime.
- No MCP tools for mutations are registered.