// Whitelists the useful parts of Jira REST payloads and renders them as Markdown.

import { adfToMarkdown, isAdf, type AdfOptions } from "./adf.js";

export type CustomFieldMapping = {
  id: string;
  alias: string;
};

export type CommentView = {
  issueKey: string;
  total: number;
  order: "asc" | "desc";
  since?: string;
  maxLength: number;
  full: boolean;
};

const DATE_LENGTH = 16; // "2026-09-18T11:12"

function userName(user: any): string {
  if (!user) {
    return "—";
  }

  return user.emailAddress ? `${user.displayName} <${user.emailAddress}>` : user.displayName ?? "—";
}

function shortDate(value: unknown): string {
  return typeof value === "string" ? value.slice(0, DATE_LENGTH).replace("T", " ") : "—";
}

// Renders an arbitrary custom field value without dragging Jira metadata along.
function fieldValue(value: any, options: AdfOptions = {}): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (isAdf(value)) {
    return adfToMarkdown(value, options);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => fieldValue(entry, options)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const label = value.displayName ?? value.value ?? value.name ?? value.key;
    return label !== undefined ? String(label) : JSON.stringify(value);
  }

  return String(value);
}

export function formatIssue(issue: any, customFields: CustomFieldMapping[]): string {
  const fields = issue?.fields ?? {};
  const lines: string[] = [`# ${issue.key}: ${fields.summary ?? ""}`, ""];

  const meta: [string, string][] = [
    ["Status", fields.status?.name],
    ["Type", fields.issuetype?.name],
    ["Priority", fields.priority?.name],
    ["Assignee", userName(fields.assignee)],
    ["Reporter", userName(fields.reporter)],
    ["Project", fields.project?.key],
    ["Labels", (fields.labels ?? []).join(", ")],
    ["Created", shortDate(fields.created)],
    ["Updated", shortDate(fields.updated)]
  ];

  for (const [label, value] of meta) {
    if (value) {
      lines.push(`- **${label}:** ${value}`);
    }
  }

  const links = (fields.issuelinks ?? []).map((link: any) => {
    const [direction, target] = link.outwardIssue
      ? [link.type?.outward, link.outwardIssue]
      : [link.type?.inward, link.inwardIssue];
    return `- ${direction ?? link.type?.name}: ${target?.key} — ${target?.fields?.summary ?? ""} [${target?.fields?.status?.name ?? ""}]`;
  });

  if (links.length) {
    lines.push("", "## Links", ...links);
  }

  const description = fieldValue(fields.description, { full: true });
  lines.push("", "## Description", description || "_(empty)_");

  for (const { id, alias } of customFields) {
    const value = fieldValue(fields[id], { full: true });
    if (value) {
      lines.push("", `## ${alias}${alias !== id ? ` (${id})` : ""}`, value);
    }
  }

  return lines.join("\n");
}

function truncate(text: string, maxLength: number, commentId: string): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n… [truncated ${text.length - maxLength} chars; full:true, commentId:${commentId}]`;
}

export function formatComment(comment: any, view: Pick<CommentView, "maxLength" | "full">): string {
  const id = String(comment.id);
  const body = adfToMarkdown(comment.body, { full: view.full, commentId: id });
  const edited = comment.updated && comment.updated !== comment.created ? ` (edited ${shortDate(comment.updated)})` : "";
  const header = `### ${shortDate(comment.created)} — ${userName(comment.author)}${edited} · id ${id}`;

  return `${header}\n${view.full ? body : truncate(body, view.maxLength, id)}`;
}

export function formatComments(comments: any[], view: CommentView): string {
  const orderLabel = view.order === "desc" ? "newest first" : "oldest first";
  const sinceLabel = view.since ? `, since ${view.since}` : "";
  const header = `${view.issueKey} — showing ${comments.length} of ${view.total} comments (${orderLabel}${sinceLabel})`;

  if (!comments.length) {
    return header;
  }

  return [header, ...comments.map((comment) => formatComment(comment, view))].join("\n\n");
}

export function formatSearch(result: any): string {
  const issues: any[] = result?.issues ?? [];
  const total = result?.total !== undefined ? ` of ${result.total}` : "";
  const rows = issues.map((issue) => {
    const f = issue.fields ?? {};
    const cells = [
      issue.key,
      f.summary ?? "",
      f.status?.name ?? "",
      f.issuetype?.name ?? "",
      f.priority?.name ?? "",
      f.assignee?.displayName ?? "—",
      shortDate(f.updated)
    ].map((cell) => String(cell).replace(/\|/g, "\\|"));
    return `| ${cells.join(" | ")} |`;
  });

  const lines = [`${issues.length}${total} issues`];

  if (rows.length) {
    lines.push("", "| Key | Summary | Status | Type | Priority | Assignee | Updated |", "|---|---|---|---|---|---|---|", ...rows);
  }

  if (result?.nextPageToken) {
    lines.push("", `nextPageToken: ${result.nextPageToken}`);
  }

  return lines.join("\n");
}
