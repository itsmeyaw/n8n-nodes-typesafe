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
