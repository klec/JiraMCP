import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToMarkdown } from "./adf.js";
import { formatComments, formatIssue } from "./compact.js";

const doc = (...content: any[]) => ({ type: "doc", version: 1, content });
const p = (...content: any[]) => ({ type: "paragraph", attrs: { localId: "abc" }, content });
const t = (text: string, ...marks: string[]) => ({ type: "text", text, marks: marks.map((type) => ({ type })) });

test("paragraph with marks and localId noise", () => {
  assert.equal(adfToMarkdown(doc(p(t("Merged and deployed.", "strong")))), "**Merged and deployed.**");
});

test("links, mentions, hard breaks", () => {
  const md = adfToMarkdown(
    doc(
      p(
        { type: "mention", attrs: { id: "x", text: "@Yuri Kletsun" } },
        t(" see "),
        { type: "text", text: "PR", marks: [{ type: "link", attrs: { href: "https://bb/pr/1" } }] },
        { type: "hardBreak" },
        t("next line")
      )
    )
  );
  assert.equal(md, "@Yuri Kletsun see [PR](https://bb/pr/1)\nnext line");
});

test("nested lists", () => {
  const li = (...content: any[]) => ({ type: "listItem", content });
  const md = adfToMarkdown(
    doc({
      type: "bulletList",
      content: [li(p(t("one")), { type: "orderedList", content: [li(p(t("a"))), li(p(t("b")))] }), li(p(t("two")))]
    })
  );
  assert.equal(md, "- one\n  1. a\n  2. b\n- two");
});

test("table", () => {
  const cell = (text: string) => ({ type: "tableCell", content: [p(t(text))] });
  const row = (...cells: string[]) => ({ type: "tableRow", content: cells.map(cell) });
  const md = adfToMarkdown(doc({ type: "table", content: [row("A", "B"), row("1", "2|3")] }));
  assert.equal(md, "| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
});

test("short code block is kept", () => {
  const md = adfToMarkdown(doc({ type: "codeBlock", attrs: { language: "json" }, content: [t('{"a":1}')] }));
  assert.equal(md, '```json\n{"a":1}\n```');
});

test("large JSON payload is collapsed unless full", () => {
  const payload = JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ sku: `SKU-${i}`, qty: i })) });
  const tree = doc(p(t(payload)));

  const collapsed = adfToMarkdown(tree, { commentId: "42" });
  assert.ok(collapsed.length < 400);
  assert.match(collapsed, /collapsed \d+ chars; full:true, commentId:42/);

  assert.equal(adfToMarkdown(tree, { full: true }), payload);
});

test("long prose is not collapsed as payload", () => {
  const prose = "word ".repeat(200).trim();
  assert.equal(adfToMarkdown(doc(p(t(prose)))), prose);
});

test("unknown nodes keep their text", () => {
  assert.equal(adfToMarkdown(doc({ type: "futureNode", content: [p(t("kept"))] })), "kept");
});

test("comments are compact: no avatars, header with count", () => {
  const md = formatComments(
    [
      {
        id: "10",
        created: "2026-09-01T10:00:00.000+0000",
        updated: "2026-09-01T10:00:00.000+0000",
        author: { displayName: "Ann", accountId: "x", avatarUrls: { "48x48": "https://a" } },
        body: doc(p(t("x".repeat(50))))
      }
    ],
    { issueKey: "ASGC-98", total: 37, order: "desc", maxLength: 20, full: false }
  );
  assert.match(md, /^ASGC-98 — showing 1 of 37 comments \(newest first\)/);
  assert.match(md, /### 2026-09-01 10:00 — Ann · id 10/);
  assert.match(md, /truncated 30 chars; full:true, commentId:10/);
  assert.doesNotMatch(md, /avatar|accountId/);
});

test("issue: single description and custom field alias", () => {
  const md = formatIssue(
    {
      key: "ASGC-98",
      fields: {
        summary: "Gift cards",
        status: { name: "Done", iconUrl: "https://i" },
        description: doc(p(t("Desc"))),
        customfield_1: doc(p(t("Req"))),
        issuelinks: [{ type: { outward: "blocks" }, outwardIssue: { key: "ASGC-1", fields: { summary: "S", status: { name: "Open" } } } }]
      }
    },
    [{ id: "customfield_1", alias: "requirements" }]
  );
  assert.match(md, /^# ASGC-98: Gift cards/);
  assert.match(md, /## Description\nDesc/);
  assert.match(md, /## requirements \(customfield_1\)\nReq/);
  assert.match(md, /- blocks: ASGC-1 — S \[Open\]/);
  assert.doesNotMatch(md, /iconUrl|https:\/\/i/);
});
