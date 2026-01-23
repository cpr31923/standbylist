Step-by-step workflow
1. Decide the unit of work
    Before starting:
     Is this a single feature, bug, or refactor?
     If yes → proceed.
     If not (it’s multiple unrelated things) → split into multiple updates.
Each update should be independently reviewable and reversible.

2. Prepare the change request
Create a request using the Change Request Template.
This includes:
    Goal
    Acceptance criteria
    Files in scope
    Current behaviour (if applicable)
    Desired behaviour
    Repro steps (if bug)
    Output format
    Current file contents
This makes the update deterministic and prevents scope creep.

3. Start a new code chat
    Create a fresh chat for each update.
    At the top of the chat:
        Paste the Context Pack (or lite version if appropriate).
        Paste the Change Request underneath it.
This ensures ChatGPT always has the full current mental model before writing code.

4. Apply the patch locally
After ChatGPT responds:
    Apply the patch in your editor.
    Read through it (don’t blindly trust it).
    Make sure:
        it matches acceptance criteria,
        it doesn’t touch files outside scope,
        it doesn’t reintroduce removed functionality.

5. Validate
Run / test the change:
    Does the bug no longer reproduce?
    Does the feature behave as specified?
    Does anything unrelated break?
    If something’s off:
        Continue in the same chat until this specific change is complete.
        Do not start a new chat until the current change is stable.

6. Generate the State Update
Once the change is working, ask ChatGPT:
    “Give me a 3–5 bullet State Update to paste into docs/notes.md.”
    This summary should include:
        what changed,
        what now works,
        what remains undone (if relevant).
    This becomes the permanent memory of the change.

7. Record the State Update
    Paste the State Update into docs/notes.md under:
    “Current build status” or
        a dated changelog section (if you add one).
    This is now the authoritative record.

8. Close the chat
Once recorded:
    Do not reuse the chat for the next change.
    Start fresh next time.
    This prevents context drift and contradictions.