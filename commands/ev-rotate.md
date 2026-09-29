---
description: Replace the key this machine uses to open what Evalation sends it, for when this machine's copy may have been exposed. Free and instant.
---

# Replace this machine's key

What Evalation sends is locked to this machine, and this machine holds a key that opens it. This
replaces that key, for use when this machine's copy may have been exposed, or on whatever schedule
the customer's own policy sets. It takes one command, needs no reason given, costs nothing and causes
no downtime.

It changes this machine's key and nothing else. A lost or stolen machine needs switching off, and
replacing the key on another machine does not do that. Where they ask about a lost or stolen machine,
say "Email support@evalation.ai and we will switch that machine off."

## What to do

1. **Run it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-rotate
   ```

2. **Say the one line it prints**: "Replaced this machine's key. The old key no longer works."
   Nothing else follows, so end there.

## When it does not work

Where the first line is one of the two sentences below, say it. The word on the line after it picks
the one next step to add. Otherwise read the prefix of the first line and say the line given for it.
Never run it with `--reason`, which adds detail for support alone.

- **"The key was not replaced and the old one still works."** Add the step for the word:
  - `clock`: "Set this machine's clock to the right time, then run /ev-rotate again."
  - `key-store-refused`: "Check this machine's password store (Keychain on a Mac) is unlocked, then
    run /ev-rotate again."
  - `refused`: "Evalation no longer accepts this machine. Contact support@evalation.ai and we will
    sort it out."
  - `ended`: "This machine's access to Evalation has ended. To renew it, email
    support@evalation.ai."
  - anything else: "Contact support@evalation.ai and we will fix it."
- **"The key change did not finish."** Both keys are kept on this machine, and running again
  finishes the change without making another. Never say the old key still works. Say next "Other
  Evalation commands on this machine may not work until it finishes.", since they open what
  Evalation sends with the new key, and Evalation may not use it yet. Then add the step for the
  word:
  - `clock`: "Set this machine's clock to the right time, then run /ev-rotate again to finish it."
  - `unreachable`: "Check this machine is online, then run /ev-rotate again to finish it."
  - `key-store-refused`: "Check this machine's password store (Keychain on a Mac) is unlocked, then
    run /ev-rotate again to finish it."
  - `refused`: "Evalation no longer accepts this machine. Contact support@evalation.ai and we will
    sort it out."
  - `ended`: "This machine's access to Evalation has ended. To renew it, email
    support@evalation.ai."
  - anything else: "Run /ev-rotate again to finish it." If it fails a second time, say "Contact
    support@evalation.ai and we will finish it." and stop.
- **`no-settings`** means this machine is not signed in. Say "This machine is not signed in to
  Evalation yet. Run /ev-activate first."
- **`sign-in-damaged`** means this machine's sign-in is damaged. Say "This machine's Evalation
  sign-in is damaged, so the key was not replaced. Run /ev-activate to sign in again."
- **`sign-in-unclear`** means this machine would not let Evalation read its sign-in. Say
  "Evalation could not read this machine's sign-in, so the key was not replaced. Unlock this
  machine's password store (Keychain on a Mac), then run /ev-rotate again. If it still fails, contact
  support@evalation.ai."
- **`no-receiving-key`** or **`no-key`** means part of this machine's sign-in cannot be read. Say
  "Part of this machine's Evalation sign-in cannot be read, so the key was not replaced. Contact
  support@evalation.ai and we will fix it."

## What it never does

It sends the public half and keeps the private half, which never leaves this machine and never
appears in this conversation. It proves itself with this machine's sign-in and not
with the key being replaced, so a lost or suspect key is recoverable and never the end of the
installation.
