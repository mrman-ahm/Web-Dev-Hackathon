# Setup

## Governance-only checkout

Prerequisites: Git, Python 3.11+, and access to this private GitHub repository. In a
cloned checkout, these governance verification commands are supported:

```sh
python3 -m venv /tmp/ubmp-governance-venv
/tmp/ubmp-governance-venv/bin/python -m pip install -r scripts/requirements-governance.txt
/tmp/ubmp-governance-venv/bin/python scripts/check_governance.py
git diff --check
```

The governance tool dependency is pinned separately from future product dependencies.
An existing environment with that exact PyYAML version can also run the checker.
No Node package, app startup, database, or provider setup exists yet. Foundation B/D
must select runtime/package manager versions, commit one lockfile, supply scripts,
and verify fresh installation/startup before publishing those commands.

## Local configuration and source document

`.env.example` has comments only because no runtime variables are consumed yet.
When implementation introduces variables, document exact names, purpose, required vs
optional, server/public scope and safe blank placeholders in the same PR. Put local
values in ignored `.env.local`; never put privileged values in public-prefixed variables.
Use separate test/development/production resources and a secret manager for deployed
values. Avoid real customer data. Configure real publicly reachable HTTPS webhooks
only when provider features exist, and document sandbox limits then.

The original DOCX remains untracked and unchanged in the original developer checkout.
Foundation B adds a byte-identical versioned copy at `docs/requirements/problem-statement.docx`
with its SHA-256 in the source register. Both laptops can read the same authority; no
ChatGPT attachment path or external memory service is required.
