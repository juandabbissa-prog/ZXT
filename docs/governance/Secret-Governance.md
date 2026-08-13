# Secret Governance

## Repository boundary

- Passwords, tokens, API keys, cookies, sessions, private keys, and real connection credentials must not enter Git.
- `.env`, `.env.local`, artifacts, logs, and generated output remain ignored.
- `.env.example` contains auditable development placeholders only; it is not a credential store.

## CI boundary

- Workflow permissions default to `contents: read`.
- Secrets are injected only into an independently authorized job and never printed or archived.
- Static scanning is local, controlled-path, read-only, and reports only path, rule ID, line number, and `REDACTED`.

## Exposure response

1. Stop using the suspected credential.
2. Revoke and rotate it through the owning provider.
3. Remove it from current files and assess Git history without repeating its value.
4. Record the affected scope, owner, time, and remediation evidence.
5. Resume only after independent verification.

`SECRET_STATIC_SCAN_PASS` means the configured high-confidence patterns were not found in controlled paths. It does not mean that no secret exists anywhere.
