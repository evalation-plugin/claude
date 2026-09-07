---
description: Evalation seat status. Shows whether the seat is active, what is selected, and what to do next.
---

# Where the seat stands

## What to do

1. **Read the status rather than inferring it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   Report what it returns. Never infer the seat from whether anything appeared in this conversation:
   that is unreliable and it is the kind of guess that tells somebody they are entitled when they are
   not.

2. **Read what is selected.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

3. **Say what is next, in one line.**

   - Not active: run `/ev-login`.
   - Active with no packs selected: run `/ev-packs`.
   - Active with packs selected: name them and say a run reads this repository against them.

## What this never does

It reads nothing in the repository, and it never prints a token, a device identifier or anything
else the status carries beyond whether the seat is live and what it is entitled to.
