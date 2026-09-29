---
description: Choose which packs your code is checked against, such as SOC 2, GDPR or a security hardening review.
allowed-tools: Bash(evalation-status:*), Bash(evalation-packs chosen:*), Bash(evalation-packs chooser:*), Bash(evalation-packs set:*), Bash(evalation-say:*)
---

# Choose the packs

Every line the person reads comes from `evalation-say` or from a script, and you show it exactly as
printed, never in words of your own. Where a step names several lines, run each and show them
together as one paragraph, in the order given.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, passing the `questions` a command prints unchanged, at most four at once. Never write a
question and its answers as a list in text. Where the person picks Other and writes their own
words, act on them where they plainly choose among the answers, such as naming a pack. Otherwise
show `evalation-say ev-packs.not-followed` and ask the same question again.

Every pack is named by the title the scripts print, never by its handle such as `soc2`, and `set`
takes those titles too.

## What to do

1. **Check this machine is signed in.**

   ```
   evalation-status
   ```

   - `state: not-set-up` with a `sign-in: damaged` line: show `evalation-say ev-packs.damaged` and
     stop.
   - `state: not-set-up` otherwise: show `evalation-say ev-packs.not-signed-in` and stop.
   - `state: unreachable`: show `evalation-say ev-packs.unreachable` and stop.
   - `state: not-live`: show the line for its `reason:` line and stop: `evalation-say ev-packs.clock`
     for `clock`, `evalation-say ev-packs.refused` for `refused`, `evalation-say ev-packs.ended` for
     `ended` and `evalation-say ev-packs.other` for `other`.
   - `state: live`: note the number after `pack credits left` as <credits> and go on.

   Once it is `live`, and where the person has not already heard it in this conversation, show
   `evalation-say ev-packs.what-a-pack` once.

2. **Read what is chosen now.**

   ```
   evalation-packs chosen
   ```

   It reads the packs Evalation offers and prints `titles`, the chosen packs' titles joined into
   one line, and `packs`, how many are chosen.

   Where `evalation-packs chosen`, `evalation-packs chooser` or `evalation-packs set` fails, here
   or at any later step, show nothing it printed. Read the word before the first colon, show the
   line for it and stop:

   - `unreachable`: `evalation-say ev-packs.unreachable`
   - `refused`: `evalation-say ev-packs.refused`
   - `clock`: `evalation-say ev-packs.clock`
   - `damaged`: `evalation-say ev-packs.damaged`
   - `not-set-up`: `evalation-say ev-packs.not-signed-in`
   - `unreadable`: `evalation-say ev-packs.unreadable`
   - any other word: `evalation-say ev-packs.other`

   The one exception is `choice-unreadable`: `evalation-say ev-packs.choice-unreadable`, then go
   on to step 4 without stopping.

3. **Ask before changing it.** Where `packs` is more than zero, run
   `evalation-say ev-packs.keep titles="<titles>"` and ask the question it prints. On
   `Keep these packs`, show the lines `evalation-say ev-packs.kept titles="<titles>" count="<packs>"`
   and `evalation-say ev-packs.credits-left credits="<credits>"` print. With one pack, use
   `evalation-say ev-packs.kept-one titles="<titles>"` for the first. Where <packs> is more than
   <credits>, add `evalation-say ev-packs.not-enough`. Where the credits could not be read, leave out
   the credits left. Then go to step 9. A selection silently replaced is one nobody agreed to. On
   `Choose packs again`, go on to step 4. Where `packs` is zero, show
   `evalation-say ev-packs.none-yet` and go on.

4. **Say what packs cost.** Show the lines `evalation-say ev-packs.cost` and
   `evalation-say ev-packs.credits-left credits="<credits>"` print. Where the credits could not be
   read, leave out the second.

5. **Ask which packs they want.**

   ```
   evalation-packs chooser
   ```

   It prints one question for each group of packs, every pack Evalation offers in alphabetical
   order, with the packs chosen now marked and `None of these` as the last answer of each. Ask its
   questions, at most four at a time. A question answered `None of these` adds no pack. Where a
   question has `None of these` and a pack ticked, take the pack.

   Where they tick only `None of these` in every question, or tick exactly the packs `chosen` named, run nothing,
   show `evalation-say ev-packs.nothing-changed titles="<titles>"` with the <titles> `chosen` printed,
   and go to step 9. Where nothing was chosen before either, show
   `evalation-say ev-packs.nothing-chosen` and stop.

6. **Check the credits cover it.** Where they tick more packs than they have credits, show
   `evalation-say ev-packs.short count="<ticked>" credits="<credits>"`, with <ticked> the number of
   packs ticked. Then run `evalation-say ev-packs.save-anyway` and ask the question it prints. On
   `Choose packs again`, go back to step 5.

7. **Record it.**

   ```
   evalation-packs set "<title>" ["<title>"...]
   ```

   Pass the labels they ticked, leaving out `None of these`, each in double quotes, exactly as the
   chooser printed them. Show nothing it prints. Where it fails with `unknown-pack`, a title was
   mistyped: run it again with the labels exactly as the chooser printed them.

8. **Say what they chose.** Run `evalation-packs chosen` again, then show
   `evalation-say ev-packs.saved titles="<titles>" count="<packs>"` from what it printed. With one
   pack, show `evalation-say ev-packs.saved-one titles="<titles>"`.

9. **Say what is next.** Show `evalation-say ev-packs.next`.

## What this never does

It reads nothing in the repository and writes nothing into it. The selection lives in the customer's
own configuration and never in the tree being assessed, because that tree is the subject and writing
into it would change the thing this product exists not to touch.
