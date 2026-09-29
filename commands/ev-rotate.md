---
description: Replace the key this machine uses to open what Evalation sends it, for when this machine's copy may have been exposed. Free and instant.
allowed-tools: Bash(evalation-rotate:*), Bash(evalation-say:*)
---

# Replace this machine's key

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

2. **Show the line it prints exactly as printed.** Nothing else follows, so end there.

## When it does not work

Where the first line is one of the two sentences below, show it exactly as printed. The word on the
line after it picks the one next step to add. Otherwise read the prefix of the first line and show
the line named for it. Never run it with `--reason`, which adds detail for support alone.

- **`The key was not replaced and the old one still works.`** Add the step for the word:
  - `clock`: `evalation-say ev-rotate.not-replaced-clock`
  - `key-store-refused`: `evalation-say ev-rotate.not-replaced-key-store`
  - `refused`: `evalation-say ev-account.refused`
  - `ended`: `evalation-say ev-account.ended`
  - anything else: `evalation-say ev-rotate.not-replaced-other`
- **`The key change did not finish.`** Both keys are kept on this machine, and running again
  finishes the change without making another. Never say the old key still works. Show next
  `evalation-say ev-rotate.not-finished`, since other commands open what Evalation sends with the
  new key, and Evalation may not use it yet. Then add the step for the word:
  - `clock`: `evalation-say ev-rotate.not-finished-clock`
  - `unreachable`: `evalation-say ev-rotate.not-finished-unreachable`
  - `key-store-refused`: `evalation-say ev-rotate.not-finished-key-store`
  - `refused`: `evalation-say ev-account.refused`
  - `ended`: `evalation-say ev-account.ended`
  - anything else: `evalation-say ev-rotate.not-finished-other`. If it fails a second time, show
    `evalation-say ev-rotate.not-finished-twice` and stop.
- **`no-settings`** means this machine is not signed in. Show `evalation-say ev-rotate.no-settings`.
- **`sign-in-damaged`** means this machine's sign-in is damaged. Show
  `evalation-say ev-rotate.damaged`.
- **`sign-in-unclear`** means this machine would not let Evalation read its sign-in. Show
  `evalation-say ev-rotate.unclear`.
- **`no-receiving-key`** or **`no-key`** means part of this machine's sign-in cannot be read. Show
  `evalation-say ev-rotate.no-key`.

## What it never does

It sends the public half and keeps the private half, which never leaves this machine and never
appears in this conversation. It proves itself with this machine's sign-in and not with the key
being replaced, so a lost or suspect key is recoverable and never the end of the installation.
