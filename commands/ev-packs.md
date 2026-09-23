---
description: Choose which packs this installation assesses against - compliance, regulation and hardening.
---

# Choose the packs

A pack is one subject a run reads a repository against: a published standard such as SOC 2 or the
EU AI Act, a set of concerns such as hardening or cyber, or a composition authored for one use such
as a review for insurance underwriting or for an investor reading a codebase against what its
founder claims of it. Any number may be selected, and selecting several is the ordinary case.

A run spends one pack credit for each pack it reads, so what is selected here is what a run costs.
Four packs is four credits every time that selection is run.

## What to do

1. **Show what is selected now.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs show
   ```

2. **Ask before changing it.** If a selection already stands, ask whether to keep it or choose
   again, and stop there if they keep it. A selection silently replaced is one nobody agreed to, and
   what was assessed against is evidence and not a preference.

3. **Fetch the catalogue.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs list
   ```

   `not-entitled` means the seat is not active: tell them to run `/ev-activate` and stop. `unavailable`
   means the server could not be reached: say so plainly and stop. Never invent a catalogue, and
   never offer a pack the fetch did not return.

4. **Ask which packs they want**, using this host's own question interface where it has one, offering
   exactly what the catalogue returned. Name each pack by its `title` exactly as served, so SOC 2
   reads "SOC 2 Trust Services Criteria" and never `soc2`. The handle is what `set` takes and never
   what a person is shown. Say what each pack is in one line, in their words and not ours, so
   somebody choosing between SOC 2 and ISO 27001 can tell which they need.

   Say what the selection they are making will cost, one credit per pack, and how many credits they
   have, which `${CLAUDE_PLUGIN_ROOT}/bin/evalation-status` prints. Somebody choosing five packs
   against three credits is refused at the run and is better told here.

5. **Record it.**

   ```
   ${CLAUDE_PLUGIN_ROOT}/bin/evalation-packs set <pack> [<pack>...]
   ```

6. **Say where it landed** and that it is theirs to read and to keep beside their findings.

7. **Say what is next**, which is `/ev-run` to read a repository against what they chose. The
   selection can be changed whenever they like, and a run can name its own packs to override it.

## What this never does

It reads nothing in the repository and writes nothing into it. The selection lives in the customer's
own configuration and never in the tree being assessed, because that tree is the subject and writing
into it would change the thing this product exists not to touch.
