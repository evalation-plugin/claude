---
description: Sign in to Evalation with Google or Microsoft.
allowed-tools: Bash(evalation-status:*), Bash(evalation-activate:*), Bash(evalation-say:*)
---

# Sign in

Nothing else here works until this runs. Every other command proves itself with a key this
installation holds, and it holds none until it has one, which is what signing in is for.

The person may know none of that, and needs none of it. Never mention keys, installations or digital
signatures to them.

**Every line you say comes from the plugin.** Where this file names a line as `evalation-say <name>`,
run exactly that and show its output exactly as printed, with nothing added. Where the line has a
blank such as `<email>`, pass its value as `email=<value>`, for example
`evalation-say ev-activate.signed-in email=you@example.com`. Never write a line of your own for the
person.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code. Where this file names a question, run its `evalation-say` line and ask the question it prints
with AskUserQuestion, passing its questions unchanged. Never write a question and its answers as a
list in text. Word each question so nobody has to guess what an answer does. Ask what will happen,
never what to leave out. A tick always means yes to that option, and each answer's label says what
choosing it does.

## What to do

1. **Check the machine first**, before saying or asking anything. When `/ev-start` ran this, it has
   just checked and shown what the state needs, so skip to step 2.

   ```
   evalation-status
   ```

   Read its first line.

   - `state: not-set-up`: go on to step 2. Where a `sign-in: damaged` line follows, first
     `evalation-say ev-activate.damaged`, or where a `signed in as:` line names the account,
     `evalation-say ev-activate.damaged-named` with that email as `email`. Signing in again replaces
     a damaged sign-in.
   - `state: live` or `state: unreachable`: `evalation-say ev-activate.already`, then run
     `/ev-account` and stop.
   - `state: not-live`: run `/ev-account` and say nothing of your own, since it gives the reason and
     the next step. Then stop.

   At a state that stops here, ask nothing and open no browser.

2. **Say what signing in is**, once per conversation: `evalation-say ev-activate.explain`. Skip it
   where its line already appears earlier in this conversation, shown by this command or by
   `/ev-start`.

3. **Ask which provider** with `evalation-say ev-activate.provider`. Where Google said no, offer
   Microsoft first with `evalation-say ev-activate.provider-microsoft-first`. Offer Microsoft first
   only where an attempt with Google in this conversation ended on `sign-in-refused`, `refused`,
   `refused-unrecognised` or `no-code`, or the person said its page declined them or showed an error.
   A failure of this machine or of Evalation's server, such as `unreachable`, `no-listener`,
   `no-key-store`, `timed-out` or `server-error`, keeps the usual order.

   Where they pick Other and name Google or Microsoft, go on with that one. Where they type any
   other way to sign in, show `evalation-say ev-activate.other-way` and ask the same question
   again.

   Ask even where one was named earlier in this conversation: an attempt that already failed is a
   reason to ask again and never a reason to assume. Where the provider has already said no in
   this conversation, in the cases above that put Microsoft first, first show
   `evalation-say ev-activate.failed-before`, passing that provider as `provider`. After a failure
   of this machine or of Evalation's server, show nothing about the earlier attempt.

4. **Start the sign-in in the background**, with the provider they chose.

   ```
   evalation-activate google
   ```

   ```
   evalation-activate microsoft
   ```

   Run it with the Bash tool's `run_in_background` set. It waits up to five minutes for the person,
   and Claude Code shows a command's output only when it ends, so a run in the foreground would hide
   the address they may need. Never start a second one while the first is waiting, and never add
   `--reason`, which adds detail for support alone.

   Read its output as it arrives, until a `sign-in address:` line appears or it ends. Where it ends
   first, go to the part for when it does not work. When the address appears, show the line below
   and give the address on its own line under it:

   - where a `could not open a browser` line follows the address: `evalation-say ev-activate.no-browser`
   - where no such line follows: `evalation-say ev-activate.browser`

   Then, before you wait for it to end, show `evalation-say ev-activate.waiting`. Claude Code tells
   you when it ends.

5. **Where they write while it waits**, match what they wrote to one of these cases and show only
   the lines it names. Never reply about the sign-in in words of your own.

   - Where they say they declined, or the page said access was denied or needs an administrator:
     show `evalation-say ev-activate.declined`, then ask as for `sign-in-refused` below.
   - Where they describe an error page: show `evalation-say ev-activate.error-page`, then ask as for
     `sign-in-refused` below, with the provider whose page showed the error counted as declined.
   - Where they say nothing happened, or no sign-in page appeared: show
     `evalation-say ev-activate.nothing-happened` with the address on its own line under it, and
     leave the sign-in waiting.
   - Where they ask to stop: show `evalation-say ev-activate.stopped-stop` and ask nothing.
   - Where they say they finished, or the page says the sign-in was received: show
     `evalation-say ev-activate.still-waiting` and leave it waiting. Claude Code tells you when it
     ends.
   - Where they ask which account to use: show `evalation-say ev-activate.which-account` and leave
     it waiting.
   - Where they write anything else about the sign-in: show
     `evalation-say ev-activate.still-waiting` and leave it waiting.
   - Where the message is about something other than the sign-in, answer it and leave the sign-in
     waiting.

   Only a decline, an error the page showed or a request to stop ends the sign-in. In those cases,
   first stop the waiting command with the tool that stops a background command, TaskStop in Claude
   Code, and treat the `stopped` line it then prints as expected.

6. **Ask which company this sign-in is for.** Where it prints `question`, ask it with AskUserQuestion,
   passing its questions unchanged. Where they pick the company it offers, or type a name of their
   own, such as a client's, run `evalation-activate company "<answer>"` with the label they picked or
   the words they typed, in double quotes. Where they pick the answer to leave it for now, run
   `evalation-activate company --later`. Where they pick the answer to type the name and type nothing, ask the question again. Where either fails with
   `company-unusable`, show `evalation-say ev-activate.company-unusable` and ask the question again.
   Where it fails with `company-unsent`, show `evalation-say ev-activate.company-unsent` and go on to
   the next step as though it printed nothing. Use what it prints in place of the sign-in's own output
   for the `said` line in the next step.

7. **Read what it printed.** Where it prints `said`, show it exactly as printed in place of the lines below, and stop. It says where the person stands with their organisation's approval and what to do, so give no next step, and when `/ev-start` ran this, it stops too.

   On success it prints `signed_in_as`. Where that holds an email, show
   `evalation-say ev-activate.signed-in` with it as `email`. Where it is empty, show
   `evalation-say ev-activate.ready`. Then show `evalation-say ev-activate.other-computer`. Never
   show the `installation` name it also prints.

8. **Give the one next step.** When `/ev-start` ran this, say nothing more and go back to it. Run on
   its own, show `evalation-say ev-activate.next`.

## When it does not work

Read the prefix of the line it printed, never guess, and show the line named here. Each one tells
the person that nothing was created, so a person who fears a half made account need not go looking
for one, and each ends on the one thing to do next.

- **`stopped`** means the wait was stopped. Never report it as a timeout. Where you stopped it
  because of their message, the case in step 5 has already named what to show, so show nothing
  more. Otherwise ask `evalation-say ev-activate.stopped`. On the answer to sign in again, go back
  to step 3. On the answer to stop, show `evalation-say ev-activate.stopped-stop`. Where they type
  their own answer, match it to the cases in step 5, except that nothing happened goes back to
  step 4 with the same provider.
- **`sign-in-refused`** means they declined at the provider's page, or the provider did. Show
  `evalation-say ev-activate.declined`. Then ask the question that puts the provider not just
  declined first: where Google was not the one declined,
  `evalation-say ev-activate.declined-google-first`, and where Microsoft was not the one declined,
  `evalation-say ev-activate.declined-microsoft-first`. Run step 4 with the one chosen. On the answer
  to stop, show `evalation-say ev-activate.declined-stop`.
- **`timed-out`** means the five minutes ran out. Show `evalation-say ev-activate.timed-out`.
- **`refused`** means the sign-in did not go through for a reason another try can fix. Show
  `evalation-say ev-activate.refused`.
- **`refused-unrecognised`** means the refusal was one the script does not recognise. Show
  `evalation-say ev-activate.refused-unrecognised`.
- **`fault`** means the sign-in is set up wrongly on our side, such as a provider this deployment
  does not offer, and nothing they did caused it. Show `evalation-say ev-activate.fault`. Do not
  have them try again, because that will fail the same way.
- **`server-error`** means Evalation's server failed. Show
  `evalation-say ev-activate.server-error`.
- **`no-code`** means the provider sent them back without finishing. Show
  `evalation-say ev-activate.no-code`.
- **`wrong-sign-in`** means what came back was not the sign-in that went out. Show
  `evalation-say ev-activate.wrong-sign-in`. If it happens twice, show
  `evalation-say ev-activate.wrong-sign-in-twice` and stop.
- **`no-listener`** means this machine would not let the sign-in wait for the browser. Show
  `evalation-say ev-activate.no-listener`. If it happens twice, show
  `evalation-say ev-activate.no-listener-twice` and stop.
- **`no-key-store`** means this machine has nowhere safe to keep what signing in creates. Show
  `evalation-say ev-activate.no-key-store`, then give the one line for their shell:

  ```
  echo 'export EVALATION_KEY_STORE=file' >> ~/.zshrc
  ```

  ```
  echo 'export EVALATION_KEY_STORE=file' >> ~/.bashrc
  ```

  ```
  setx EVALATION_KEY_STORE file
  ```

  The first is for zsh, the default on a Mac, the second for bash on Linux, and the third for
  Windows.
- **`already-holds-a-key`** only comes from a sign-in run under a chosen name. Show
  `evalation-say ev-activate.holds-a-key` and stop.
- **`sign-in-unclear`** means this machine would not let Evalation read its sign-in. Show
  `evalation-say ev-activate.unclear`.
- **`already-activated`** means this machine is signed in already. Do not remove anything to get
  past it. Show `evalation-say ev-activate.already` and run `/ev-account`.
- **`unreachable`** is our server or their network. Show `evalation-say ev-activate.unreachable`.
- **`unreadable answer`** means our server answered with something broken. Show
  `evalation-say ev-activate.unreadable`. If it happens twice, show
  `evalation-say ev-activate.unreadable-twice` and stop.

## What this never does

The two private keys are made on their machine and never leave it. What crosses is the public halves.
Nothing bearing is minted anywhere in the flow, so there is no token in the middle to steal.

The code from the provider comes back to a port on their own machine and nowhere else. There is no
page of ours anywhere in the sign-in, so there is nothing of ours for anybody to be phished by, and
it needs no inbound access to the machine they are sitting at.

Never print a key, and never write the settings file by hand to make something work. A settings file
nothing signed in to create names an installation the server has never heard of, and every ask it
makes will be refused for a reason that looks like something else.
