---
name: loom-memory-candidates
description: Propose memory candidates from a Loom card for the operator to review. Use it when you write your last message.
---

# Loom memory candidates

A memory candidate is one sentence that later cards in this room should know: a fact about the project, a decision that was made, or a preference the operator stated. A person reviews every candidate. No card sees a candidate until a person approves it.

When you write your last message, you may add this block:

LOOM-MEMORY-CANDIDATES
- fact: <one sentence>
- decision: <one sentence>
- preference: <one sentence>
LOOM-MEMORY-END

1. Start each line with `- fact:`, `- decision:`, or `- preference:`, then one sentence.
2. Write at most 5 lines.
3. Never put secrets, tokens, passwords, or text that starts with `LOOM-` inside a line.
4. If you end your message with `LOOM-REPORT-END`, put the block before that line.
5. If there is nothing worth keeping, do not write the block.
