---
name: supportmail-to-ticket
description: "Triage Gnubok customer support emails and turn them into GitHub issues in the erp-mafia/gnubok repo. Use this skill whenever the user invokes /supportmail-to-ticket (with or without a number argument), or asks to 'triage support mail', 'turn support emails into tickets', 'process gnubok support', 'check the support inbox and file issues', or any similar phrasing involving the Gnubok support mailbox. Also trigger this skill if the user mentions [gnubok support] emails and wants them converted into actionable work — even if they don't use the exact slash command."
---

# supportmail-to-ticket

Triage `[gnubok support]` emails from Gmail, cross-reference them against the local erp-base codebase, and draft GitHub issues for the `erp-mafia/gnubok` repo — with inline user approval before anything gets created.

## Invocation

Primary form:

```
/supportmail-to-ticket [N]
```

- `N` = number of most recent `[gnubok support]` threads to triage. Optional. Default: `3`.
- Examples: `/supportmail-to-ticket`, `/supportmail-to-ticket 10`, `/supportmail-to-ticket 1`

If the user phrases the request in natural language ("triage the last 5 support mails", "check the inbox"), extract the number if present, otherwise use `3`.

## Required tools

Before running anything, verify these are available. If any is missing, stop and tell the user which one to configure — do not attempt workarounds.

- **Gmail MCP** — `search_threads`, `get_thread`
- **GitHub CLI (`gh`)** — used via `bash_tool` for all GitHub operations. Verify with `gh --version` and `gh auth status`. If either fails, stop and say: *"I need the GitHub CLI (gh) installed and authenticated. Install from https://cli.github.com/ and run `gh auth login`, then retry. This skill uses gh as a hard requirement — there is no MCP fallback."* Do not proceed without it.
- **Filesystem MCP** pointing at `C:\Users\emilm\projects\erp-base` — the skill is explicitly designed around local code search. If the filesystem tool is not available or the path doesn't resolve, stop and say: *"I need the Filesystem MCP configured with access to `C:\Users\emilm\projects\erp-base`. Please set it up in Claude Desktop's MCP config and retry."* Do not fall back to remote code search — the user has asked for local-only.

## Workflow

Follow these five phases in order. Do not skip phase 4 (approval).

### Phase 1 — Fetch emails

Call Gmail `search_threads` with:

- `query`: `subject:"[gnubok support]"`
- `pageSize`: the requested N (default 3)

For each returned thread, call `get_thread` with `messageFormat: FULL_CONTENT` to retrieve the full body. Extract per thread:

- `threadId`
- `subject`
- Sender of the first message (the original customer — note that `invoiceservice@arcim.io` is a relay; the actual customer address is in the body as `Från: <email>` for Swedish or directly visible in the body text)
- Date of the first message
- Full body text of the first message (this is the customer's actual complaint)
- Any reply messages (if the team has already responded, mention that but still propose a ticket unless the reply clearly resolves it)

**Customer email extraction**: The Gnubok support relay wraps the original mail. The body typically starts with `Från: <customer@domain>` (Swedish) — parse this line for the real customer email. Fall back to the thread's first-message sender if parsing fails.

### Phase 2 — Codebase analysis (local only)

For each email, analyze the complaint and search the local codebase at `C:\Users\emilm\projects\erp-base`.

**Step 2a — Extract search terms from the email.** From the customer's message, pull:

- Domain nouns (e.g., "SIE", "import", "bank", "fiscal year", "bokslut", "moms", "verifikat")
- Quoted error strings or UI labels
- Feature names the customer references

The emails are often in Swedish. Translate/expand Swedish terms to likely code identifiers (examples: `importera` → `import`, `räkenskapsår` → `fiscalYear`/`fiscal_year`, `bank` → `bank`, `SIE-fil` → `sie`/`SIE`, `verifikat` → `verification`/`voucher`, `moms` → `vat`/`tax`).

**Step 2b — Search.** Use the filesystem tool to run targeted searches. Prefer grep-style or directory reads over reading whole files. For each search term:

- Search filenames and paths first (fast, high signal)
- Then search file contents, case-insensitive
- Focus on `.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rs`, `.java`, `.kt` — whatever extensions actually exist in the repo (check with a directory listing first if unsure)
- Skip `node_modules`, `dist`, `build`, `.git`, `.next`, `target`

Collect up to ~5 most relevant file paths per email, with a line number or function name if you can identify one. Don't dump search results wholesale — synthesize.

**Step 2c — Severity heuristic.**

- **high**: core function broken (import fails completely, data loss risk, cannot log in, money/accounting math wrong, multiple users reporting same issue in this batch)
- **medium**: feature partially broken, workaround exists, affects one customer, UX friction in a common flow
- **low**: cosmetic, feature request, documentation gap, edge case
- **feature**: customer is asking for something that doesn't exist yet (use label `feature`, priority is less relevant)

### Phase 3 — Draft tickets

For each email, produce one draft issue. Output format per ticket (inline in chat):

```
━━━ Ticket 1 of N ━━━
Title: <concise imperative title, ≤ 80 chars>
Labels: <from: bug, feature, report, improvement, error + priority label>
Priority: <high | medium | low>

Description:
<2–4 sentence summary of the customer's problem in your own words — do not quote the customer verbatim for more than a short phrase. State the observed behavior and expected behavior if you can infer it.>

Relevant code:
- path/to/file.ts:line — short note on why this is relevant
- path/to/other.ts — short note
(If nothing found locally, say "No direct match in codebase — investigation needed" and suggest where to start looking.)

Next steps:
- Concrete first thing a developer should do
- Second concrete step
- (2–4 steps total, specific not vague)

Customer: <email address>
Original thread: https://mail.google.com/mail/u/1/#inbox/<threadId>
Gmail thread ID: <threadId>
```

**Priority label convention**: use `priority:high`, `priority:medium`, `priority:low`. If the repo already has `P0`/`P1`/`P2` labels (check in phase 4), prefer those instead.

**Duplicate check (before presenting)**: For each draft, run:

```bash
gh issue list --repo erp-mafia/gnubok --state open --limit 100 --json number,title,body,url
```

Parse the JSON output and scan titles + bodies for:

- The Gmail thread ID (exact match → definitely a duplicate)
- Overlapping key nouns from the title (likely duplicate → flag, don't auto-skip)

If a duplicate is found, replace that ticket block with:

```
━━━ Ticket N of M ━━━ [DUPLICATE]
Matches existing issue: #<number> — <existing title>
URL: <issue url>
This email: https://mail.google.com/mail/u/1/#inbox/<threadId>
Suggested action: add a comment to the existing issue linking this new customer report.
```

Run the `gh issue list` call **once** at the start of phase 3 and reuse its results across all drafts — don't call it per ticket.

### Phase 4 — Approval (inline, required)

After presenting all drafts, ask:

> Reply with your decisions per ticket. Examples:
> - `1 approve, 2 approve, 3 reject`
> - `all approve`
> - `1 approve but change title to "Fix bank import for Swedbank"`
> - `2 edit: change priority to high and add label "error"`
> - `3 comment on existing #42 instead of new issue`
>
> I'll wait for your reply before creating anything on GitHub.

Wait for the user's response. **Do not create issues until they reply.** If the user's reply is ambiguous, ask specifically rather than guessing.

Parse their response per ticket. Apply edits to the draft. If they reject a ticket, drop it silently. If they ask to comment on an existing issue instead of creating new, add that to the action list.

### Phase 5 — Create on GitHub

For each approved ticket, use the `gh` CLI via `bash_tool`.

**Creating a new issue.** Write the body to a temp file first (avoids shell-escaping pain with multi-line content and special characters), then pass it via `--body-file`:

```bash
# Write the body to a temp file
cat > /tmp/issue-body-<N>.md <<'EOF'
<description paragraph>

## Relevant code
- path/to/file.ts:line — note
- path/to/other.ts — note

## Next steps
- Step 1
- Step 2
- Step 3

---
**Customer:** <email>
**Original support thread:** https://mail.google.com/mail/u/1/#inbox/<threadId>
**Gmail thread ID:** `<threadId>`
EOF

# Create the issue
gh issue create \
  --repo erp-mafia/gnubok \
  --title "<approved title>" \
  --body-file /tmp/issue-body-<N>.md \
  --label "<label1>" --label "<label2>"
```

The command prints the new issue's URL on success — capture it for the summary. Use `--json number,url` + `gh issue create ... | cat` if you need to parse the result programmatically; otherwise the stdout URL is fine.

**Commenting on an existing issue** (for duplicates where the user chose "comment on existing"):

```bash
gh issue comment <issue-number> \
  --repo erp-mafia/gnubok \
  --body "Another customer report of this issue. Customer: \`<email>\`. Thread: https://mail.google.com/mail/u/1/#inbox/<threadId>."
```

**Label notes**:

- Available labels in this skill: `bug`, `feature`, `report`, `improvement`, `error`, plus priority (`priority:high`, `priority:medium`, `priority:low`).
- If `gh issue create` fails with an error mentioning an unknown label (exit code non-zero, stderr contains `"could not add label"` or `"not found"`), retry the command without that `--label` flag and tell the user which labels are missing so they can create them manually — do **not** attempt to create labels automatically.
- You can check available labels once at the start of phase 5 with: `gh label list --repo erp-mafia/gnubok --limit 100 --json name` — useful if multiple label errors happen in a row.

**Project board**: Issues are created in the `erp-mafia/gnubok` repo. The Gnubok project board (`erp-mafia/projects/...`) aggregates issues but adding to a project via `gh` requires `gh project item-add` with the project number and GraphQL scopes that may not be in the current auth token. After creating issues, output the project URL once and remind the user they may want to drag the new issues onto the board. Example wording: *"Issues created. If you want them on the Gnubok project board, you'll need to add them manually at https://github.com/orgs/erp-mafia/projects — or run `gh project item-add` if you have project scopes on your token."*

### Phase 6 — Summary

End with a compact summary:

```
Created 2 issues:
- #47 Fix SIE import failure for first fiscal year — https://github.com/erp-mafia/gnubok/issues/47
- #48 Investigate bank import for banks without BankID — https://github.com/erp-mafia/gnubok/issues/48

Commented on 1 existing:
- #42 — added new customer report

Skipped: 0
```

## Error handling

- **No emails found**: say so, don't invent any.
- **Gmail thread fetch fails for one email**: skip that one, report which, continue with the rest.
- **Filesystem MCP not configured / path not found**: stop entirely, instruct the user to set it up. Do not proceed with remote-only search.
- **`gh` not installed or not authenticated**: stop entirely at the pre-check. Do not proceed.
- **`gh issue list` fails during duplicate check**: proceed without duplicate detection and warn the user in the summary.
- **`gh issue create` fails for one ticket**: report which ticket failed, include the `gh` stderr, continue with the remaining approved ones.
- **`gh` rate-limited** (HTTP 403 with "rate limit"): stop, tell the user to wait or check `gh api rate_limit`. Don't retry in a loop.

## Style notes for generated tickets

- Titles are imperative ("Fix X", "Investigate Y", "Add Z"), not declarative ("X is broken").
- Titles ≤ 80 characters. No emoji. No brackets.
- Descriptions are ≤ 4 sentences. Describe what the customer sees and what should happen instead.
- Next steps are concrete — "Check `importSie()` for silent catch blocks on line 142", not "Investigate the import code".
- Never paste the customer's email body verbatim into the issue. Paraphrase and preserve the Gmail link as the receipt.
- If the email is in Swedish, the ticket is in English. Keep domain terms that match the code (`SIE`, `verifikat` if the code uses that spelling, etc.).
