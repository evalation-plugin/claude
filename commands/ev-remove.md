---
description: Remove Evalation from this machine. Revokes this machine's sign-in, deletes its keys and the hidden evalation folder, and offers to clear Claude Code's history of what was read.
allowed-tools: Bash(evalation-remove:*)
---

# Removing Evalation from this machine

For a consultant leaving a customer's machine, or anyone who no longer wants Evalation here. The
account stays, with any question sets kept on it, and so do the reports already printed to
Documents. Only this machine's link to the account and what Evalation kept on it go.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with each answer one of its options. Never write a question and its answers as a list in text.
Word each question so nobody has to guess what an answer does. Ask what will happen, never what to
leave out, and let each answer's label say what choosing it does.

## What to do

1. **Say what will be removed, then ask.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-remove folders
   ```

   Say in a few lines: this machine's sign-in is revoked on the server, so its key stops working
   everywhere. Its keys are deleted from the operating system's store. The hidden folder `home`
   names is deleted, with the findings files, scans, pack choice and question sets kept on this
   machine. Reports in Documents stay, and question sets kept on the account stay with the account.
   Then ask "Remove Evalation from this machine?", with the answers "Remove it" and "Keep it".
   On "Keep it", stop. Nothing was changed.

2. **Offer to clear Claude Code's history.** Where `history` names any folder, list them and say
   that Claude Code keeps each conversation held in those folders, including what the reading said
   about the code. Ask "Also clear Claude Code's history for these folders?", with the answers
   "Clear it" and "Leave it". Clearing deletes those folders' conversations and their lines in
   Claude Code's prompt history, and nothing of any other folder. Where `history` is empty, ask
   nothing about it.

3. **Remove it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-remove run [--clear-history]
   ```

   With `--clear-history` only where the person chose "Clear it". It revokes first, and where the
   server cannot be reached it removes nothing, since the keys on this machine are the only thing
   that can revoke it: say so, and that running `/ev-remove` again once the machine is online
   finishes it.

4. **Say what was removed and what is left to do.** Name the keys forgotten, the folder deleted and
   any history cleared, from what `run` printed. Then say that the plugin cannot uninstall itself,
   and give the last step:

   ```
   /plugin uninstall evalation
   ```

   Where the history was cleared, say that this conversation is still open and ends when the session
   is closed.
