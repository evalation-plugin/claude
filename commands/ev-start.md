---
description: Start here. Sets Evalation up and walks you through it one step at a time.
---

# Set Evalation up

The person running this has just installed the plugin and may know nothing about it. Assume that.
They have not read the readme, they do not know what a pack is, and they do not know which command
comes next. Your job is to find out where they are, tell them, and take them one step further.

**Never describe the state of the installation. Act on it.** This reads three things about the
machine, and every one of them is plumbing. A person setting a product up wants to be taken through
it, not shown its internal states with an explanation of why each one is fine. "Nothing selected yet,
which is the ordinary state for a fresh installation" is the failure: it narrates an absence, calls it
ordinary, and leaves the reader wondering why anybody felt the need to say so. Say what the next step
is and do it.

The same goes for the reasoning in this file. What is written here is why you act, not something to
repeat. If a sentence below explains a decision, that explanation is for you.

**Never mention a thing that is not there.** No settings, no packs, no keys, no previous run. Absence
is the starting point and not a finding, and a product that lists what it has not got yet sounds
like it is apologising.

**Say each thing once, in plain English, before you do it.** A person who does not know what is about
to happen cannot agree to it. Lead with what they get, not with how it works.

**One step at a time.** Do the next thing and say what follows. Never run the whole sequence silently
and announce it afterwards.

**A count of one is singular.** Wherever a number of pack credits below is 1, write "one pack
credit", never "1 pack credits".

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with each answer one of its options. Never write a question and its answers as a list in text.
Word each question so nobody has to guess what an answer does. Ask what will happen, never what to
leave out. A tick always means yes to that option, and each answer's label says what choosing it
does.

## What to do

1. **Open with what this is**, in these words: "Evalation checks your code against the security and
   compliance standards you choose, and writes reports on what it finds." A person whose first sight
   of a product is a command running has been given no reason to trust it, and one whose first sight
   is a status report has been handed somebody else's diagnostics.

2. **Find out where they are.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   It always succeeds and names a state on its first line. Report none of these as an error:

   - **`state: not-set-up`**: go to step 3, saying nothing about the state itself. Where a
     `sign-in: damaged` line follows, first say "This machine needs to sign in to Evalation again.
     Your pack credits and reports are kept." Signing in again replaces a damaged sign-in.
   - **`state: live`** means set up and paid up. Go to step 4.
   - **`state: not-live`** means set up, but the server refuses it. Say the line for its `reason:`
     line and stop:
     - `reason: clock`: "This machine's clock is wrong, so Evalation refused it. Set the clock to
       the right time, then run /ev-start again."
     - `reason: refused`: "Evalation no longer accepts this machine. Contact support@evalation.ai
       and we will sort it out."
     - `reason: ended`: "This machine's access to Evalation has ended. To renew it, email
       support@evalation.ai."
     - `reason: other`: "Evalation could not confirm this machine just now. Run /ev-start again in
       a few minutes. If it still fails, contact support@evalation.ai."
   - **`state: unreachable`** is our end or their network. Say "Evalation could not be reached.
     Check this machine is online, then run /ev-start again. If it still fails, contact
     support@evalation.ai." and stop.

3. **Take them through signing in**, which is the whole of setting up.

   Say: "Signing in sets up your Evalation account, or links this machine to it if you already have
   one."

   Then run `/ev-activate` straight away. It asks which account to sign in with, explains the
   sign-in and says which account it signed in as, so ask nothing and explain nothing more here, and
   never name the account again. Where it did not finish, it has already said the next step, so stop.
   When it finishes, go to step 4. Credits wait for the close, once `/ev-packs` has said what a pack
   is.

4. **Find out what they have chosen to be assessed against.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

   Where nothing is selected, go to step 5 without remarking on it. Where something is, say "You are
   set up to check code against <titles>.", naming each pack by its title from
   `${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs titles`, never by handle. That sentence opens the close
   in step 6.

5. **Take them through choosing**, if nothing is selected.

   Run `/ev-packs` straight away. It says what a pack is and what packs cost, fetches the real list
   and records what they choose, so say nothing about packs here. Where it finds 0 pack credits left,
   say "To buy pack credits, email support@evalation.ai." straight after it says what packs cost,
   before it asks which packs they want.

6. **Close in up to four sentences**, counting the one step 4 or `/ev-packs` gave on what they are
   set up to check. Run `${CLAUDE_PLUGIN_ROOT}/bin/evalation-status` again and read <N> from its
   `pack credits left` line, and count the packs `evalation-packs show` lists as <M>.

   Where <M> is 0, because they stopped without choosing, end with "Run /ev-packs when you are ready
   to choose what to check against." and nothing more.

   Run `git rev-parse --is-inside-work-tree 2>/dev/null` in the current folder. Where it prints
   `true`, the next step is "Run /ev-run here to check this repository." Otherwise it is "Next, open
   Claude Code in the repository you want checked and run /ev-run."

   Follow it with the cost, which depends on <N>:

   - <N> at least <M>: "It uses <M> pack credits, and you have <N>." Where the packs were already
     chosen before this ran, end with "Run /ev-packs to change them."
   - <N> below <M>: "This selection uses <M> pack credits and you have <N>, so a run would not start.
     To buy more pack credits, email support@evalation.ai, or choose fewer packs with /ev-packs."
   - The `pack credits left` line absent: "Your pack credits could not be read just now. Run
     /ev-account in a minute to see them."

   Not a status report. No numbered summary of what happened, no list of everything now true of the
   machine, and no restating of steps they just watched: they were there. The screen at the end of
   setting a product up should read like the end of a conversation and not the output of an audit.

## What this never does

It reads nothing in their repository beyond whether the current folder is one, and writes nothing
into it. Everything it records is the
installation's own configuration, which lives beside their settings and never in the tree being
assessed, because that tree is the subject and writing into it would change the thing this product
exists not to touch.

It prints no key. Both keys stay on this machine where only this person can read them, never in the
settings and never in this conversation.
