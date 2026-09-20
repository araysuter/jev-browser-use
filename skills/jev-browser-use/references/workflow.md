# Host text and reviewed submission

Use this after the navigation loop reaches a form. All values must come from Astra/user intent. The helper intentionally refuses sensitive fields; handle those directly with the host under its normal rules.

```js
var before = await taskTab.getAXState({emit:false, disableDiffing:true});
var filled = await session.fillTextBatch({
  expectedState: before,
  fields: [
    {name:'Name', value:'Astra-authored exact value'},
    {name:'Region', value:'Astra-authored exact value'}
  ]
});
nodeRepl.write({status:filled.status, completed:filled.completed});
```

The whole batch is validated before writing. Each write uses the current index and checks the exact value afterward. Unknown or duplicate fields, inaccessible values, multiline values not represented faithfully by AX, validation messages and other page changes stop the batch. `completed` counts only verified writes. Inspect the current state before continuing; never blindly repeat earlier fields.

Obtain a fresh review and expose it to Astra (review may contain private field values; never save it in logs or forward it to Jev):

```js
var review = await session.reviewForm();
nodeRepl.write(review);
```

Astra must actually inspect the result for the correct account/project, destination, fields, values, warnings and requested action. If text lacks relevant information, use the documented CUA screenshot API and inspect the image. Satisfy any required user confirmation. **Do not combine the review retrieval and approval in one unseen model turn.**

Only then:

```js
session.approveSubmission({review, name:'Save'});
var outcome = await session.run({
  goal:'Save the reviewed preferences and stop when confirmation is visible.',
  controls:[{op:'click', name:'Save', kind:'submit'}],
  policy:{requireCodexNames:['Save']}
});
nodeRepl.write({status:outcome.status, handoff:outcome.handoff, context:outcome.context});
```

A review can mint one approval only. An approval authorizes one exact click attempt, not an entire flow. It cannot override denied actions. Changes to the reviewed snapshot, tab or destination invalidate it; harmless AX index renumbering is tolerated. Any intervening action consumes it, so submit directly after approval. A click error is uncertain: the approval is consumed and must not be replayed. Inspect actual state to learn whether it took effect.

Astra verifies the final result independently. Reading a success-looking page does not prove every cloud resource or deployment is configured correctly; use the evidence required for the user's actual objective.

## Metrics

`outcome.metrics` describes that chunk; `session.metrics()` aggregates the active session. Token totals include reported usage only, with `missingUsage` counting requests that lack a complete usage report. `inputTokens` and `outputTokens` are null when none is available. Failed calls may have unreported charges. No exact Astra token saving or universal speedup can be inferred.

`session.checkpoint(text)` retains host-verified milestones alongside the latest eight decision records in the next request. No extra model summarizes the page. Local full session history remains inspectable with `session.history()` and disappears when reset or the REPL ends.
