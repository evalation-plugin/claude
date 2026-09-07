---
description: Activate this seat by running the Evalation login flow and storing the device-bound seat token in the OS keychain.
---

# Activate the seat

Activation runs the server auth flow and stores a device-bound seat token in the operating system's
own keychain. Nothing is written into the repository and no token reaches this conversation.

## What to do

1. **Run the login helper.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-login
   ```

   It opens a browser and waits on a loopback address on this machine. Tell the user to complete
   sign-in there.

2. **If the helper is not found**, say the plugin is not installed or its root did not resolve, and
   stop. Do not attempt the flow by hand and never ask for a token in the conversation: a token
   pasted into a transcript is a token in a log.

3. **Confirm where it stands** once it returns.

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-status
   ```

4. **Say what is next.** With an active seat, `/ev-packs` chooses what this installation assesses
   against. Nothing else has to be set up.

## What activation does not do

It installs nothing into the repository, changes no files, and injects nothing into this session.
The seat is what lets the methodology be served for a run, and it does nothing until a run asks for
it.
