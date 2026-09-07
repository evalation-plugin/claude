---
description: Replace the key that opens what we serve. Needs no reason and causes no downtime.
---

# Replace the receiving key

What the server serves is encrypted to this installation, so it holds a key that opens it. This
replaces that key. It takes one command, needs no coordination with us, and causes no downtime.

Reach for it when a machine holding the key may have been exposed, when somebody who had access to
it no longer should, or on whatever schedule the customer's own policy sets. It costs nothing to run
and needs no reason given.

## What to do

1. **Run it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-rotate
   ```

2. **Report what it says.** It prints when the previous key stopped being accepted, and whether it
   was retired at once. Ordinarily it is, because the new key is checked against what is actually
   served before the old one is given up.

3. **If it fails**, the message says so plainly and the old key is already back in place. Nothing is
   lost and nothing needs undoing: the key the server holds returns to the old one when its window
   closes. Report the reason and stop rather than running it again on the assumption it will work
   the second time.

## What it never does

It sends the public half and keeps the private half, which never leaves the operating system's own
store and never appears in this conversation. It is authenticated by the seat's signing key rather
than by the key being replaced, which is why a lost or suspect receiving key is recoverable rather
than the end of the installation.
