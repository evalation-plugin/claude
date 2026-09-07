---
description: Sign in, so this machine holds the keys everything else proves itself with.
---

# Sign in

Nothing else here works until this runs. Every other command proves itself with a key this
installation holds, and it holds none until it has one, which is what signing in is for.

The person may know none of that. Tell them what is about to happen before it happens: a browser
window opens on their own provider's sign-in page, they sign in there, and the window closes itself.
No password comes near us. Their machine makes two keys and keeps both private halves, so nothing
that could impersonate them ever leaves it.

## What to do

1. **Ask which provider.** Google and Microsoft are the two. Ask even where one was named earlier in
   this conversation: an attempt that already failed is a reason to ask again rather than a reason to
   assume, because the provider is the most likely thing to have been wrong. Where one has already
   failed, say which and what it said, and offer the other first.

2. **Tell them a browser is about to open**, then run it with the provider they named.

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate google
   ```

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate microsoft
   ```

   It waits up to five minutes for them to finish. That is not a hang, so do not run it a second time
   alongside the first.

   **Tell them to watch the browser and speak up.** Whatever the provider does happens in a browser
   this command cannot see, so a refusal there never reaches it and the wait runs its full length with
   nothing to report. Say plainly: if the browser shows an error rather than a sign-in page, stop this
   and say what it said. Then act on what they tell you rather than waiting the clock out.

3. **Read what it printed and say it in their words.** On success it names the installation it
   created and the account it signed in as. Tell them this machine is now set up, and that a second
   machine is a second installation with its own sign-in.

4. **Say what is next**: `/ev-packs` to choose what to be assessed against, or `/ev-start` to be
   walked through the rest.

## When it does not work

Read the reason it printed rather than guessing, and tell the person the one thing that would change
it.

- **`could not open a browser`** is not a failure. It prints the address instead. Give them the
  address and tell them to open it themselves. It carries on waiting.
- **`sign-in-refused`** means they declined at the provider's page, or the provider did. Nothing was
  created. Ask whether they meant to, and offer to run it again.
- **`already-activated`** means this machine is set up already. Do not remove anything to get past
  it: run `/ev-account` and tell them where the seat stands. A second installation on one machine is
  a second thing to be billed for, which is why it refuses rather than replacing.
- **`the provider would not exchange the code`** carries the provider's own words after it. If those
  words name a redirect or a reply URL, the fault is our registration rather than anything they did:
  say so, say it needs us, and stop. Do not have them try again, because that will fail the same way.
- **`unreachable`** is our server or their network. Say which it looks like and stop.
- **`wrong-sign-in`** means what came back was not the sign-in that went out. Nothing was created.
  Run it again, and if it happens twice, stop and say so, because it should not happen twice.

Whatever the failure, **nothing was created and nothing needs undoing.** Say that, because a person
who thinks a half-made account is sitting somewhere will go looking for it.

## What this never does

The two private keys are made on their machine and never leave it. What crosses is the public halves.
Nothing bearing is minted anywhere in the flow, so there is no token in the middle to steal.

The code from the provider comes back to a port on their own machine and nowhere else. There is no
page of ours anywhere in the sign-in, so there is nothing of ours for anybody to be phished by, and
it needs no inbound access to the machine they are sitting at.

Never print a key, and never write the settings file by hand to make something work. A settings file
nothing signed in to create names an installation the server has never heard of, and every ask it
makes will be refused for a reason that looks like something else.
