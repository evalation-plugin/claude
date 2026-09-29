---
description: Remove Evalation from this machine. Signs this machine out, deletes what Evalation saved here, and offers to delete the Claude Code conversations that ran an Evalation command.
allowed-tools: Bash(evalation-status:*), Bash(evalation-remove folders:*), Bash(evalation-remove run:*), Bash(evalation-questions list:*), Bash(evalation-questions keep-on-account:*)
---

# Removing Evalation from this machine

For a consultant leaving a customer's machine, or anyone who no longer wants Evalation here. The
account stays, with its pack credits and any question sets kept on it, and so do the reports in
Documents. Only this machine's sign in and what Evalation kept on it go. Other machines signed in to
the account are unaffected.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with each answer one of its options. Never write a question and its answers as a list in text.
Word each question so nobody has to guess what an answer does. Ask what will happen, never what to
leave out. A tick always means yes to that option, and each answer's label says what choosing it
does. Where the person picks Other and writes their own words, act on them where they plainly choose
one of the answers. Otherwise treat them as the answer that changes nothing, say so, and stop.

Never show the person a path inside Evalation's own folder, a key's name except where they have to
delete it by hand, or any field name from what a command prints.

## What to do

1. **Check what can be signed out.**

   ```
   evalation-status
   ```

   - `state: unreachable`: say "Evalation could not be reached, so nothing was changed. Check this
     machine is online, then run /ev-remove again." and stop.
   - `state: not-set-up` with a `sign-in: damaged` line: the sign in is damaged, so Evalation cannot
     sign this machine out. Go on, and in step 2 open with "This machine's Evalation sign-in is
     damaged, so Evalation cannot sign it out from here."
   - `state: not-set-up` otherwise: this machine holds no sign in, so there is nothing to sign out.
     Go on, and in step 2 open with "This machine is not signed in to Evalation, so there is nothing
     to sign out."
   - `state: live` or `state: not-live`: go on.

2. **Say what will be removed, then ask.**

   ```
   evalation-remove folders
   ```

   Where the state was `live`, also run:

   ```
   evalation-questions list
   ```

   Where it prints `"account":"unreachable"`, say the unreachable line from step 1 and stop.

   Where the state was `live` or `not-live`, say, in these words: "This signs this machine out of
   Evalation and deletes its keys from this machine's password store. Other machines and your
   account are unaffected, so your pack credits stay and you can sign in again on any machine. It
   also deletes Evalation's own folder on this machine, with the saved results of each check, your
   pack choice and any question sets saved only here. Question sets kept on your account stay."

   Where the state was `not-set-up`, after the opening line step 1 gave, say "Removing deletes Evalation's own folder on this machine, with the saved results of each check, your pack choice and any question sets saved here. Evalation cannot reach your account from this machine, so those question sets cannot be kept on it."

   Where `home_exists` is false, say "Evalation has saved nothing on this machine, so there is
   nothing to delete." and leave out the sentences about the folder. Where both hold, leave out the sentences about the folder and say "Evalation has nothing else on this machine." Where `conversations` is more than zero, go on to step 3 and ask nothing more in this step. Otherwise go straight to the last step of step 5.

   Where `reports` lists any, say "Evalation's own folder also holds reports an older version of
   Evalation saved there: <reports>. Removing deletes them with it. Reports in your Documents folder
   stay." Name each entry of `reports` as "the <names> from the check of <repository> on <date>",
   with its `reports` as <names>, such as "the board pack, evidence pack and findings detail from
   the check of sanaude/maycray on 23 September 2026". Leave out "of <repository>" where
   `repository` is null, and join the entries with commas and a final "and".

   Then ask "Remove Evalation from this machine?", with the answers "Remove it", described as "Signs
   this machine out and deletes Evalation's folder and keys here.", and "Keep it", described as
   "Changes nothing.". Where the state was `not-set-up`, describe "Remove it" as "Deletes what Evalation saved on this machine." On "Keep it", say "Nothing was changed." and stop.

   On "Remove it", where `list` shows any set whose `where` is `machine`, ask "Keep <sets> on your
   account before removing?", naming each such set once in <sets>, in double quotes, with the
   answers "Keep on my account", described as "Copies them to your account so any machine you sign
   in on can use them.", and "Delete with the rest", described as "Deletes them with Evalation's
   folder.". With one set, say "it" in place of "them" in both descriptions.

3. **Offer to delete the conversations that used Evalation.** Where `conversations` is more than
   zero, say: "Claude Code keeps <N> other conversations in which you ran an Evalation command,
   including what Evalation found in your code. They come from these project folders: <places>.
   Deleting them removes only those conversations and cannot be undone. This conversation and every
   one without an Evalation command stay, and nothing in your project folders is touched." Where
   there is one, say "one other conversation" and "It comes from the project folder <folder>, on
   <from>."

   Name each entry of `places` as "<folder>, <conversations> from <from> to <to>", or "<folder>,
   one on <from>" where `conversations` is one, or "<folder>, <conversations> on <from>" where
   `from` and `to` match. Leave the month and year out of <from> where they match those of <to>,
   and join the entries with commas and a final "and", such as "MayCray-main, 23 from 7 to 29
   September 2026 and evalation, one on 29 September 2026".

   Where `open_by` is `claude-code`, add "One of them is open in another Claude Code window, so it is kept. To delete it too, close that window before you answer." where `open` is one, or "<K> of them are open in other Claude Code windows, so they are kept. To delete those too, close those windows before you answer." where it is more. Where `open_by` is `last-hour`, add "One of them changed in the last hour, so it is kept in case it is still open in another window." where `open` is one, or "<K> of them changed in the last hour, so they are kept in case one is still open in another window." where it is more. <K> is `open`.

   Then ask "Also delete the Claude Code conversations that used Evalation?", with the answers
   "Delete them", described as "Deletes those conversations, except any still open.", and "Keep
   them", described as "Leaves every conversation in Claude Code.". Where `conversations` is zero,
   ask nothing about conversations. Never delete anything else, and never anything in the folder
   this session runs in. Where step 2 found Evalation has nothing else on this machine and they
   chose "Keep them", go straight to the last step of step 5.

4. **Remove it.** Where they chose "Keep on my account", first run this for each set named in
   step 2:

   ```
   evalation-questions keep-on-account <name>
   ```

   Where it fails and the reason says the set "is not kept on the account, since", the set fails
   its check. Say in plain words what each listed problem is, then ask "This question set cannot be
   kept on your account as it is. What should happen to it?", with the answers "Delete it with the
   rest", described as "Deletes the set with Evalation's folder and goes on removing.", and "Stop so
   I can fix it", described as "Removes nothing, so you can fix the set first.". On "Stop so I can
   fix it", say "Nothing was removed. Fix the set
   with /ev-questions, then run /ev-remove again." and stop. Where it fails for any other reason, say
   which set, say "Nothing was removed. Check this machine is online, then run /ev-remove again." and
   stop.

   Then run:

   ```
   evalation-remove run [--clear-history]
   ```

   Add `--clear-history` where they chose "Delete them". It signs the machine out before it deletes
   anything. Where it fails, read the start of the reason:

   - `unreachable`: say "Evalation could not be reached, so nothing was removed. Check this machine is
     online, then run /ev-remove again." and stop.
   - `refused`: say "Evalation would not sign this machine out, so nothing was removed. Contact
     support@evalation.ai for help." and stop.

5. **Say what was removed and give the last step.** From what `run` printed:

   - Where `signed_out` is `now`, say this machine is signed out. Where it is `already`, say "This machine was already signed out of Evalation, so nothing was signed out.", unless step 2 already said this machine is not signed in. Where it is `not-revoked`, say "Evalation could not sign this machine out because its sign-in was damaged. Email support@evalation.ai to have this machine's sign-in switched off."
   - Where `folder_deleted` is true and `home_exists` was true in step 2, say Evalation's folder on
     this machine is deleted. Where it is false, say "Some of Evalation's files on this machine
     could not be deleted. Run /ev-remove again to finish."
   - Where `keys_left` names any key, say how many keys are still in this machine's password store
     and that the person has to delete them there by hand, such as in Keychain Access on a Mac,
     naming each by the part before the slash as its service and the part after as its account.
   - Where `failed` names settings, say "Evalation could not read which keys it kept on this
     machine, so they may still be in its password store. Delete them there by hand, such as in
     Keychain Access on a Mac. Each has the service evalation-plugin, or evalation on an older setup,
     and an account ending in installation-key, receiving-key or receiving-key-previous. Where this
     machine also runs the Evalation engine, leave the entries the engine uses."
   - Where conversations were chosen, say how many conversations were deleted, from
     `history.removed`, saying "one conversation was deleted" where it is one. Where
     `history.kept_by` is `claude-code` and `history.kept_live` is one, say "This conversation,
     which is still open, was kept. Close it and it stays in Claude Code's history like any other."
     Where it is two, say "This conversation and one other still open in Claude Code were kept. Both stay in Claude Code's history like any other." Where it is more than two, say "This conversation and <K> others still open in
     Claude Code were kept. Each stays in Claude Code's history like any other.", with <K> one less
     than `history.kept_live`. Where `history.kept_by` is `last-hour` and `history.kept_live` is
     one, say "This conversation was kept, since Evalation cannot tell whether it is still open.
     Close it and it stays in Claude Code's history like any other." Where it is more than one, say
     "<K> conversations that changed in the last hour were kept, this one among them, since
     Evalation cannot tell which are still open. Each stays in Claude Code's history like any
     other.", with <K> as `history.kept_live`. Where `failed` names history, say the conversations
     could not be deleted.

   Then say the plugin cannot uninstall itself, and give the one last step:

   ```
   /plugin uninstall evalation-plugin@evalation
   ```
