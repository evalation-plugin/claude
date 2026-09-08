---
description: Evalation seat status. Shows whether the seat is live, what is selected, and what to do next.
---

# Where the seat stands

## What to do

1. **Ask the server rather than inferring it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   There is no local answer to this. The seat is proven by the server verifying a signature it holds
   the public half of, so a cached answer would report a seat that lapsed an hour ago as live.
   Report what it returns and never infer the seat from whether anything appeared in this
   conversation.

2. **Read what is selected.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

3. **Say what is next, in one line.**

   - `state: not-set-up`: say one line, that this machine is not set up yet and `/ev-start` does it.
     Nothing more. It is the normal path rather than a fault, and explaining that nothing is wrong is
     what makes a person think something is.
   - Seat not live for any other reason: report the reason the status gave. A clock more than five
     minutes out refuses every ask on its own, so say that where the reason points at the proof.
   - Live with no packs selected: say what a pack is in one line and offer `/ev-packs`.
   - Live with packs selected: name them and say `/ev-run` reads a repository against them.

## What this never does

It reads nothing in the repository, and it prints nothing of the installation key. The key proves
this installation is itself and lives in the operating system's own store, never in a file, never in
the settings and never in a transcript.
