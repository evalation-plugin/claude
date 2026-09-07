---
description: Start here. Sets Evalation up and walks you through it one step at a time.
---

# Set Evalation up

The person running this has just installed the plugin and may know nothing about it. Assume that.
They have not read the readme, they do not know what a pack is, and they do not know which command
comes next. Your job is to find out where they are, tell them, and take them one step further.

**Work out where they are before saying anything.** The three questions below have answers on this
machine and on our server, so ask rather than guess, and never ask the person something a command can
answer.

**Say each thing once, in plain English, before you do it.** A person who does not know what is about
to happen cannot agree to it. Lead with what they get, not with how it works.

**One step at a time.** Do the next thing, report it, and say what follows. Never run the whole
sequence silently and announce it afterwards.

## What to do

1. **Say hello before you run anything.** A sentence or two: what Evalation is, and that you are
   about to check where this machine stands. A person whose first sight of a new product is a command
   running has been given no reason to trust it.

2. **Find out where they are.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   It always succeeds and names a state on its first line. Read that line rather than the prose under
   it, which may be reworded, and report none of these as an error:

   - **`state: not-set-up`** is where everybody starts. It is the expected answer on a fresh install
     and nothing is wrong. Say so in as many words, because somebody who has just installed a thing
     and is told about settings that do not exist will think they broke it. Go to step 3.
   - **`state: live`** means set up and paid up. Go to step 4.
   - **`state: not-live`** means set up, but the server will not serve it. Report the reason in their
     words. A clock more than five minutes out refuses every ask on its own, so where the reason
     points at the proof, tell them to check the machine's clock. Then stop.
   - **`state: unreachable`** is our end or their network. Say so plainly and stop, and do not tell
     them to try again in a loop.

3. **Take them through signing in**, which is the whole of setting up.

   Tell them first, in about this much detail and in your own words: Evalation needs to know whose
   account to bill, so they sign in with Google or Microsoft in their own browser. No password comes
   near us. Their machine makes two keys and keeps both private halves, so from then on it proves
   itself by signing rather than by holding anything worth stealing.

   **Ask which provider they want every single time, and never carry one forward.** Offer Google and
   Microsoft as a question, even where they named one earlier in this conversation. An attempt that
   failed is the strongest reason to ask again rather than the weakest: the provider is the thing most
   likely to have been what was wrong, and answering it for them from a previous turn sends them
   straight back into the failure they just came out of. Where an attempt has already failed, say
   which provider it was and what it said, and offer the other one first.

   Then run `/ev-activate`, which does the rest and knows what to do when it goes wrong.

   When it finishes, say the account it signed in as and that this machine is now set up. Then go to
   step 4.

4. **Find out what they have chosen to be assessed against.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

   Nothing selected is the ordinary state for someone who has just arrived, and it is not a problem.
   Say so rather than reporting it as an error.

5. **Take them through choosing**, if nothing is selected.

   Tell them what a pack is before offering a list: one subject a run reads their repository against.
   A published standard such as SOC 2, ISO 27001, GDPR or the EU AI Act. A set of concerns of ours
   such as hardening or cyber. Or a composition authored for one use, such as a review for cyber
   insurance underwriting, or for an investor reading a codebase against what its founder claims of
   it. They can pick several, and picking several is the ordinary case.

   Then run `/ev-packs`, which fetches the real catalogue and records what they choose.

6. **Tell them where they have got to, and what this version does next.**

   Name what is set up and what is selected. Then say plainly that reading a repository against the
   selected packs is not in this version yet, so this is as far as it goes today. Do not imply a run
   is available, do not offer to do one by hand, and do not promise a date.

   Say what they can do meanwhile: `/ev-account` to check where the seat stands, `/ev-packs` to
   change the selection, and `/ev-rotate` to replace the key that opens what we serve, which needs no
   reason and causes no downtime.

## What this never does

It reads nothing in their repository and writes nothing into it. Everything it records is the
installation's own configuration, which lives beside their settings and never in the tree being
assessed, because that tree is the subject and writing into it would change the thing this product
exists not to touch.

It prints no key. Both keys live in the operating system's own store, never in a file, never in the
settings and never in this conversation.
