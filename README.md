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
- `JIRA_CUSTOM_FIELDS`

### Custom fields

Custom field ids differ between Jira projects, so they are configured per MCP
connection rather than hardcoded. `JIRA_CUSTOM_FIELDS` takes a comma-separated
list of `customfield_<id>:<alias>` pairs. The alias is optional; without it the
raw field id is used.

```
JIRA_CUSTOM_FIELDS=customfield_10145:requirements,customfield_10170:discoveryQuestions
```

Listed fields are requested by `jira_get_issue` and exposed under their alias in
both `fields` and `renderedFields` (the latter holds the HTML rendering, which is
usually the readable one). The raw ids stay in the response as well.

To discover the ids available on a Jira instance, call `/rest/api/3/field` and
match on the field name.

If the variable is unset, no custom fields are requested and only the base issue
fields are returned.

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
- `confluence_get_page`
- `confluence_search_pages`
- `confluence_get_space_pages`

## Security model

- The server uses Jira REST API GET endpoints only.
- The HTTP client rejects non-GET methods at runtime.
- No MCP tools for mutations are registered.