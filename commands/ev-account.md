---
description: "Your Evalation account: pack credits left and the packs you chose."
---

# Your account

## What to do

1. **Ask the server, never infer it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   There is no local answer to this. The server proves the account by verifying a signature it holds
   the public half of, so a cached answer would report an account that lapsed an hour ago as live.
   Report what it returns and never infer the account's state from whether anything appeared in this
   conversation.

2. **Read what is selected.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

3. **Say what is next, going by the `state:` line.** Each case below is the whole reply for that
   state.

   - `state: not-set-up` with a `sign-in: damaged` line: say "This machine's Evalation sign-in is
     damaged. Your pack credits and reports are kept. Run /ev-activate to sign in again."
   - `state: not-set-up` alone: say "This machine is not set up for Evalation yet. Run /ev-start to
     set it up." Nothing more. It is the normal path and not a fault, and explaining that nothing is
     wrong is what makes a person think something is.
   - `state: unreachable`: say "Evalation could not be reached. Check this machine is online, then
     run /ev-account again. If it still fails, contact support@evalation.ai."
   - `state: not-live`: say the line for its `reason:` line.
     - `reason: clock`: "This machine's clock is wrong, so Evalation refused it. Set the clock to
       the right time, then run /ev-account again."
     - `reason: refused`: "Evalation no longer accepts this machine. Contact support@evalation.ai
       and we will sort it out."
     - `reason: ended`: "This machine's access to Evalation has ended. To renew it, email
       support@evalation.ai."
     - `reason: other`: "Evalation could not confirm this machine just now. Run /ev-account again
       in a few minutes. If it still fails, contact support@evalation.ai."
   - `state: live`: follow the steps under "A live account".

## A live account

Say these lines in order, as one reply, and nothing else. Wherever a number of pack credits is 1,
write "one pack credit", never "1 pack credits".

1. Where it prints `signed in as:`, open with "Signed in as <email>." Where it does not, name no
   account and say nothing about its absence. A machine set up before the account was recorded
   does not print it.

2. Read <N> from the `pack credits left` line, exactly as it comes back, and say "You have <N> pack
   credits." Where the line is absent, say "Your pack credits could not be read just now. Run
   /ev-account again in a minute." and name no number of your own.

3. Then one of these, counting the packs `show` lists as <M> and naming each by its title from
   `${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs titles`, never by handle:

   - No packs selected: say "A pack is one thing your code is checked against, such as SOC 2,
     ISO 27001, GDPR, a security hardening review, or a review for a cyber insurer or investor. You
     can pick several. Run /ev-packs to choose yours." Where <N> is 0, add "To buy pack credits,
     email support@evalation.ai."
   - Packs selected: say "You chose <titles>. A run against them uses <M> pack credits, one for each
     pack it reads. Run /ev-run in a repository to check it against them." With one pack, the
     second sentence is "A run against it uses one pack credit."
   - In place of the line above, where <N> is below <M>: say "You chose <titles>. A run against them
     needs <M> pack credits, more than you have, so it would not start and no pack credits are used.
     To buy more pack credits, email support@evalation.ai, or choose fewer packs with /ev-packs."

## What this never does

It reads nothing in the repository, and it prints nothing of the installation key. The key proves
this installation is itself and stays on this machine where only this person can read it, never in
the settings and never in a transcript.
