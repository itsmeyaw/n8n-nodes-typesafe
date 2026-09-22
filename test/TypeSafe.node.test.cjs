const assert = require('node:assert/strict');
const test = require('node:test');

const { TypeSafe } = require('../dist/nodes/TypeSafe/TypeSafe.node.js');

test('builds one batched Jev request from guided questions', async () => {
	let request;
	let credentialType;
	const parameters = {
		model: 'jev-latest',
		stateInput: 'json',
		stateJson: { message: 'Please fix this ASAP' },
		questionInput: 'guided',
		questions: {
			choice: [
				{
					id: 'department',
					instructions: 'Which team should handle this?',
					criteria: { billing: null, technical: null },
				},
			],
			noul: [{ id: 'urgent', instructions: 'Does this convey urgency?' }],
			score: [
				{
					id: 'frustration',
					instructions: 'How frustrated is the customer?',
					criteria: ['Calm', 'Angry'],
				},
			],
		},
	};
	const context = {
		getInputData: () => [{ json: { source: 'test' } }],
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getCredentials: async () => ({ baseUrl: 'https://api.typesafe.ai' }),
		getNode: () => ({ name: 'TypeSafe AI', type: 'typeSafe', typeVersion: 1 }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async function (type, options) {
				credentialType = type;
				request = options;
				return { model: 'jev-1.13.0', answers: {}, usage: {} };
			},
			returnJsonArray: (value) => [{ json: value }],
		},
	};

	const result = await new TypeSafe().execute.call(context);

	assert.equal(credentialType, 'typeSafeApi');
	assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
	assert.deepEqual(request.body, {
		state: { message: 'Please fix this ASAP' },
		model: 'jev-latest',
		questions: {
			department: {
				type: 'choice',
				instructions: 'Which team should handle this?',
				criteria: { billing: null, technical: null },
			},
			frustration: {
				type: 'score',
				instructions: 'How frustrated is the customer?',
				criteria: ['Calm', 'Angry'],
			},
			urgent: { type: 'noul', instructions: 'Does this convey urgency?' },
		},
	});
	assert.deepEqual(result[0][0].pairedItem, { item: 0 });
});

test('returns raw-question validation errors when continue on fail is enabled', async () => {
	let requested = false;
	const parameters = {
		model: 'jev-1.13.0',
		stateInput: 'text',
		stateText: 'Hello',
		questionInput: 'json',
		questionsJson: {
			invalid: { type: 'score', instructions: 'Rate this', criteria: ['Only one level'] },
		},
	};
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getNode: () => ({ name: 'TypeSafe AI', type: 'typeSafe', typeVersion: 1 }),
		continueOnFail: () => true,
		helpers: {
			httpRequestWithAuthentication: async () => {
				requested = true;
			},
			returnJsonArray: (value) => [{ json: value }],
		},
	};

	const result = await new TypeSafe().execute.call(context);

	assert.equal(requested, false);
	assert.match(result[0][0].json.error, /2 to 10 valid criteria levels/);
	assert.deepEqual(result[0][0].pairedItem, { item: 0 });
});

function makeContext(parameters, response, items = [{ json: { ticket: 'T-1' } }], continueOnFail = false) {
	let request;
	const context = {
		getInputData: () => items,
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getCredentials: async () => ({ apiKey: 'secret', baseUrl: 'https://proxy.example/' }),
		getNode: () => ({ name: 'TypeSafe AI', type: 'typeSafe', typeVersion: 1 }),
		continueOnFail: () => continueOnFail,
		helpers: {
				httpRequestWithAuthentication: async (_type, options) => {
				request = options;
				if (response.__error) throw response.__error;
				return response;
			},
		},
	};
	return { context, getRequest: () => request };
}

const response = {
	body: {
		model: 'jev-1.13.0',
		answers: {
			intent: {
				type: 'choice',
				choice: 'billing',
				confidence: 0.91,
				probabilities: { billing: 0.94, technical: 0.06 },
			},
			urgent: { type: 'noul', noul: 0.88 },
			frustration: { type: 'score', score: 1.4, confidence: 0.72, probabilities: {} },
		},
		usage: { input_tokens: 10, output_tokens: 3 },
	},
	headers: { 'x-typesafe-request-id': 'req_123' },
	statusCode: 200,
};

test('loads models from the credential base URL', async () => {
	const { context, getRequest } = makeContext({}, {
		body: { models: [{ name: 'jev-latest', description: 'Latest model' }] },
		headers: {},
		statusCode: 200,
	});

	const models = await new TypeSafe().methods.loadOptions.getModels.call(context);

	assert.deepEqual(models, [
		{ name: 'jev-latest', value: 'jev-latest', description: 'Latest model' },
	]);
	assert.equal(getRequest().url, 'https://proxy.example/v1/models');
});

test('reports API status, server detail, and request ID', async () => {
	const parameters = {
		operation: 'evaluate',
		model: 'bad-model',
		stateInput: 'inputItem',
		questionInput: 'json',
		questionsJson: { urgent: { type: 'noul', instructions: 'Urgent?' } },
		options: {},
	};
	const failure = {
		__error: {
			httpCode: '400',
			cause: {
				response: {
					status: 400,
					data: { detail: { message: 'Unknown model' } },
					headers: { 'x-typesafe-request-id': 'req_error' },
				},
			},
		},
	};
	const { context } = makeContext(parameters, failure);

	await assert.rejects(() => new TypeSafe().execute.call(context), (error) => {
		assert.match(error.message, /400/);
		assert.match(error.description, /Unknown model/);
		assert.match(error.description, /req_error/);
		return true;
	});
});

test('supports simplified answers, custom append field, timeout, and request ID', async () => {
	const parameters = {
		operation: 'evaluate',
		model: 'jev-latest',
		stateInput: 'inputItem',
		questionInput: 'json',
		questionsJson: { urgent: { type: 'noul', instructions: 'Urgent?' } },
		output: 'append',
		simplify: true,
		options: { outputField: 'decision', includeRequestId: true, timeout: 5000 },
	};
	const { context, getRequest } = makeContext(parameters, response);

	const result = await new TypeSafe().execute.call(context);

	assert.equal(result[0][0].json.ticket, 'T-1');
	assert.deepEqual(result[0][0].json.decision.answers, {
		intent: 'billing',
		urgent: 0.88,
		frustration: 1.4,
	});
	assert.equal(result[0][0].json.decision.requestId, 'req_123');
	assert.equal(getRequest().timeout, 5000);
});

test('builds all question types from the unified field editor', async () => {
	const parameters = {
		operation: 'evaluate',
		model: 'jev-latest',
		stateInput: 'inputItem',
		questionInput: 'guided',
		questions: {
			question: [
				{
					name: 'intent',
					type: 'choice',
					instructions: 'What do they need?',
					choiceCriteria: {
						options: [{ label: 'billing', description: 'Payments' }, { label: 'technical' }],
					},
				},
				{
					name: 'frustration',
					type: 'score',
					instructions: 'Rate frustration',
					scoreCriteria: ['Calm', 'Angry'],
				},
				{
					name: 'urgent',
					type: 'noul',
					instructions: 'Is this urgent?',
					noulTrue: 'Time-sensitive',
				},
			],
		},
		output: 'responseOnly',
		options: {},
	};
	const { context, getRequest } = makeContext(parameters, response);

	await new TypeSafe().execute.call(context);

	assert.deepEqual(getRequest().body.questions, {
		intent: {
			type: 'choice',
			instructions: 'What do they need?',
			criteria: { billing: 'Payments', technical: null },
		},
		frustration: {
			type: 'score',
			instructions: 'Rate frustration',
			criteria: ['Calm', 'Angry'],
		},
		urgent: {
			type: 'noul',
			instructions: 'Is this urgent?',
			criteria: { true: 'Time-sensitive' },
		},
	});
});

test('creates dynamic Choice outputs and routes uncertain items to Review', async () => {
	const node = new TypeSafe();
	const expression = node.description.outputs;
	const evaluate = new Function('$parameter', `return ${expression.slice(3, -2)}`);
	assert.deepEqual(
		evaluate({
			operation: 'route',
			decisionType: 'choice',
			choiceRoutes: { routes: [{ name: 'billing' }, { name: 'technical' }] },
			reviewHandling: 'review',
		}),
		[
			{ type: 'main', displayName: 'billing' },
			{ type: 'main', displayName: 'technical' },
			{ type: 'main', displayName: 'Review' },
		],
	);

	const parameters = {
		operation: 'route',
		model: 'jev-latest',
		stateInput: 'inputItem',
		decisionType: 'choice',
		routeInstructions: 'Which team?',
		'choiceRoutes.routes': [
			{ name: 'billing', description: 'Payments' },
			{ name: 'technical', description: 'Bugs' },
		],
		reviewHandling: 'review',
		confidenceThreshold: 0.95,
		options: { outputField: 'decision', includeRequestId: true },
	};
	const routeResponse = {
		...response,
		body: { ...response.body, answers: { decision: response.body.answers.intent } },
	};
	const { context } = makeContext(parameters, routeResponse);

	const result = await node.execute.call(context);

	assert.equal(result.length, 3);
	assert.equal(result[2][0].json.decision.outcome, 'billing');
	assert.equal(result[2][0].json.decision.review, true);
	assert.equal(result[2][0].json.decision.requestId, 'req_123');
});

test('routes confident Noul and Score decisions to fixed outputs', async () => {
	const cases = [
		{
			decisionType: 'noul',
			answer: { type: 'noul', noul: 0.88 },
			extra: {},
			expectedOutput: 0,
			expectedOutcome: 'Yes',
		},
		{
			decisionType: 'score',
			answer: { type: 'score', score: 1.4, confidence: 0.92, probabilities: {} },
			extra: { scorePassThreshold: 1 },
			expectedOutput: 0,
			expectedOutcome: 'Pass',
		},
	];

	for (const routeCase of cases) {
		const parameters = {
			operation: 'route',
			model: 'jev-latest',
			stateInput: 'inputItem',
			decisionType: routeCase.decisionType,
			routeInstructions: 'Decide',
			reviewHandling: 'review',
			confidenceThreshold: 0.8,
			options: {},
			...routeCase.extra,
		};
		if (routeCase.decisionType === 'score') parameters.scoreLevels = ['Low', 'High'];
		const routeResponse = {
			body: {
				model: 'jev-1.13.0',
				answers: { decision: routeCase.answer },
				usage: {},
			},
			headers: {},
			statusCode: 200,
		};
		const { context } = makeContext(parameters, routeResponse);

		const result = await new TypeSafe().execute.call(context);

		assert.equal(result[routeCase.expectedOutput][0].json.typesafeJev.outcome, routeCase.expectedOutcome);
	}
});

test('routes low-confidence Noul and Score decisions to Review', async () => {
	for (const [decisionType, answer, extra] of [
		['noul', { type: 'noul', noul: 0.55 }, {}],
		['score', { type: 'score', score: 1.4, confidence: 0.7 }, { scoreLevels: ['Low', 'High'] }],
	]) {
		const parameters = {
			operation: 'route',
			model: 'jev-latest',
			stateInput: 'inputItem',
			decisionType,
			routeInstructions: 'Decide',
			reviewHandling: 'review',
			confidenceThreshold: 0.8,
			options: {},
			...extra,
		};
		const routeResponse = {
			body: { model: 'jev-1.13.0', answers: { decision: answer }, usage: {} },
			headers: {},
			statusCode: 200,
		};
		const { context } = makeContext(parameters, routeResponse);

		const result = await new TypeSafe().execute.call(context);

		assert.equal(result[2][0].json.typesafeJev.review, true);
	}
});

test('bypasses Review when best-decision handling is selected', async () => {
	const parameters = {
		operation: 'route',
		model: 'jev-latest',
		stateInput: 'inputItem',
		decisionType: 'noul',
		routeInstructions: 'Decide',
		reviewHandling: 'bestDecision',
		confidenceThreshold: 0.99,
		options: {},
	};
	const routeResponse = {
		body: { model: 'jev-1.13.0', answers: { decision: { type: 'noul', noul: 0.55 } }, usage: {} },
		headers: {},
		statusCode: 200,
	};
	const { context } = makeContext(parameters, routeResponse);

	const result = await new TypeSafe().execute.call(context);

	assert.equal(result.length, 2);
	assert.equal(result[0][0].json.typesafeJev.review, false);
});

test('rejects out-of-range routing confidence', async () => {
	const parameters = {
		operation: 'route',
		model: 'jev-latest',
		stateInput: 'inputItem',
		decisionType: 'noul',
		routeInstructions: 'Decide',
		reviewHandling: 'review',
		options: {},
	};
	const routeResponse = {
		body: { model: 'jev-1.13.0', answers: { decision: { type: 'noul', noul: 1.5 } }, usage: {} },
		headers: {},
		statusCode: 200,
	};
	const { context } = makeContext(parameters, routeResponse);

	await assert.rejects(() => new TypeSafe().execute.call(context), /invalid Noul probability/);
});

test('sends Continue On Fail routing errors to Review', async () => {
	const parameters = {
		operation: 'route',
		model: 'jev-latest',
		stateInput: 'inputItem',
		decisionType: 'noul',
		routeInstructions: 'Decide',
		reviewHandling: 'review',
		options: {},
	};
	const failure = { __error: { statusCode: 500, response: { body: { detail: 'Unavailable' } } } };
	const { context } = makeContext(parameters, failure, undefined, true);

	const result = await new TypeSafe().execute.call(context);

	assert.equal(result[0].length, 0);
	assert.match(result[2][0].json.error, /500/);
});
