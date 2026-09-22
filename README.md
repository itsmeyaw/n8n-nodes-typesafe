# @itsmeyaw/n8n-nodes-typesafe

Turn support messages, policy checks, and other structured state into typed decisions in n8n. TypeSafe AI's Jev model returns a choice, score, or yes/no probability so a workflow can route confidently—and send uncertain cases to a person.

**Good for:** support triage, approvals, eligibility checks, risk guardrails, and AI Agent decisions that need a bounded answer rather than generated prose.

**Not for:** drafting text, arithmetic, counting, date logic, or a decision that must be deterministic. Keep those in normal n8n logic.

## Install and status

Install `@itsmeyaw/n8n-nodes-typesafe` using n8n's [community-node guide](https://docs.n8n.io/integrations/community-nodes/installation/).

This is an **unverified** community node. Unverified npm community nodes are for self-hosted n8n; they aren't available on n8n Cloud. It is built with `@n8n/node-cli` 0.49.1 and requires Node.js 20.15 or newer. Test it against the n8n version you run before promoting a workflow.

## Start here

1. Create a **TypeSafe AI API** credential with a key from the [TypeSafe console](https://console.typesafe.ai/keys). The credential test and model picker call `GET /v1/models`.
2. Add **TypeSafe AI** and choose **Evaluate Questions** for typed values or **Decide and Route** for branches.
3. Start with a small, relevant JSON state and a pinned Jev model for production thresholds.

Import one of the focused examples:

- [Support routing with Review](examples/ticket-routing.workflow.json)
- [Multi-question evaluation](examples/multi-question-evaluate.workflow.json)
- [AI Agent decision tool](examples/ai-agent-tool.workflow.json)

## Evaluate questions

One incoming item produces one API request. Items are processed **serially**; multiple questions for that item are batched into that request.

Use **Guided** input for ordinary Choice, Score, and Yes/No questions. Use **Raw JSON** when your instructions or criteria are structured. Raw input is a non-empty object of **TypeSafe question objects**, not JSON Schema:

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
		"instructions": "Does the customer need action today?"
	}
}
```

Write questions with a single decision, mutually distinct Choice labels, and concrete criteria. Put facts in state, not in the question; do not ask Jev to infer missing facts. Score criteria are ordered from low to high (2–10 levels).

With **Answers Only** and **Simplify** enabled, the example above produces this exact output shape:

```json
{
	"team": "Billing",
	"urgent": 0.91
}
```

The `urgent` value is the probability that the statement is true. Without Simplify, answers include their type and model-provided decision details.

### State, output, and failures

- **Whole Input Item** sends the incoming item's JSON only; it never sends binary data. **Text** and **JSON** send the value configured in the node.
- **Append to Item** keeps the input JSON and binary data. **Answers Only** and **Response Only** replace the JSON and omit binary data.
- Successful **Decide and Route** outputs keep the input binary data. Its selected outcome, confidence, raw TypeSafe response, and optional request ID are appended under **Output Field Name**.
- **Include Request ID** adds the `x-typesafe-request-id` response header only when TypeSafe returned one. API error descriptions also include a returned request ID when available.
- n8n's **Continue On Fail** preserves the incoming JSON, binary data, and item pairing. Error details are added under **Output Field Name** (or a non-conflicting `Error`-suffixed field). Routing failures go to **Review**, or to the dedicated **Error** output when low-confidence decisions use the best result.

## Decide and route

**Choice** creates one output per route, **Yes/No** creates Yes and No, and **Score** creates Pass and Fail. Decisions below the confidence threshold can go to **Review** for human approval or a slower fallback.

Route names define both the decision criteria and canvas output order. Recheck connections after renaming or reordering configured routes.

## AI Agent setup

The node is usable as an n8n AI Agent tool. In the agent canvas, connect the TypeSafe AI node's **tool** connection to the AI Agent and connect a chat model to the agent. Configure TypeSafe's text state with `$fromAI()` so the agent can provide the state, then give the agent a prompt such as “Use the TypeSafe tool before assigning a support team.” The [AI Agent example](examples/ai-agent-tool.workflow.json) has this wiring; add your TypeSafe and chat-model credentials after import.

## Model and privacy

`jev-latest` is convenient for experiments. Pin a versioned model ID, such as `jev-1.13.0`, when routes, thresholds, or approvals depend on stable behavior.

The node sends the selected state, questions, and model ID to the configured TypeSafe Base URL. Whole-item state is the item's JSON, not its binary attachments. The API key is sent by n8n as a bearer credential. Send only information needed for the decision and review TypeSafe's policies before sending sensitive data. Change **Base URL** only for a proxy or dedicated TypeSafe deployment.

For transient `429` or `529` responses, use n8n's **Retry On Fail** node setting.

## Development

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
```

Run `pnpm dev` to load the node in a local n8n development instance. Run `TYPESAFE_API_KEY=... pnpm verify:api` to check model discovery and answer types against the live API.

## Resources

- [TypeSafe documentation](https://docs.typesafe.ai/)
- [Jev model documentation](https://docs.typesafe.ai/models)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)
