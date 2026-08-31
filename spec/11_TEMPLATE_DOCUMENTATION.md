# Template Documentation & Onboarding

## Purpose

Replace client-coupled documentation with template documentation and a white-labeling guide.

## Current State

- `README.md` and `docs/ARCHITECTURE.md` in both source repositories describe the client product, client routes, seeded credentials and client deep links.
- `LICENSE.md` holds heritage copyright.
- No onboarding guide for licensees exists.

## Required Changes

- Rewrite READMEs and architecture docs for the template.
- Remove client references, credentials and deep links.
- Replace license metadata.
- Document the white-labeling process: branding (02), campus (03), categories (08), telemetry (07), delivery form (06), bootstrap (04).

## Rules

- Documentation must stay synchronized with implementation (docs-first).
- No client tokens in any document.

## Acceptance Criteria

- A new licensee can rebrand and configure the template following the guide.
- Grep over documentation returns no client tokens.

## Decisiones de implementación

- La guía de white-labeling es parte del README de Syntro y referencia cada SPEC de este bloque.
