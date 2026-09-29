---
description: Choose which packs your code is checked against, such as SOC 2, GDPR or a security hardening review.
allowed-tools: Bash(evalation-status:*), Bash(evalation-packs show:*), Bash(evalation-packs titles:*), Bash(evalation-packs set:*)
---

# Choose the packs

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with each answer one of its options. Never write a question and its answers as a list in text.
Word each question so nobody has to guess what an answer does. Ask what will happen, such as which
packs to keep, and never what to leave out. A tick always means yes to that option, and each
answer's label says what choosing it does. Where the person picks Other and writes their own words,
act on them where they plainly choose among the answers, such as naming a pack. Otherwise say you
did not follow and ask the same question again.

Name every pack by its title exactly as `titles` gives it, so SOC 2 reads "SOC 2 Trust Services
Criteria" and never `soc2`. A handle is never what a person is shown, so `set` takes titles too.

## What to do

1. **Check this machine is signed in.**

   ```
   evalation-status
   ```

   - `state: not-set-up` with a `sign-in: damaged` line: say "This machine's Evalation sign-in is
     damaged. Run /ev-activate to sign in again." and stop.
   - `state: not-set-up` otherwise: say "This machine is not signed in to Evalation yet. Run
     /ev-activate to sign in." and stop.
   - `state: unreachable`: say "Evalation could not be reached. Check this machine is online and run
     /ev-packs again." and stop.
   - `state: not-live`: give the reason it names in plain words and what it says to do about the
     account. Where it names no way forward, say "Contact support@evalation.ai to sort out your
     account." and stop.
   - `state: live`: note the number after `pack credits left` and go on.

   Once it is `live`, and where the person has not already heard it in this conversation, say once
   what a pack is, in these words: "A pack is one thing your code is checked against, such as SOC 2,
   ISO 27001, GDPR, a security hardening review, or a review for a cyber insurer or investor. You can
   pick several."

2. **Read what is chosen now and what is offered.**

   ```
   evalation-packs show
   ```

   ```
   evalation-packs titles
   ```

   `titles` gives every pack in alphabetical order of title, each with its handle, its title, a
   one line summary and the `question` of step 5 it goes in. Where it fails, read the start of the reason it prints, say one line and stop:

   - `refused`: give the reason it names in plain words. Where it names no way forward, say "Contact
     support@evalation.ai to sort out your account."
   - `unreachable`: say "Evalation could not be reached. Check this machine is online and run
     /ev-packs again."

   Otherwise say the words after the colon in plain words and stop.

   Never invent a catalogue, and never offer a pack `titles` did not return. Where `show` names a
   handle `titles` does not hold, call it "a pack Evalation no longer offers".

3. **Ask before changing it.** Where `show` names packs, ask "Keep your usual packs, <titles>?",
   with the answers "Keep these packs", described as "Your checks keep using these packs.", and
   "Choose packs again", described as "Pick from every pack Evalation offers.". On "Keep these
   packs", say "Your checks still use <titles>, <M> pack credits each time. You have <N> pack
   credits left." With one pack, the first sentence ends "one pack credit each time". Where <M> is
   more than <N>, add "A check will not
   start until you have more. To buy more pack credits, email support@evalation.ai." Where the
   credits could not be read, leave out the credits left. Then go to step 9. A selection silently
   replaced is one nobody agreed to. Where `show` names none, say "No packs are chosen yet." and go
   on.

4. **Say what packs cost**, in these words: "Each pack you choose uses one pack credit every time
   your code is checked. You have <N> pack credits left." Where the credits could not be read, leave
   out the second sentence.

5. **Ask which packs they want.** Offer every pack `titles` returned, in its order, one question for
   each `question` number it gives, holding the packs with that number, so each question offers two
   to four. Each question allows several answers. Each answer's label is the pack's title and its
   description is the pack's `summary`. Where `show` named the pack, end its description with
   "Chosen now." Ask up to four questions at a time, each headed "Packs <k>/<n>", where <n> is the
   highest `question` number, and asking "Which packs from <first title> to <last title> should
   each check of your code use?", with the first and last titles that question offers, so no two
   questions read the same. Where they pick Other and write that they want none from that question, take it as nothing ticked there.

   Where they tick nothing in any question, or tick exactly the packs `show` named, run nothing,
   say "Nothing changed. Your checks still use <titles>." with the titles of the packs `show`
   named, and go to step 9. Where nothing was chosen before either, say "Nothing changed. No packs
   are chosen yet." and stop.

6. **Check the credits cover it.** Where they tick more packs than they have credits, say "These
   packs use <M> pack credits every time your code is checked, and you have <N>, so a check will not
   start. To buy more pack credits, email support@evalation.ai." Then ask "Save these packs anyway?",
   with the answers "Save these packs", described as "Keeps this choice. A check starts once you
   have enough pack credits.", and "Choose packs again", described as "Pick from every pack
   Evalation offers.". On "Choose packs again", go back to step 5.

7. **Record it.**

   ```
   evalation-packs set "<title>" ["<title>"...]
   ```

   Pass the titles they ticked, each in double quotes, exactly as `titles` gave them. It prints the
   titles it saved. Where it prints `unknown-pack`, a title was mistyped: run it again with the
   titles exactly as `titles` gave them.

8. **Say what they chose.** After a new choice say "From now on your checks use <titles>, <M> pack
   credits each time. You can change this with /ev-packs." With one pack, the first sentence ends
   "one pack credit each time".

9. **Say what is next**, in these words: "Next, run /ev-run to check a repository against these
   packs. It also lets you pick other packs for that check alone."

## What this never does

It reads nothing in the repository and writes nothing into it. The selection lives in the customer's
own configuration and never in the tree being assessed, because that tree is the subject and writing
into it would change the thing this product exists not to touch.
