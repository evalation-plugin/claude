---
description: Evalation seat status. Shows whether the seat is live, what is selected, and what to do next.
---

# Where the seat stands

## What to do

1. **Ask the server, never infer it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   There is no local answer to this. The seat is proven by the server verifying a signature it holds
   the public half of, so a cached answer would report a seat that lapsed an hour ago as live.
   Report what it returns and never infer the seat from whether anything appeared in this
   conversation.

   It prints the pack credits left as well, which is what a run spends: one credit for each pack it
   reads. Report that number as it comes back, and where the line is absent say the balance could
   not be read and name no number of your own.

2. **Read what is selected.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

3. **Say what is next, in one line.**

   - `state: not-set-up`: say one line, that this machine is not set up yet and `/ev-start` does it.
     Nothing more. It is the normal path and not a fault, and explaining that nothing is wrong is
     what makes a person think something is.
   - Seat not live for any other reason: report the reason the status gave. A clock more than five
     minutes out refuses every ask on its own, so say that where the reason points at the proof.
   - Live with no packs selected: say what a pack is in one line and offer `/ev-packs`.
   - Live with packs selected: name them by their titles from
     `${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs titles`, never by handle, say what a run against them spends and what is left, and
     say `/ev-run` reads a repository against them.
   - Live with fewer credits than the selection has packs: say both numbers and that a run is
     refused whole, with no part of it served, so the choice is to top up or to select fewer packs.

## What this never does

It reads nothing in the repository, and it prints nothing of the installation key. The key proves
this installation is itself and lives in the operating system's own store, never in a file, never in
the settings and never in a transcript.
