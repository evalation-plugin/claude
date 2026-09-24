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

Every entry gets one of five statuses:

- **Covered**, resting on code or configuration that runs, never on documentation alone
- **Partial**, where some of what the entry asks for is there, including a control the repository
  only describes
- **Gap**, where the repository shows it is missing
- **Org-level**, a control the organisation owns, which no repository records
- **Not applicable**, where the entry does not apply to this repository

The last two read as an exemption to whoever receives the report, so each owes a justification and is
refused without one.

## Getting started

1. Install the plugin.
2. `/ev-activate` to sign in. Nothing else works until this runs, because everything else proves
   itself with a key this installation does not hold until then.
3. `/ev-account` to check the seat is live.
4. `/ev-packs` to choose what to assess against.
5. `/ev-rotate` whenever you want to replace the key, which needs no reason and causes no downtime.

## Signing in, once

Activation is the one call that cannot be signed, because it is the call that gets you a key. So a
person signs in with their own provider instead, in their own browser, and what comes back is enough
to create an installation against their account. Every call after that is signed and nothing is
presented again.

Both keys are generated on your machine before the sign-in starts, and only the public halves are
sent. Nothing bearing is minted anywhere in the flow, so there is no token in the middle to steal.

The authorisation code comes back to a port on your own machine. There is no page of ours anywhere
in the sign-in, which means nothing of ours to be phished by and nothing that needs inbound access to
the machine you are working on.

A second machine is a second installation and takes its own activation. One account can hold as many
installations as it needs, and billing counts pack credits used.

## What is encrypted, and what is not

What we serve is encrypted to your installation, so nothing between us and you can read it, including
a proxy on your network or anything else inspecting traffic on the way. The pack's name, kind
and entry count stay readable, because those are what you choose between and none of them is the
thing being protected. The entries are the work, and those are sealed.

Your installation holds two keys with one job each. One proves an ask came from you. The other opens
what comes back. Neither leaves the operating system's own store, and we hold only the public halves,
so our own records being read gives an attacker nothing they could use.

If you lose the second key, `/ev-rotate` replaces it. The first key signs that request, so it still
works when the key that reads what comes back is gone.

## How an installation proves it is itself

It signs, and never presents a secret. It holds a private key, we hold the public half, and every
ask carries a signature over the call, the time and the body. So what we store verifies an
installation and cannot impersonate one, and a captured proof stops working within five minutes.

The key lives in the operating system's own store: the Keychain on macOS, Credential Manager on
Windows, the desktop keyring on Linux. Where a machine has none, and a server nobody is sitting at
often has none, it goes in a file only its owner can read. The plugin refuses to read a key file it
cannot confirm is private. The settings name where it is and never hold it, which is what makes them
safe to read out, paste into a ticket or keep in a repository.

Settings are read from `EVALATION_LOCAL` if it is set, then `~/.evalation/evalation.local`, then
`evalation.local` beside you. They name the installation and where its two keys are kept, and
nothing else is required. Where our server is, is ours to know: it is built into the plugin, so moving hosts
never breaks an installation and no customer configuration carries our hosting arrangements.

## What leaves your machine

Your code does not. The findings do not. A run reads your tree locally and writes its findings
locally, and what crosses the wire is the request for the methodology and the record that a run
happened. The packs are served to your installation for each run.

## What this plugin holds

Entitlement and transport glue, and nothing else. No methodology, no packs, no secrets on disk.
