<div align="center">
  <h1>@itsmeyaw/n8n-nodes-typesafe</h1>
  <p>
    <a href="https://www.npmjs.com/package/@itsmeyaw/n8n-nodes-typesafe"><img src="https://img.shields.io/npm/v/@itsmeyaw/n8n-nodes-typesafe.svg" alt="npm version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/npm/l/@itsmeyaw/n8n-nodes-typesafe.svg" alt="license"></a>
  </p>
  <p>
    <img src="https://raw.githubusercontent.com/itsmeyaw/n8n-nodes-typesafe/main/.github/assets/screenshots/main-showcase.png" alt="TypeSafe AI node showcase">
  </p>
  <p>Make fast, typed decisions in n8n with <a href="https://typesafe.ai/">TypeSafe AI</a>'s Jev model. Classify, score, or evaluate yes/no questions, then route confident results automatically and send uncertain cases for review.</p>
  <p><strong>Ideal for:</strong> support triage, approvals, eligibility checks, guardrails, and AI Agent decisions that need a bounded answer instead of generated prose.</p>
</div>

## Installation

This is currently an **unverified community node** and is available for self-hosted n8n.

In n8n, open **Settings > Community Nodes**, select **Install**, and enter:

```text
@itsmeyaw/n8n-nodes-typesafe
```

See n8n's [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/) for other installation methods.

## Features

- Choice, Score, and Yes/No decisions
- Guided fields or raw TypeSafe question objects
- Confidence-aware Choice, Pass/Fail, Yes/No, and Review outputs
- Live model discovery with support for pinned model IDs
- Full response, simplified answers, or results appended to the input item
- Configurable timeout, Base URL, output field, and request ID tracing
- Native n8n AI Agent tool support

## Showcase

<div align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/n8n-nodes-typesafe/main/.github/assets/screenshots/routing.png" alt="Routing node" width="75%">
  <br>
  <em>Example: Route support tickets to the right team while sending uncertain decisions to Review.</em>
</div>
<br/>
<br/>
<div align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/n8n-nodes-typesafe/main/.github/assets/screenshots/scoring.png" alt="Scoring" width="75%">
  <br>
  <em>Example: Score incoming tickets and route high-priority cases automatically.</em>
</div>
<br/>
<br/>
<div align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/n8n-nodes-typesafe/main/.github/assets/screenshots/yes-no-setting.png" alt="Yes-no" width="75%">
  <br>
  <em>Example: Configure a Yes/No decision with explicit criteria for both outcomes.</em>
</div>

## Credentials

Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys), then add a **TypeSafe AI API** credential in n8n.

Leave **Base URL** set to `https://api.typesafe.ai` unless you use a trusted HTTPS proxy or dedicated deployment. The credential test and model picker check the configured Base URL.

## Operations

### Evaluate Questions

Evaluate one or more Choice, Score, or Yes/No questions in a single request. Use **Guided** input for common cases or **Raw JSON** for structured instructions and criteria.

```json
{
 "team": {
  "type": "choice",
  "instructions": "Which team should handle this ticket?",
  "criteria": {
   "Billing": "Payments, invoices, charges, or refunds",
   "Technical": "Bugs, outages, or integrations"
  }
 },
 "urgent": {
  "type": "noul",
  "instructions": "Does this need action today?"
 }
}
```

With **Simplify** enabled, the answers become easy-to-use values:

```json
{
 "team": "Billing",
 "urgent": 0.91
}
```

### Decide and Route

Turn one decision directly into workflow branches:

| Decision                         | Outputs                         |
| -------------------------------- | ------------------------------- |
| Choice                           | One output per configured route |
| Yes/No                           | Yes, No                         |
| Score                            | Pass, Fail                      |
| Low confidence                   | Review                          |
| Continued failure without Review | Error                           |

Route names determine canvas output order. Recheck connections after renaming or reordering routes.

## Examples

- [Support routing with human review](examples/ticket-routing.workflow.json)
- [Multi-question evaluation](examples/multi-question-evaluate.workflow.json)
- [AI Agent decision tool](examples/ai-agent-tool.workflow.json)

Import a workflow, then select your TypeSafe credential. The AI Agent example also requires a chat-model credential.

## Usage Notes

- Use `jev-latest` for experiments and pin a versioned model ID for production thresholds.
- Keep state small and relevant. Jev is not intended for text generation, arithmetic, counting, or deterministic business rules.
- One API request is made per input item; questions for that item are batched together.
- **Append to Item** and routed outputs preserve input JSON and binary data. Replacement output modes omit binary data.
- **Continue On Fail** preserves the input and sends routing failures to Review or Error.
- Use n8n's **Retry On Fail** setting for transient `429` or `529` responses.

## Compatibility

- Node.js 20.15 or newer
- Built with `@n8n/node-cli` 0.49.1
- Unverified packages require a self-hosted n8n instance

Test the node against your n8n version before promoting workflows to production.

## Privacy

The node sends the selected state, questions, and model ID to the configured TypeSafe Base URL. Whole-item state includes JSON only, never binary attachments. Send only data required for the decision and review TypeSafe's policies before processing sensitive information.

## Development

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
```

Run `pnpm dev` for a local n8n instance or `TYPESAFE_API_KEY=... pnpm verify:api` for a live API check.

## Resources

- [TypeSafe documentation](https://docs.typesafe.ai/)
- [Jev model documentation](https://docs.typesafe.ai/models)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)
- [Issues and support](https://github.com/itsmeyaw/n8n-nodes-typesafe/issues)

This is an independent community integration and is not an official TypeSafe AI or n8n package.

## License

[MIT](LICENSE)
