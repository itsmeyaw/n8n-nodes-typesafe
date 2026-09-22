# @itsmeyaw/n8n-nodes-typesafe

This n8n community node uses [TypeSafe AI](https://typesafe.ai/) to make fast,
structured decisions with Jev. Jev evaluates text or structured state against batched
Choice, Score, and Noul questions and returns probabilities your workflow can use directly.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

## Installation

Follow n8n's [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
and install `@itsmeyaw/n8n-nodes-typesafe`.

## Operation

### Evaluate State with Jev

The node sends one state and one or more questions to TypeSafe's `/v1/systemone` endpoint.
Questions in the same node execute as a batch, which is faster and cheaper than one request
per question.

Use **Guided** question input for ordinary questions:

- **Choice** selects one option and returns its probability distribution and confidence.
- **Score** rates state against 2 to 10 ordered levels.
- **Noul** returns the probability that a yes/no statement is true.

Use **Raw JSON** for structured instructions or criteria. For example:

```json
{
  "department": {
    "type": "choice",
    "instructions": "Which team should handle this?",
    "criteria": {
      "billing": "Payments, invoices, or refunds",
      "technical": "Bugs, outages, or integrations"
    }
  },
  "urgent": {
    "type": "noul",
    "instructions": "Does this message convey urgency?"
  }
}
```

The output contains the resolved model version, every named answer, and token usage.

## Credentials

Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys), then create a
**TypeSafe AI API** credential in n8n and paste the key. Credential testing calls
`GET /v1/models`.

## Usage Notes

- `jev-latest` is the default. Pin a version such as `jev-1.13.0` when workflow thresholds
  depend on stable model behavior.
- Jev is a structured decision model, not a text generator.
- Keep arithmetic, counting, and date comparison in ordinary workflow code.
- Send only state relevant to the questions to reduce context dilution.
- Use n8n's **Retry On Fail** node setting for transient `429` and `529` API responses.

## Compatibility

Built with the official `@n8n/node-cli` and tested against its current development runtime.

## Development

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
```

Run `pnpm dev` to load the node in a local n8n development instance.

## Resources

- [TypeSafe documentation](https://docs.typesafe.ai/)
- [Jev model documentation](https://docs.typesafe.ai/models)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)
