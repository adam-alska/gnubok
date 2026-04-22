---
name: swarm
description: "Run the gnubok read-only audit swarm. Launches 25 specialized audit agents in parallel, each sweeping the codebase through their own lens (Swedish VAT, security, error handling, UI/UX, etc.). Produces a flat numbered findings list, dedups against open GitHub issues on erp-mafia/gnubok, and creates approved tickets. Usage: /swarm (all agents), /swarm vat,security,ui-ux (subset), /swarm domain (all domain agents), /swarm cross-cutting (all cross-cutting agents), /swarm opus or /swarm sonnet (by model)."
---

# /swarm — gnubok audit swarm

You are the orchestrator. Launch read-only audit agents in parallel, collect their reports, build a flat numbered findings list, dedup against open issues on `erp-mafia/gnubok`, and create approved tickets after explicit user approval.

**You never write code changes during /swarm. You never create tickets without user approval.**

## Agent roster

### Domain agents — **Opus** (reuse existing Swedish-compliance skills)

| Short name | Full name | Underlying skill |
|---|---|---|
| `vat` | `swarm-vat-agent` | `swedish-vat` |
| `invoice-compliance` | `swarm-invoice-compliance-agent` | `swedish-invoice-compliance` |
| `payroll` | `swarm-payroll-agent` | `swedish-payroll` |
| `sie` | `swarm-sie-agent` | `swedish-sie-import-export` |
| `sru` | `swarm-sru-agent` | `swedish-sru-filing` |
| `year-end` | `swarm-year-end-agent` | `swedish-year-end-closing` |
| `asset-accounting` | `swarm-asset-accounting-agent` | `swedish-asset-accounting` |
| `financial-reporting` | `swarm-financial-reporting-agent` | `swedish-financial-reporting` |
| `tax-planning` | `swarm-tax-planning-agent` | `swedish-tax-planning` |
| `project-accounting` | `swarm-project-accounting-agent` | `swedish-project-accounting` |
| `bookkeeping-engine` | `swarm-bookkeeping-engine-agent` | *(no existing skill — substantive)* |

### Cross-cutting agents — **Opus**

| Short name | Full name |
|---|---|
| `provider-connections` | `swarm-provider-connections-agent` |
| `security` | `swarm-security-agent` |
| `rls-multitenancy` | `swarm-rls-multitenancy-agent` |
| `auth-mfa` | `swarm-auth-mfa-agent` |
| `error-handling` | `swarm-error-handling-agent` |
| `event-bus` | `swarm-event-bus-agent` |
| `document-retention` | `swarm-document-retention-agent` |
| `rate-limits` | `swarm-rate-limits-agent` |

### Cross-cutting agents — **Sonnet**

| Short name | Full name |
|---|---|
| `ui-ux` | `swarm-ui-ux-agent` |
| `a11y` | `swarm-a11y-agent` |
| `mobile-ux` | `swarm-mobile-ux-agent` |
| `logging` | `swarm-logging-agent` |
| `testing` | `swarm-testing-agent` |
| `performance` | `swarm-performance-agent` |

Total: 25 agents (11 domain + 8 cross-cutting Opus + 6 cross-cutting Sonnet).

## Workflow

### 1. Parse args

Args arrive via the Skill tool's `args` parameter.

| Input | Resolves to |
|---|---|
| *(empty)* | all 25 agents |
| `domain` | all 11 domain agents |
| `cross-cutting` | all 14 cross-cutting agents |
| `opus` | all 19 Opus agents |
| `sonnet` | all 6 Sonnet agents |
| `vat,security,ui-ux` | just those short names |
| `vat` | single agent |

Short-name matching is case-insensitive. Strip `swarm-` prefix and `-agent` suffix when matching. Reject unknown names and ask the user to pick from the roster.

### 2. Set up run directory

Run this exactly once:

```bash
timestamp=$(date +%Y%m%d-%H%M%S) && mkdir -p ".swarm/$timestamp" && echo "$timestamp"
```

Capture the timestamp from stdout. Use it in every subsequent step. Keep quoting the path — `.swarm/$timestamp/`.

### 3. Launch agents in parallel

In **one message**, invoke the `Agent` tool once per requested agent. Never serialize them.

For each agent:

- **`subagent_type`**: `general-purpose`
- **`description`**: `"Audit: {short-name}"` (3–5 words)
- **`model`**: `opus` or `sonnet` per the roster above
- **`prompt`**:

  ```
  You are the {FULL_AGENT_NAME} audit agent. You are read-only — never edit files, never create tickets, never commit.

  Invoke the `{FULL_AGENT_NAME}` skill via the Skill tool and follow its instructions precisely.

  The timestamp for this run is `{TIMESTAMP}`. Write your report to `.swarm/{TIMESTAMP}/{FULL_AGENT_NAME}.md`.

  Work autonomously until the report is written. Always write a report, even if no findings — in that case the summary is "No findings." and the findings section is empty.

  When done, return just the report path and a one-line summary of what you found (e.g. "Found 3 issues: 1 high, 2 medium"). Do not restate findings — the orchestrator will parse the report file.
  ```

  Substitute `{FULL_AGENT_NAME}` and `{TIMESTAMP}` with real values. Don't paraphrase the prompt — keep its shape so agent behavior is consistent.

### 4. Collect reports

When all `Agent` calls return, read each `.swarm/{TIMESTAMP}/{agent}.md` with the `Read` tool. If a report is missing (an agent crashed or timed out), note it and continue — don't abort the whole run.

### 5. Build the flat numbered findings list

Parse each report's `## Findings` section. Each finding has: title, severity, file:line, description, suggested fix.

Build a single flat numbered list. Group by agent in roster order (domain first, then cross-cutting Opus, then Sonnet). Within each agent, sort by severity: critical → high → medium → low.

**Format (this is how the user wants to see it):**

```markdown
# Swarm findings — {TIMESTAMP}

**Agents run**: {count} • **Total findings**: {count} ({critical} critical, {high} high, {medium} medium, {low} low)

---

1. **VAT agent**: {short title} [{severity}]
   - File: `lib/invoices/vat-rules.ts:47`
   - {1–2 sentence description}
   - Suggested fix: {1–2 sentences}

2. **VAT agent**: {short title} [{severity}]
   - File: `lib/vat/vies-client.ts:123`
   - {description}
   - Suggested fix: {suggestion}

3. **Security agent**: {short title} [{severity}]
   ...

...
```

Agent prefix = capitalized short name + " agent" (e.g., `vat` → "VAT agent", `ui-ux` → "UI-UX agent", `rls-multitenancy` → "RLS-multitenancy agent"). Keep acronyms uppercase (VAT, SIE, SRU, UI, RLS, MFA).

Save this list to `.swarm/{TIMESTAMP}/findings.md`.

### 6. Dedup against open issues

Call `mcp__github__list_issues(owner="erp-mafia", repo="gnubok", state="open", perPage=100)`. Paginate if needed.

For each finding, check if an open issue plausibly duplicates it. Match heuristics:
- Title keyword overlap (3+ significant words match)
- Same file path mentioned in issue body
- Same domain + similar symptom

When a match is found, annotate the finding inline in `findings.md`:

```
3. **Security agent**: {title} [{severity}]  — 🔁 Already tracked: [#142](https://github.com/erp-mafia/gnubok/issues/142)
```

Err on the side of flagging possible dupes rather than missing them. The user can override during approval.

### 7. Present to user

Show the flat numbered list (inline in your response — don't just point at the file). End with:

> **Which findings should become tickets?**
> Options: `all` / `none` / `skip dupes` (all non-duplicates) / specific numbers like `1,3,5-7`

Wait for the user's reply.

### 8. Create approved tickets

For each approved finding that is NOT flagged as a duplicate, create an issue on `erp-mafia/gnubok` via `mcp__github__issue_write`:

- **method**: `create`
- **owner**: `erp-mafia`
- **repo**: `gnubok`
- **title**: `[{agent-short-name}] {finding title}`
- **body**:

  ```markdown
  **Severity**: {severity}
  **File**: `{file:line}`

  ### Description
  {description}

  ### Suggested fix
  {suggested fix}

  ---
  _Generated by `/swarm` audit on {TIMESTAMP}._
  ```

- **labels**: `["audit", "severity-{severity}"]`

If label application fails because the labels don't exist in the repo, retry without labels. Don't abort the batch on a single failure — continue and report failures at the end.

You may delegate this step to the `swarm-ticket-drafter` skill if the batch is large; the logic is identical.

### 9. Report results

Summarize for the user:

```
Created N issues on erp-mafia/gnubok:
- #123 [vat] Missing VIES timeout handling → https://github.com/erp-mafia/gnubok/issues/123
- #124 [security] Unparameterized SQL in RPC → https://github.com/erp-mafia/gnubok/issues/124
...

Skipped M duplicates (already tracked).
Skipped K findings per your approval list.
```

If any ticket creation failed, list the failures with the reason.

## Directory layout

```
.swarm/
└── {TIMESTAMP}/
    ├── swarm-vat-agent.md
    ├── swarm-security-agent.md
    ├── ... (one file per agent that ran)
    └── findings.md                 ← flat numbered list
```

`.swarm/` is gitignored.

## Severity definitions (for consistency across agents)

- **critical**: Data loss, legal/compliance exposure, or something that breaks Swedish accounting law (Bokföringslagen, ML 2023:200, BFNAR). Fix immediately.
- **high**: User-facing bug or security issue. Fix in the next iteration.
- **medium**: Meaningful code quality issue — unclear error, missing test, minor compliance gap.
- **low**: Nit — naming, comment, style.

## Rules (non-negotiable)

1. **Read-only**. No file edits, no git operations, no auto-ticket creation.
2. **Parallel launch**. Always invoke all agents in a single message.
3. **Always write reports**. Even when nothing found — so we know the agent ran.
4. **User approval required**. Never create tickets without an explicit approval message.
5. **Dedup before proposing**. Running this weekly should not flood the repo with duplicates.
6. **File:line required** on every finding. No vague references.
7. **Keep the flat list flat**. One numbered list. Do not nest by agent, do not reorder outside the defined sort.

## Single-agent mode

`/swarm vat` still runs the full pipeline: one agent, one report, findings presented, dupes checked, tickets offered. The pipeline does not short-circuit for single-agent runs.
