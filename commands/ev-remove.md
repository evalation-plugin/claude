---
description: Remove Evalation from this machine. Signs this machine out, deletes what Evalation saved here, and offers to delete the Claude Code conversations that ran an Evalation command.
allowed-tools: Bash(evalation-status:*), Bash(evalation-remove folders:*), Bash(evalation-remove sets:*), Bash(evalation-remove run:*), Bash(evalation-questions keep-on-account:*), Bash(evalation-say:*)
---

# Removing Evalation from this machine

For a consultant leaving a customer's machine, or anyone who no longer wants Evalation here. The
account stays, with its pack credits and any question sets kept on it, and so do the reports in
Documents. Only this machine's sign in and what Evalation kept on it go. Other machines signed in to
the account are unaffected.

Every line the person reads comes from `evalation-say` or from a script, and you show it exactly as
printed, never in words of your own. Where a step names several lines, run each and show them
together as one paragraph, in the order given. A value such as <places_named> is that field of
what `evalation-remove` printed, passed as it is.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, passing the `questions` a command prints unchanged. Never write a question and its answers as
a list in text. Where the person picks Other and writes their own words, act on them where they
plainly choose one of the answers. Otherwise show `evalation-say ev-remove.other` and stop.

Never show the person a path inside Evalation's own folder, or any field name from what a command
prints.

## What to do

1. **Check what can be signed out.**

   ```
   evalation-status
   ```

   - `state: unreachable`: show `evalation-say ev-remove.unreachable` and stop.
   - `state: not-set-up` with a `sign-in: damaged` line: the sign in is damaged, so Evalation cannot
     sign this machine out. Go on, and in step 2 open with `evalation-say ev-remove.damaged`.
   - `state: not-set-up` otherwise: this machine holds no sign in, so there is nothing to sign out.
     Go on, and in step 2 open with `evalation-say ev-remove.not-signed-in`.
   - `state: not-live` with `reason: clock`: show `evalation-say ev-remove.clock` and stop.
   - `state: live`, or `state: not-live` for any other reason: go on.

2. **Say what will be removed, then ask.**

   ```
   evalation-remove folders
   ```

   Where the state was `live`, also run:

   ```
   evalation-remove sets
   ```

   It prints `none`, or the question about question sets saved only on this machine, with their
   names in `sets`. Keep it for later in this step. Where it fails with `unreachable`, show
   `evalation-say ev-remove.unreachable` and stop.

   Where the state was `live` or `not-live`, show `evalation-say ev-remove.sign-out` and
   `evalation-say ev-remove.folder`.

   Where the state was `not-set-up` and `home_exists` is true, after the opening line step 1 gave,
   show `evalation-say ev-remove.folder-local`.

   Where the state was `live` or `not-live` and `home_exists` is false, leave out the lines about
   the folder and show `evalation-say ev-remove.nothing-saved` in their place.

   Where the state was `not-set-up` and `home_exists` is false, show only
   `evalation-say ev-remove.nothing-else` after the opening line step 1 gave, never
   `ev-remove.nothing-saved` as well, and ask nothing more in this step: go on to step 3 where
   `conversations` is more than zero, or straight to the last step of step 5 where it is zero.

   Where `reports_named` is not null, show
   `evalation-say ev-remove.old-reports reports="<reports_named>"`.

   Then run `evalation-say ev-remove.remove` and ask the question it prints. Where the state was
   `not-set-up`, run `evalation-say ev-remove.remove-local` in its place. On `Keep it`, show
   `evalation-say ev-remove.nothing-changed` and stop.

   On `Remove it`, ask the question `evalation-remove sets` printed, where it printed one.

3. **Offer to delete the conversations that used Evalation.** Where `conversations` is more than
   one, show `evalation-say ev-remove.conversations count="<conversations>" places="<places_named>"`.
   Where there is one, show `evalation-say ev-remove.conversation folder="<folder>" from="<from>"`,
   with the `folder` and `from` of the one entry in `places`.

   Where `open_by` is `claude-code`, add `evalation-say ev-remove.open-one` where `open` is one, or
   `evalation-say ev-remove.open-many count="<open>"` where it is more. Where `open_by` is
   `last-hour`, add `evalation-say ev-remove.recent-one` where `open` is one, or
   `evalation-say ev-remove.recent-many count="<open>"` where it is more.

   Then run `evalation-say ev-remove.clear` and ask the question it prints. Where `conversations`
   is zero, ask nothing about conversations. Never delete anything else, and never anything in the
   folder this session runs in. Where step 2 found Evalation has nothing else on this machine and
   they chose `Keep them`, go straight to the last step of step 5.

4. **Remove it.** Where they chose `Keep on my account`, first run this for each name in `sets`:

   ```
   evalation-questions keep-on-account <name>
   ```

   On success it prints one line for the set: show it exactly as printed.

   Where it fails and the reason says the set `is not kept on the account, since`, the set fails
   its check. Show each listed problem exactly as printed, then run
   `evalation-say ev-remove.set-fails set="<name>"` and ask the question it prints. On
   `Stop so I can fix it`, show `evalation-say ev-remove.fix-set` and stop. Where it fails for any
   other reason, show `evalation-say ev-remove.set-not-kept set="<name>"` and stop.

   Then run:

   ```
   evalation-remove run [--clear-history]
   ```

   Add `--clear-history` where they chose `Delete them`. It signs the machine out before it deletes
   anything. Where it fails, read the start of the reason:

   - `unreachable`: show `evalation-say ev-remove.run-unreachable` and stop.
   - `refused`: show `evalation-say ev-remove.run-refused` and stop.

5. **Say what was removed and give the last step.** From what `run` printed, show these lines
   together:

   - Where `signed_out` is `now`, show `evalation-say ev-remove.signed-out`. Where it is `already`, show `evalation-say ev-remove.already-out`, unless step 2 already said this machine is not signed in. Where it is `not-revoked`, show `evalation-say ev-remove.not-revoked`, unless step 2 already said the sign-in is damaged.
   - Where `folder_deleted` is true and `home_exists` was true in step 2, show
     `evalation-say ev-remove.folder-deleted`. Where it is false, show
     `evalation-say ev-remove.folder-left`.
   - Where `keys_left` names one key, show `evalation-say ev-remove.key-left keys="<keys_named>"`.
     Where it names more, show `evalation-say ev-remove.keys-left count="<count>" keys="<keys_named>"`,
     with <count> the number of keys in `keys_left`.
   - Where `failed` names settings, show `evalation-say ev-remove.keys-unread`.
   - Where conversations were chosen, show `evalation-say ev-remove.deleted count="<removed>"` with
     `history.removed` as <removed>, or `evalation-say ev-remove.deleted-one` where it is one. Where
     `history.kept_by` is `claude-code`, show `evalation-say ev-remove.kept-this` where
     `history.kept_live` is one, `evalation-say ev-remove.kept-two` where it is two, or
     `evalation-say ev-remove.kept-more count="<others>"` where it is more, with <others> one less
     than `history.kept_live`. Where `history.kept_by` is `last-hour`, show
     `evalation-say ev-remove.recent-this` where `history.kept_live` is one, or
     `evalation-say ev-remove.recent-more count="<kept>"` where it is more, with <kept> as
     `history.kept_live`. Where `failed` names history, show
     `evalation-say ev-remove.history-failed`.

   Then show `evalation-say ev-remove.uninstall`, and give the one last step:

   ```
   /plugin uninstall evalation-plugin@evalation
   ```
