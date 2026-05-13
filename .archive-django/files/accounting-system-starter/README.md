# Multi-Entity Corporate Accounting System

In-house corporate accounting system for a group of 16-50 multi-tier legal entities.

**Status:** Phase 0 complete (decisions locked). Phase 1 (discovery & requirements) ready to begin.

## Read first

- `CLAUDE.md` — context and invariants for AI coding sessions. Read this before touching anything.
- `docs/phase-0-decisions.md` — the locked decisions that shape everything else
- `docs/pilot-selection.md` — the locked pilot wave decisions
- `docs/design.md` — locked UI design language (Modern SaaS with left sidebar)
- `docs/i18n.md` — English + Spanish (Uruguay) support plan
- `docs/localization.md` — per-jurisdiction localization module architecture
- `docs/data-model.md` — schema design
- `docs/accounting-rules.md` — accounting rules this system enforces
- `docs/regulatory.md` — accounting framework references (ASC 830, etc.)
- `docs/roadmap.md` — phased build plan
- `docs/first-sessions.md` — starter prompts for Claude Code

## Key decisions

| Topic | Decision |
|---|---|
| Entity count | 16-50 entities, multi-tier ownership |
| Currency | Multi-currency, multiple functional currencies |
| Basis | Mixed modified cash + selective accrual |
| Fiscal year | Mixed year-ends |
| CoA | Per-entity with consolidation mapping + dimensions |
| Crypto | Out of scope |
| Users (v1) | 6-15 power users, SSO required |
| Time entry | Phase 2 |
| Bank feeds | Plaid + manual mix |
| Cutover | Phased pilot, calendar year-end, 3-month parallel |
| Design language | Modern SaaS with left sidebar |
| Languages | English + Uruguayan Spanish (es-UY); i18n framework v1, UY UI strings v2 |
| Localization | Core engine + per-jurisdiction modules; v1 = US module; migrating off Business Central |
| Total program | 12-24 months for v1; localization modules ongoing |

See `docs/phase-0-decisions.md` for full context and rationale.

## Quickstart (once code exists)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in values
docker compose up -d  # local Postgres
./manage.py migrate
./manage.py createsuperuser
./manage.py runserver
```

## Working with Claude Code

From the project root:

```bash
claude
```

Claude Code reads `CLAUDE.md` automatically. Reference specific docs in prompts:

```
Read docs/data-model.md and propose the initial Django models for entities and accounts.
```

See `docs/first-sessions.md` for a sequence of starter prompts.

## Phases

0. ✅ **Phase 0 — Decisions** (complete)
1. **Phase 1 — Discovery & requirements** (current-state workflows, integrations, sample reports)
2. **Phase 2 — Architecture** (ADRs, threat model, deployment topology)
3. **Phase 3 — Data model** (schema + DB-level invariants)
4. **Phase 4 — MVP build** (v0.1 through v0.7, ~4-7 months)
5. **Phase 5 — Parallel run with pilot entities** (~3 months)
6. **Phase 6 — Cutover and stabilization** (Dec 31, 2026 target for pilot; waves through 2027)
7. **Post v1 — Time entry module** (Phase 2 of overall program)

See `docs/roadmap.md` for detail.
