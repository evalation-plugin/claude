---
description: Replace the key this machine uses to open what Evalation sends it, for when this machine's copy may have been exposed. Takes a moment and uses no pack credits.
allowed-tools: Bash(evalation-rotate:*), Bash(evalation-say:*), Bash(evalation-status:*)
---

# Replace this machine's key

Open by showing `evalation-say ev-rotate.intro` exactly as printed, before anything else.

What Evalation sends is locked to this machine, and this machine holds a key that opens it. This
replaces that key, for use when this machine's copy may have been exposed, or on whatever schedule
the customer's own policy sets. It takes one command, needs no reason given, costs nothing and causes
no downtime.

**Every line you say comes from the plugin or the script.** Where this file names a line as
`evalation-say <name>`, run exactly that and show its output exactly as printed, with nothing added.
Never write a line of your own for the person.

It changes this machine's key and nothing else. A lost or stolen machine needs switching off, and
replacing the key on another machine does not do that. Where they ask about a lost or stolen machine,
show `evalation-say ev-rotate.lost`.

## What to do

1. **Run it.**

   ```
   evalation-rotate
   ```

2. **Show what it printed.** Where the first line it prints is a sentence, show that line exactly as
   printed and nothing more. The script prints one line for each outcome, a key replaced or not, so
   add no step, reason or second line of your own.

## When it does not work

Where the first line starts with a lowercase word and a colon, show the line named for that word
here. Never run it with `--reason`, which adds detail for support alone.

- **`no-settings`** means this machine is not signed in. Show `evalation-say ev-account.not-set-up`.
- **`sign-in-damaged`** means this machine's sign-in is damaged. Show
  `evalation-say ev-rotate.damaged`, except where `evalation-status` prints a `signed in as:` line, show `evalation-say ev-rotate.damaged-named "email=<email>"` with the address from that line.
- **`sign-in-unclear`** means this machine would not let Evalation read its sign-in. Show
  `evalation-say ev-rotate.unclear`.
- **`no-receiving-key`** means part of this machine's sign-in cannot be read. Show
  `evalation-say ev-rotate.no-key`.
- **`no-key`** means the same. Show `evalation-say ev-rotate.no-key`.

## What it never does

It sends the public half and keeps the private half, which never leaves this machine and never
appears in this conversation. It proves itself with this machine's sign-in and not with the key
being replaced, so a lost or suspect key is recoverable and never the end of the installation.
