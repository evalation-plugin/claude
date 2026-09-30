---
description: "Your Evalation account: pack credits left and the packs you chose."
allowed-tools: Bash(evalation-status:*), Bash(evalation-packs chosen:*), Bash(evalation-say:*)
---

# Your account

**Every line you say comes from the plugin.** Where this file names a line as `evalation-say <name>`,
run exactly that and show its output exactly as printed, with nothing added. Where the line has a
blank such as `<titles>`, pass its value as `titles=<value>`, for example
`evalation-say ev-account.credits credits=12`. Never write a line of your own for the person.

## What to do

1. **Ask the server, never infer it.**

   ```
   evalation-status
   ```

   There is no local answer to this. The server proves the account by verifying a signature it holds
   the public half of, so a cached answer would report an account that lapsed an hour ago as live.
   Report what it returns and never infer the account's state from whether anything appeared in this
   conversation.

2. **Show what is next, going by the `state:` line.** Each case below is the whole reply for that
   state.

   - `state: not-set-up` with a `sign-in: damaged` line: `evalation-say ev-account.damaged`, or
     where a `signed in as:` line names the account, `evalation-say ev-account.damaged-named` with
     that email as `email`
   - `state: not-set-up` alone: `evalation-say ev-account.not-set-up` and nothing more. It is the
     normal path and not a fault, and explaining that nothing is wrong is what makes a person think
     something is.
   - `state: unreachable`: `evalation-say ev-account.unreachable`
   - `state: not-live`: the line for its `reason:` line.
     - `reason: clock`: `evalation-say ev-account.clock`
     - `reason: refused`: `evalation-say ev-account.refused`
     - `reason: ended`: `evalation-say ev-account.ended`
     - `reason: other`: `evalation-say ev-account.other`
     - `reason: awaiting-approval`, `declined`, `removed`, `machine-awaiting-approval` or `machine-declined`: show the text after `said: ` exactly as printed.
   - `state: live`: follow the steps under the heading for a live account.

## A live account

Show these lines in order, as one reply, and nothing else.

1. Where it prints `signed in as:`, open with `evalation-say ev-account.signed-in`, passing the email
   as `email`. Where it does not, name no account and say nothing about its absence. A machine set
   up before the account was recorded does not print it.

2. Read <N> from the `pack credits left` line, exactly as it comes back, and show
   `evalation-say ev-account.credits` with <N> as `credits`. Where <N> is 1, show
   `evalation-say ev-account.credits-one` in its place. Where the line is absent, show
   `evalation-say ev-account.credits-unread` and name no number of your own.

3. Read what is selected with `evalation-packs chosen`. It prints `titles`, the chosen packs'
   titles already joined, and `packs`, how many there are, which is <M>. Then show one of these,
   passing <M> as `count` and `titles` exactly as printed:

   - No packs selected: `evalation-say ev-account.no-packs`. Where <N> is 0, add
     `evalation-say ev-account.buy`.
   - Packs selected: `evalation-say ev-account.chosen`. With one pack, show
     `evalation-say ev-account.chosen-one` in its place.
   - In place of the line above, where <N> is below <M>: `evalation-say ev-account.short`, or with
     one pack, `evalation-say ev-account.short-one`.

   Where `evalation-packs chosen` exits with any code but 0, whatever its first word, show
   `evalation-say ev-account.packs-unread` in place of these lines and show nothing of what it
   printed.

## What this never does

It reads nothing in the repository, and it prints nothing of the installation key. The key proves
this installation is itself and stays on this machine where only this person can read it, never in
the settings and never in a transcript.
