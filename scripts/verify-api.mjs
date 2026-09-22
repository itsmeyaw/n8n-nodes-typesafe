const apiKey = process.env.TYPESAFE_API_KEY;
const baseUrl = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');

if (!apiKey) {
	throw new Error('Set TYPESAFE_API_KEY before running pnpm verify:api');
}

async function request(path, options = {}) {
	const response = await fetch(`${baseUrl}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
	});
	const body = await response.json();
	if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
	return { body, requestId: response.headers.get('x-typesafe-request-id') };
}

const modelsResponse = await request('/v1/models');
const models = Array.isArray(modelsResponse.body)
	? modelsResponse.body
	: modelsResponse.body.models;
if (!Array.isArray(models) || !models.some((model) => model.name === 'jev-latest')) {
	throw new Error('GET /v1/models did not return jev-latest');
}

const { body, requestId } = await request('/v1/systemone', {
	method: 'POST',
	body: JSON.stringify({
		model: 'jev-latest',
		state: 'Please refund the duplicate charge today.',
		questions: {
			intent: {
				type: 'choice',
				instructions: 'What does the customer need?',
				criteria: { billing: 'Payments and refunds', technical: 'Product problems' },
			},
			urgent: { type: 'noul', instructions: 'Is this time-sensitive?' },
			frustration: {
				type: 'score',
				instructions: 'How frustrated is the customer?',
				criteria: ['Calm', 'Frustrated'],
			},
		},
	}),
});

for (const [name, type] of [
	['intent', 'choice'],
	['urgent', 'noul'],
	['frustration', 'score'],
]) {
	if (body.answers?.[name]?.type !== type) {
		throw new Error(`POST /v1/systemone returned an invalid ${name} answer`);
	}
}

if (
	!Number.isFinite(body.answers.intent.confidence) ||
	!body.answers.intent.probabilities ||
	!Number.isFinite(body.answers.urgent.noul) ||
	body.answers.urgent.noul < 0 ||
	body.answers.urgent.noul > 1 ||
	!Number.isFinite(body.answers.frustration.confidence) ||
	!body.answers.frustration.probabilities
) {
	throw new Error('POST /v1/systemone omitted values required for confidence-aware routing');
}

console.log(`TypeSafe API verified with ${body.model}${requestId ? ` (${requestId})` : ''}`);
