# Evalation for Claude Code

Reads a repository against the packs you select and reports what it evidences. It changes nothing.

## What a pack is

One subject a run is pointed at:

- a **standard**, published, such as SOC 2, ISO 27001, GDPR or the EU AI Act, where the entry
  identifiers are that edition's own clause numbers so an auditor's citation resolves
- a **concern set**, ours, such as hardening or cyber
- a **composition**, naming other packs and adding questions of its own, authored for one use such
  as a review for insurance underwriting or for an investor reading a codebase against what its
  founder claims of it

Any number may be selected. Where two packs ask the same thing, and most standards overlap because
most of what they require is required because it is the right thing to do, the evidence is gathered
once and reported under each pack's own citation.

## What it reports

Every entry gets one of five statuses, and each one says what it means by itself rather than leaving
it to be interpreted:

- **covered**, resting on evidence that ran or that a machine reads, never on prose alone
- **partial gap**, something standing that does not carry the whole entry, which is where a control
  the repository only claims lands
- **total gap**, evidenced as absent
- **org-level**, a control the deploying organisation owns and no repository could evidence
- **not applicable**, which does not bear here at all

The last two read as an exemption to whoever receives the report, so each owes a justification and is
refused without one.

## Getting started

1. Install the plugin.
2. `/ev-account` to check the seat is live.
3. `/ev-packs` to choose what to assess against.

## How an installation proves it is itself

It signs, and never presents a secret. It holds a private key, we hold the public half, and every
ask carries a signature over the call, the time and the body. So what we store verifies an
installation and cannot impersonate one, and a captured proof stops working within five minutes.

The key lives in the operating system's own store and never in a file. The settings name it and
something else finds it, which is what makes the settings safe to read out, paste into a ticket or
keep in a repository.

Settings are read from `EVALATION_LOCAL` if it is set, then `~/.evalation/evalation.local`, then
`evalation.local` beside you. They name the installation and where its key is kept, and nothing
else is required. Where our server is, is ours to know: it is built into the plugin, so moving hosts
never breaks an installation and no customer configuration carries our hosting arrangements.

## What leaves your machine

Your code does not. The findings do not. A run reads your tree locally and writes its findings
locally, and what crosses the wire is the request for the methodology and the record that a run
happened. The methodology is served against an entitled seat rather than shipped, so nothing of it
sits on your disk and it stops working when the entitlement does.

## What this plugin holds

Entitlement and transport glue, and nothing else. No methodology, no packs, no secrets on disk.
