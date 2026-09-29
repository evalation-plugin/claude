---
description: Sign in to Evalation with Google or Microsoft.
---

# Sign in

Nothing else here works until this runs. Every other command proves itself with a key this
installation holds, and it holds none until it has one, which is what signing in is for.

The person may know none of that, and needs none of it. Never mention keys, installations or digital
signatures to them.

**Ask every question through the host's question interface**, the AskUserQuestion tool in Claude
Code, with two to four answers as its options. Never write a question and its answers as a list in
text. Word each question so nobody has to guess what an answer does. Ask what will happen, never what
to leave out. A tick always means yes to that option, and each answer's label says what choosing it
does.

## What to do

1. **Check the machine first**, before saying or asking anything. When `/ev-start` ran this, it has
   just checked, so skip to step 2.

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

   Read its first line. At `state: not-set-up`, go on to step 2, including where a `sign-in: damaged`
   line follows, since signing in again replaces a damaged sign-in. At any other state this machine
   is signed in already: say "This machine is already signed in to Evalation." and run
   `/ev-account`, then stop. Ask nothing and open no browser.

2. **Say what signing in is**, once: "You sign in with Google or Microsoft in your browser.
   Evalation never sees your password, and your sign-in is kept on this machine where only you can
   read it."

3. **Ask which provider**, as "Which account will you sign in with?", with the answers "Google",
   described as "Google, including Google Workspace work accounts", and "Microsoft", described as
   "Microsoft, personal or work accounts". Say once, beside the question, that other ways to sign
   in are not offered yet, and that anyone with neither account can contact support@evalation.ai. Ask
   even where one was named earlier in this conversation: an attempt that already failed is a
   reason to ask again and never a reason to assume, because the provider is the most likely thing
   to have been wrong. Where one has already failed, say which and what it said, and offer the
   other first.

4. **Tell them a browser is about to open and how to stop the wait**, then run it with the provider
   they named. Say: "A browser is about to open so you can sign in. If the browser shows an error
   and no sign-in page, press Esc to stop waiting, then tell me what the browser says." Whatever the
   provider does happens in a browser this command cannot see, so a refusal there never reaches it.

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate google
   ```

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate microsoft
   ```

   Run it with the Bash tool's timeout set to 360000 milliseconds. It waits up to five minutes for
   them to finish, and the Bash tool's own timeout of two minutes would stop it while they are still
   signing in. The wait is not a hang, so never run it a second time alongside the first.

5. **Read what it printed.** On success it prints `signed_in_as`. Where that holds an email, say
   "Signed in as <email>. This machine is ready." Where it is empty, say "This machine is ready."
   Then say "Another computer signs in separately with the same account, at no extra cost." Never
   show the `installation` name it also prints.

6. **Give the one next step.** When `/ev-start` ran this, say nothing more and go back to it. Run on
   its own, say "Next, run /ev-packs to choose what your code is checked against."

## When it does not work

Read the prefix of the line it printed, never guess, and say the plain line given here. Each one
tells the person that nothing was created, so a person who fears a half made account need not go
looking for one, and each ends on the one thing to do next.

- **Esc pressed.** The command then prints nothing you can read. Never report it as a timeout. Ask
  "The sign-in was stopped. What would you like to do?" with the answers "Tell you what the browser
  showed", "Sign in again" and "Stop for now". On the first, ask them to type what the browser
  says, then act on it. On "Sign in again", go back to step 3. On "Stop for now", say "Nothing was
  created. Run /ev-activate when you are ready to sign in."
- **`stopped`** means the wait was stopped from outside, the same as Esc. Act as for Esc.
- **`could not open a browser`** is not a failure. It prints the address instead. Give them the
  address and tell them to open it themselves. It carries on waiting.
- **`sign-in-refused`** means they declined at the provider's page, or the provider did. Say
  "The sign-in was declined, so nothing was created." Then ask "Which account will you sign in with
  now?" with the answers "Sign in with Google", "Sign in with Microsoft" and "Stop for now", putting
  the provider that was not just declined first, and run step 4 with the one chosen. On "Stop for
  now", say "Run /ev-activate when you are ready to sign in."
- **`timed-out`** means the five minutes ran out. Say "The sign-in was not finished within five
  minutes, so nothing was created. Run /ev-activate to try again."
- **`refused`** carries the server's or the provider's own words after the status. If those words
  name a redirect or a reply URL, the fault is our setup and not anything they did. Say "Evalation
  could not finish the sign-in because of a fault on our side, so nothing was created. Contact
  support@evalation.ai and we will fix it." Do not have them try again, because that will fail the
  same way. Otherwise, say what the words mean in plain English, that nothing was created, and
  "Run /ev-activate to try again."
- **`no-code`** means the provider sent them back without finishing. Say "The sign-in came back
  unfinished, so nothing was created. Run /ev-activate to try again."
- **`wrong-sign-in`** means what came back was not the sign-in that went out. Say "The sign-in that
  came back did not match the one that started, so nothing was created. Run /ev-activate to try
  again." If it happens twice, say "This should not happen twice. Contact support@evalation.ai."
  and stop.
- **`no-listener`** means this machine would not let the sign-in wait for the browser. Say "This
  machine stopped the sign-in from waiting for your browser, so nothing was created. Run
  /ev-activate to try again." If it happens twice, say "Something on this machine is blocking the
  sign-in. Contact support@evalation.ai." and stop.
- **`no-key-store`** means this machine has nowhere safe to keep what signing in creates. Say "This
  machine has no password store Evalation can use, so nothing was created. Run the line below in a
  terminal so Evalation keeps your sign-in in a file only you can read, then close and reopen Claude
  Code and run /ev-activate again." Give the one line for their shell:

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
- **`already-holds-a-key`** only comes from a sign-in run under a chosen name. Say "This machine is
  already signed in under that name. Run /ev-account to see its pack credits." and stop.
- **`sign-in-unclear`** means this machine would not let Evalation read its sign-in. Say
  "Evalation could not read this machine's sign-in, so nothing was changed. Unlock this machine's
  password store, then run /ev-activate again. If it still fails, contact support@evalation.ai."
- **`already-activated`** means this machine is signed in already. Do not remove anything to get
  past it. Say "This machine is already signed in to Evalation." and run `/ev-account`.
- **`unreachable`** is our server or their network. Say "Evalation could not be reached, so nothing
  was created. Check this machine is online, then run /ev-activate again."
- **`unreadable answer`** means our server answered with something broken. Say "Evalation sent back
  an answer it could not read, so nothing was created. Run /ev-activate to try again." If it
  happens twice, say "Evalation is not answering properly. Contact support@evalation.ai." and stop.

## What this never does

The two private keys are made on their machine and never leave it. What crosses is the public halves.
Nothing bearing is minted anywhere in the flow, so there is no token in the middle to steal.

The code from the provider comes back to a port on their own machine and nowhere else. There is no
page of ours anywhere in the sign-in, so there is nothing of ours for anybody to be phished by, and
it needs no inbound access to the machine they are sitting at.

Never print a key, and never write the settings file by hand to make something work. A settings file
nothing signed in to create names an installation the server has never heard of, and every ask it
makes will be refused for a reason that looks like something else.
