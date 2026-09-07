---
description: Activate this installation by signing in, so it holds the keys everything after this proves itself with.
---

# Activate this installation

Nothing else here works until this runs. Every other command proves itself with a key this
installation holds, and it holds none until it has one, which is what activating is.

Signing in is what stands in for the key that does not exist yet. The person signs in with their own
provider, in their own browser, and what comes back is enough to create an installation against their
account. From then on every call is signed and nothing is presented again.

## What to do

1. **Run it**, naming the provider. `google` where none is named.

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate google
   ```

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-activate microsoft
   ```

   A browser opens on the provider's own sign-in page. Where it cannot open one, the command prints
   the address to visit instead.

2. **Wait for it.** It prints the installation it created and the account it was signed in as.

3. **If it fails**, say what it said and stop. Nothing was created, so signing in again costs
   nothing, but running it a second time on the assumption it will work is how a real refusal gets
   read as a glitch.

## What to know

**A second machine is a second installation**, and it takes its own activation. What is billed is
usage against an account, and one account holds as many installations as it needs.

**Already activated refuses rather than replacing.** Activating twice on one machine would create a
second installation to be billed for while the first still exists. Removing the settings file and the
keys beside it is what makes activating again possible, and it is deliberate work rather than a flag.

## What it never does

The two private keys are generated on this machine and never leave it. What crosses is the public
halves, so there is nothing in transit worth taking and nothing on our side that could impersonate
this installation.

The code the provider issues comes back to a port on this machine and nowhere else. There is no page
of ours anywhere in the sign-in, so there is nothing of ours to be phished by.

No password reaches us and none is asked for. The provider answers who the person is, and what we
keep is a name to invoice.
