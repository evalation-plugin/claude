---
description: Start here. Sets Evalation up and walks you through it one step at a time.
allowed-tools: Bash(evalation-status:*), Bash(evalation-packs chosen:*), Bash(evalation-say:*), Bash(git rev-parse:*)
---

# Set Evalation up

The person running this has just installed the plugin and may know nothing about it. Assume that.
They have not read the readme, they do not know what a pack is, and they do not know which command
comes next. Your job is to find out where they are, tell them, and take them one step further.

**Every line you say comes from the plugin.** Where this file names a line as `evalation-say <name>`,
run exactly that and show its output exactly as printed, with nothing added. Where the line has a
blank such as `<titles>`, pass its value as `titles=<value>`, for example
`evalation-say ev-start.chosen "titles=SOC 2 and GDPR"`. Never write a line of your own for the
person.

**Never describe the state of the installation. Act on it.** This reads three things about the
machine, and every one of them is plumbing. A person setting a product up wants to be taken through
it, not shown its internal states with an explanation of why each one is fine. Telling them that
nothing is selected yet and that this is ordinary for a fresh installation is the failure: it
narrates an absence, calls it ordinary, and leaves the reader wondering why anybody felt the need to
say so. Show the next step and do it.

The same goes for the reasoning in this file. What is written here is why you act, not something to
repeat. If a sentence below explains a decision, that explanation is for you.

**Never mention a thing that is not there.** No settings, no packs, no keys, no previous run. Absence
is the starting point and not a finding, and a product that lists what it has not got yet sounds
like it is apologising.

**Show each line once, before you do the thing it describes.** A person who does not know what is
about to happen cannot agree to it. The lines lead with what they get, not with how it works.

**One step at a time.** Do the next thing and show the line for what follows. Never run the whole
sequence silently and announce it afterwards.

**A count of one has its own line.** Wherever a number of pack credits below is 1, use the line named
for one.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with each answer one of its options. Never write a question and its answers as a list in text.
Word each question so nobody has to guess what an answer does. Ask what will happen, never what to
leave out. A tick always means yes to that option, and each answer's label says what choosing it
does.

## What to do

1. **Open with what this is**: `evalation-say ev-start.intro`. A person whose first sight of a product
   is a command running has been given no reason to trust it, and one whose first sight is a status
   report has been handed somebody else's diagnostics.

2. **Find out where they are.**

   ```
   evalation-status
   ```

   It always succeeds and names a state on its first line. Report none of these as an error:

   - **`state: not-set-up`**: go to step 3, saying nothing about the state itself. Where a
     `sign-in: damaged` line follows, first `evalation-say ev-activate.damaged`, or where a
     `signed in as:` line names the account, `evalation-say ev-activate.damaged-named` with that
     email as `email`. Signing in again replaces a damaged sign-in.
   - **`state: live`** means set up and paid up. Go to step 4.
   - **`state: not-live`** means set up, but the server refuses it. Show the line for its `reason:`
     line and stop:
     - `reason: clock`: `evalation-say ev-start.clock`
     - `reason: refused`: `evalation-say ev-account.refused`
     - `reason: ended`: `evalation-say ev-account.ended`
     - `reason: other`: `evalation-say ev-start.other`
   - **`state: unreachable`** is our end or their network. Show `evalation-say ev-start.unreachable`
     and stop.

3. **Take them through signing in**, which is the whole of setting up. First
   `evalation-say ev-start.signing-in`.

   Then run `/ev-activate` straight away. It asks which account to sign in with, explains the
   sign-in and says which account it signed in as, so ask nothing and explain nothing more here, and
   never name the account again. Where it did not finish, it has already said the next step, so stop.
   When it finishes, go to step 4. Credits wait for the close, once `/ev-packs` has said what a pack
   is.

4. **Find out what they have chosen to be assessed against.**

   ```
   evalation-packs chosen
   ```

   It prints `titles`, the chosen packs' titles already joined, and `packs`, how many there are.
   Where `packs` is 0, go to step 5 without remarking on it. Otherwise
   `evalation-say ev-start.chosen`, passing `titles` exactly as printed. That line opens the close
   in step 6.

   Where `evalation-packs chosen` exits with any code but 0, here or in step 6, whatever its first
   word, show `evalation-say ev-start.packs-unread`, show nothing of what it printed, and stop.

5. **Take them through choosing**, if nothing is selected.

   Run `/ev-packs` straight away. It says what a pack is and what packs cost, fetches the real list
   and records what they choose, so say nothing about packs here. Where it finds 0 pack credits left,
   show `evalation-say ev-account.buy` straight after it says what packs cost, before it asks which
   packs they want.

6. **Close in up to four sentences**, counting the one step 4 or `/ev-packs` gave on what they are
   set up to check. Run `evalation-status` again and read <N> from its `pack credits left` line, and
   run `evalation-packs chosen` again and read <M> from its `packs`.

   Where <M> is 0, because they stopped without choosing, end with `evalation-say ev-start.no-packs`
   and nothing more.

   Run `git rev-parse --is-inside-work-tree 2>/dev/null` in the current folder. Where it prints
   `true`, the next step is `evalation-say ev-start.run-here`. Otherwise it is
   `evalation-say ev-start.run-elsewhere`.

   Follow it with the cost, which depends on <N>, passing <M> as `count` and <N> as `credits`:

   - <N> at least <M>: `evalation-say ev-start.cost`, or where <M> is 1,
     `evalation-say ev-start.cost-one`. Where the packs were already chosen before this ran, end with
     `evalation-say ev-start.change`.
   - <N> below <M>: `evalation-say ev-start.short`, or where <M> is 1,
     `evalation-say ev-start.short-one`.
   - The `pack credits left` line absent: `evalation-say ev-start.credits-unread`.

   Not a status report. No numbered summary of what happened, no list of everything now true of the
   machine, and no restating of steps they just watched: they were there. The screen at the end of
   setting a product up should read like the end of a conversation and not the output of an audit.

## What this never does

It reads nothing in their repository beyond whether the current folder is one, and writes nothing
into it. Everything it records is the installation's own configuration, which lives beside their
settings and never in the tree being assessed, because that tree is the subject and writing into it
would change the thing this product exists not to touch.

It prints no key. Both keys stay on this machine where only this person can read them, never in the
settings and never in this conversation.
