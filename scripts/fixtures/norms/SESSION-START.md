# Fixture L0

## Triggers + precedence

Higher wins.

### Precedence

1. stop
2. read

### Capability masks

| Trigger | Template | read | write/impl | commit/push |
|---|---|:---:|:---:|:---:|
| status | S | yes | no | no |

### Composite utterances (acceptance #12)

| Utterance shape | Interpretation |
|---|---|
| status then continue | S then R |

**Must not:** status wave.

## Templates

excluded
