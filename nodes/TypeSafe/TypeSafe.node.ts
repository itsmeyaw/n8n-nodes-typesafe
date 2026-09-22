import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { typeSafeRequest } from './transport';

type GuidedQuestion = {
	id: string;
	instructions: string;
	criteria?: unknown;
	trueCriteria?: string;
	falseCriteria?: string;
};

type GuidedQuestions = {
	question?: Array<
		GuidedQuestion & {
			name?: string;
			type?: 'choice' | 'score' | 'noul';
			choiceCriteria?: { options?: Array<{ label?: string; description?: string }> };
			scoreCriteria?: string[];
			noulTrue?: string;
			noulFalse?: string;
		}
	>;
	choice?: GuidedQuestion[];
	score?: GuidedQuestion[];
	noul?: GuidedQuestion[];
};

function parseJson(node: INode, value: unknown, field: string): unknown {
	if (typeof value !== 'string') return value;

	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(node, `${field} must be valid JSON`);
	}
}

function buildGuidedQuestions(node: INode, value: GuidedQuestions): IDataObject {
	if (value.question) {
		const grouped: GuidedQuestions = {};
		for (const question of value.question) {
			const type = question.type ?? 'choice';
			const built: GuidedQuestion = {
				id: question.name ?? question.id,
				instructions: question.instructions,
			};
			if (type === 'choice') {
				built.criteria = Object.fromEntries(
					(question.choiceCriteria?.options ?? []).map((option) => [
						option.label?.trim() ?? '',
						option.description?.trim() || null,
					]),
				);
			}
			if (type === 'score') built.criteria = question.scoreCriteria ?? [];
			if (type === 'noul') {
				built.trueCriteria = question.noulTrue;
				built.falseCriteria = question.noulFalse;
			}
			(grouped[type] ??= []).push(built);
		}
		return buildGuidedQuestions(node, grouped);
	}

	const entries: Array<[string, IDataObject]> = [];
	const ids = new Set<string>();

	for (const type of ['choice', 'score', 'noul'] as const) {
		for (const question of value[type] ?? []) {
			const id = question.id.trim();
			if (!id) throw new NodeOperationError(node, 'Every question needs an ID');
			if (ids.has(id)) {
				throw new NodeOperationError(node, `Question ID "${id}" is duplicated`);
			}
			ids.add(id);

			const instructions = question.instructions.trim();
			if (!instructions) {
				throw new NodeOperationError(node, `Question "${id}" needs instructions`);
			}

			if (type === 'choice') {
				const criteria = parseJson(node, question.criteria, `Criteria for question "${id}"`);
				if (
					typeof criteria !== 'object' ||
					criteria === null ||
					Array.isArray(criteria) ||
					Object.keys(criteria).length < 2 ||
					Object.keys(criteria).length > 255
				) {
					throw new NodeOperationError(
						node,
						`Choice question "${id}" needs between 2 and 255 criteria options`,
					);
				}
				entries.push([id, { type, instructions, criteria } as IDataObject]);
				continue;
			}

			if (type === 'score') {
				const criteria = parseJson(node, question.criteria, `Criteria for question "${id}"`);
				if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
					throw new NodeOperationError(
						node,
						`Score question "${id}" needs between 2 and 10 criteria levels`,
					);
				}
				entries.push([id, { type, instructions, criteria } as IDataObject]);
				continue;
			}

			const criteria: IDataObject = {};
			if (question.trueCriteria?.trim()) criteria.true = question.trueCriteria.trim();
			if (question.falseCriteria?.trim()) criteria.false = question.falseCriteria.trim();
			entries.push([
				id,
				{
					type,
					instructions,
					...(Object.keys(criteria).length > 0 ? { criteria } : {}),
				} as IDataObject,
			]);
		}
	}

	if (entries.length === 0) {
		throw new NodeOperationError(node, 'Add at least one question');
	}
	return validateQuestions(node, Object.fromEntries(entries));
}

function isStructuredValue(value: unknown): boolean {
	return value === null || typeof value === 'string' || typeof value === 'object';
}

function isNonNullStructuredValue(value: unknown): boolean {
	return value !== null && (typeof value === 'string' || typeof value === 'object');
}

function isInstructionValue(value: unknown): boolean {
	return value !== null && (typeof value === 'string' || typeof value === 'object');
}

function validateQuestions(node: INode, questions: IDataObject): IDataObject {
	for (const [id, value] of Object.entries(questions)) {
		if (!id.trim()) throw new NodeOperationError(node, 'Every question needs an ID');
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw new NodeOperationError(node, `Question "${id}" must be a JSON object`);
		}

		const question = value as IDataObject;
		if (!['choice', 'score', 'noul'].includes(question.type as string)) {
			throw new NodeOperationError(node, `Question "${id}" has an unsupported type`);
		}
		if (
			!Object.prototype.hasOwnProperty.call(question, 'instructions') ||
			!isInstructionValue(question.instructions)
		) {
			throw new NodeOperationError(node, `Question "${id}" needs valid instructions`);
		}

		if (question.type === 'choice') {
			const criteria = question.criteria;
			if (
				typeof criteria !== 'object' ||
				criteria === null ||
				Array.isArray(criteria) ||
				Object.keys(criteria).length < 2 ||
				Object.keys(criteria).length > 255 ||
				Object.keys(criteria).some((key) => !key.trim()) ||
				Object.values(criteria).some((entry) => !isStructuredValue(entry))
			) {
				throw new NodeOperationError(
					node,
					`Choice question "${id}" needs 2 to 255 valid criteria options`,
				);
			}
		}

		if (question.type === 'score') {
			const criteria = question.criteria;
			if (
				!Array.isArray(criteria) ||
				criteria.length < 2 ||
				criteria.length > 10 ||
				criteria.some((entry) => !isNonNullStructuredValue(entry))
			) {
				throw new NodeOperationError(
					node,
					`Score question "${id}" needs 2 to 10 valid criteria levels`,
				);
			}
		}

		if (question.type === 'noul' && question.criteria !== undefined) {
			const criteria = question.criteria;
			if (
				typeof criteria !== 'object' ||
				criteria === null ||
				Array.isArray(criteria) ||
				Object.keys(criteria).some((key) => key !== 'true' && key !== 'false') ||
				Object.values(criteria).some((entry) => !isNonNullStructuredValue(entry))
			) {
				throw new NodeOperationError(node, `Noul question "${id}" has invalid criteria`);
			}
		}
	}

	return questions;
}

function validateRawQuestions(node: INode, value: unknown): IDataObject {
	const questions = parseJson(node, value, 'Questions');
	if (
		typeof questions !== 'object' ||
		questions === null ||
		Array.isArray(questions) ||
		Object.keys(questions).length === 0
	) {
		throw new NodeOperationError(node, 'Questions must be a non-empty JSON object');
	}
	return validateQuestions(node, questions as IDataObject);
}

type Answer = IDataObject & {
	type: 'choice' | 'noul' | 'score';
	choice?: string;
	confidence?: number;
	noul?: number;
	score?: number;
	probabilities?: IDataObject;
};

type SystemOneResponse = {
	model: string;
	answers: Record<string, Answer>;
	usage: IDataObject;
};

function simplifyAnswers(answers: Record<string, Answer>): IDataObject {
	return Object.fromEntries(
		Object.entries(answers).map(([name, answer]) => [
			name,
			answer.type === 'choice' ? answer.choice : answer.type === 'noul' ? answer.noul : answer.score,
		]),
	);
}

function configuredOutputs(parameters: IDataObject) {
	if (parameters.operation !== 'route') return [{ type: 'main' }];
	let names: string[];
	if (parameters.decisionType === 'choice') {
		const choiceRoutes = (parameters.choiceRoutes || {}) as IDataObject;
		const routes = (choiceRoutes.routes || []) as Array<{ name?: string }>;
		names = routes.map((route, index) => route.name?.trim() || `Route ${index + 1}`);
	} else if (parameters.decisionType === 'noul') {
		names = ['Yes', 'No'];
	} else {
		names = ['Pass', 'Fail'];
	}
	const outputs = names.map((displayName) => ({ type: 'main', displayName }));
	if (parameters.reviewHandling !== 'bestDecision') {
		outputs.push({ type: 'main', displayName: 'Review' });
	} else {
		outputs.push({ type: 'main', displayName: 'Error' });
	}
	return outputs;
}

function buildRouteQuestion(
	node: INode,
	type: 'choice' | 'noul' | 'score',
	instructions: string,
	parameters: {
		routes?: Array<{ name?: string; description?: string }>;
		trueCriteria?: string;
		falseCriteria?: string;
		scoreLevels?: string[];
	},
): IDataObject {
	const text = instructions.trim();
	if (!text) throw new NodeOperationError(node, 'Routing instructions cannot be empty');
	if (type === 'choice') {
		const routes = parameters.routes ?? [];
		if (routes.length < 2 || routes.length > 255) {
			throw new NodeOperationError(node, 'Add between 2 and 255 routes');
		}
		const criteria: IDataObject = {};
		for (const route of routes) {
			const name = route.name?.trim() ?? '';
			if (!name) throw new NodeOperationError(node, 'Every route needs a name');
			if (name in criteria) throw new NodeOperationError(node, `Route "${name}" is duplicated`);
			criteria[name] = route.description?.trim() || null;
		}
		return { type, instructions: text, criteria };
	}
	if (type === 'score') {
		const criteria = parameters.scoreLevels ?? [];
		if (criteria.length < 2 || criteria.length > 10) {
			throw new NodeOperationError(node, 'Score routing needs between 2 and 10 levels');
		}
		return { type, instructions: text, criteria };
	}
	const criteria: IDataObject = {};
	if (parameters.trueCriteria?.trim()) criteria.true = parameters.trueCriteria.trim();
	if (parameters.falseCriteria?.trim()) criteria.false = parameters.falseCriteria.trim();
	return { type, instructions: text, ...(Object.keys(criteria).length ? { criteria } : {}) };
}

function invalidResponse(node: INode, message: string): never {
	throw new NodeOperationError(node, `TypeSafe returned invalid System One response: ${message}`);
}

function validateSystemOneResponse(
	node: INode,
	data: SystemOneResponse,
	questions: IDataObject,
): SystemOneResponse {
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		invalidResponse(node, 'expected an object');
	}
	if (typeof data.answers !== 'object' || data.answers === null || Array.isArray(data.answers)) {
		invalidResponse(node, 'answers must be an object');
	}
	if (typeof data.model !== 'string' || !data.model.trim()) {
		invalidResponse(node, 'model must be a non-empty string');
	}
	if (typeof data.usage !== 'object' || data.usage === null || Array.isArray(data.usage)) {
		invalidResponse(node, 'usage must be an object');
	}

	const answerIds = Object.keys(data.answers);
	const questionIds = Object.keys(questions);
	if (
		answerIds.length !== questionIds.length ||
		answerIds.some((id) => !Object.prototype.hasOwnProperty.call(questions, id))
	) {
		invalidResponse(node, 'answers do not match the requested question IDs');
	}

	for (const id of questionIds) {
		const question = questions[id] as IDataObject;
		const answer = data.answers[id];
		if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
			invalidResponse(node, `answer "${id}" must be an object`);
		}
		if (answer.type !== question.type) {
			invalidResponse(node, `answer "${id}" has an unexpected type`);
		}
		if (answer.type === 'choice') {
			const criteria = question.criteria as IDataObject;
			if (typeof answer.choice !== 'string' || !Object.prototype.hasOwnProperty.call(criteria, answer.choice)) {
				invalidResponse(node, `answer "${id}" has an unknown choice`);
			}
			if (
				typeof answer.confidence !== 'number' ||
				!Number.isFinite(answer.confidence) ||
				answer.confidence < 0 ||
				answer.confidence > 1
			) {
				invalidResponse(node, `answer "${id}" has invalid confidence`);
			}
		}
		if (answer.type === 'noul') {
			if (
				typeof answer.noul !== 'number' ||
				!Number.isFinite(answer.noul) ||
				answer.noul < 0 ||
				answer.noul > 1
			) {
				invalidResponse(node, `answer "${id}" has an invalid Noul probability`);
			}
		}
		if (answer.type === 'score') {
			const levels = question.criteria as unknown[];
			if (
				typeof answer.score !== 'number' ||
				!Number.isFinite(answer.score) ||
				answer.score < 0 ||
				answer.score > levels.length
			) {
				invalidResponse(node, `answer "${id}" has an invalid score`);
			}
			if (
				typeof answer.confidence !== 'number' ||
				!Number.isFinite(answer.confidence) ||
				answer.confidence < 0 ||
				answer.confidence > 1
			) {
				invalidResponse(node, `answer "${id}" has invalid confidence`);
			}
		}
	}

	return data;
}

function errorField(json: IDataObject, outputField: string): string {
	if (!Object.prototype.hasOwnProperty.call(json, outputField)) return outputField;
	let suffix = 0;
	let field = `${outputField}Error`;
	while (Object.prototype.hasOwnProperty.call(json, field)) field = `${outputField}Error${++suffix}`;
	return field;
}

function errorDetails(error: unknown): IDataObject {
	const value =
		typeof error === 'object' && error !== null
			? (error as { description?: unknown; httpCode?: unknown })
			: {};
	return {
		message: value instanceof Error ? value.message : String(error),
		...(typeof value.description === 'string' ? { description: value.description } : {}),
		...(typeof value.httpCode === 'string' ? { httpCode: value.httpCode } : {}),
	};
}

function routeDecision(
	node: INode,
	type: 'choice' | 'noul' | 'score',
	answer: Answer,
	routeNames: string[],
	threshold: number,
	review: boolean,
	scorePassThreshold: number,
): { outputIndex: number; result: IDataObject } {
	let outcome: string;
	let outputIndex: number;
	let confidence: number;
	if (type === 'choice') {
		outcome = String(answer.choice);
		outputIndex = routeNames.indexOf(outcome);
		confidence = Number(answer.confidence);
		if (outputIndex < 0) {
			throw new NodeOperationError(node, `Jev returned unknown route "${outcome}"`);
		}
	} else if (type === 'noul') {
		const probability = Number(answer.noul);
		if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
			throw new NodeOperationError(node, 'Jev returned an invalid Noul probability');
		}
		outcome = probability >= 0.5 ? 'Yes' : 'No';
		outputIndex = outcome === 'Yes' ? 0 : 1;
		confidence = Math.max(probability, 1 - probability);
	} else {
		const score = Number(answer.score);
		if (!Number.isFinite(score)) {
			throw new NodeOperationError(node, 'Jev returned an invalid score');
		}
		outcome = score >= scorePassThreshold ? 'Pass' : 'Fail';
		outputIndex = outcome === 'Pass' ? 0 : 1;
		confidence = Number(answer.confidence);
	}
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		throw new NodeOperationError(node, `Jev returned invalid confidence for ${type} routing`);
	}
	const needsReview = review && confidence < threshold;
	return {
		outputIndex: needsReview ? routeNames.length : outputIndex,
		result: {
			outcome,
			confidence,
			review: needsReview,
			value: type === 'noul' ? answer.noul : type === 'score' ? answer.score : answer.choice,
			...(answer.probabilities ? { probabilities: answer.probabilities } : {}),
		},
	};
}

export class TypeSafe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TypeSafe AI',
		name: 'typeSafe',
		icon: { light: 'file:typesafe.svg', dark: 'file:typesafe.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] === "route" ? "Route with Jev" : $parameter["model"] }}',
		description: "Make structured decisions with TypeSafe AI's Jev model",
		defaults: {
			name: 'TypeSafe AI',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: `={{(${configuredOutputs})($parameter)}}`,
		usableAsTool: true,
		credentials: [
			{
				name: 'typeSafeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Evaluate Questions',
						value: 'evaluate',
						description: 'Return typed answers for one or more questions',
						action: 'Evaluate questions about a state',
					},
					{
						name: 'Decide and Route',
						value: 'route',
						description: 'Send items to decision outputs, with an optional Review branch',
						action: 'Decide and route items',
					},
				],
				default: 'evaluate',
			},
			{
				displayName:
					'Jev makes fast, structured decisions. It does not generate text or perform reliable arithmetic.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getModels' },
				default: 'jev-latest',
				required: true,
				description:
					'The Jev model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'State Input',
				name: 'stateInput',
				type: 'options',
				options: [
					{ name: 'Whole Input Item', value: 'inputItem' },
					{ name: 'Text', value: 'text' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'inputItem',
				description: 'Choose which input data Jev evaluates as state',
			},
			{
				displayName: 'State',
				name: 'stateText',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				displayOptions: { show: { stateInput: ['text'] } },
				description: 'The text Jev should evaluate',
			},
			{
				displayName: 'State',
				name: 'stateJson',
				type: 'json',
				default: '{}',
				required: true,
				displayOptions: { show: { stateInput: ['json'] } },
				description: 'Structured JSON state containing only information relevant to the questions',
			},
			{
				displayName: 'Question Input',
				name: 'questionInput',
				type: 'options',
				options: [
					{ name: 'Guided', value: 'guided' },
					{ name: 'Raw JSON', value: 'json' },
				],
				default: 'guided',
				displayOptions: { show: { operation: ['evaluate'] } },
				description: 'Use Guided for the form editor or Raw JSON for an existing question definition',
			},
			{
				displayName: 'Questions',
				name: 'questions',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				default: {},
				placeholder: 'Add Question',
				displayOptions: { show: { operation: ['evaluate'], questionInput: ['guided'] } },
				options: [
					{
						displayName: 'Question',
						name: 'question',
						values: [
							{
								displayName: 'Describe No',
								name: 'noulFalse',
								type: 'string',
								default: '',
								displayOptions: { show: { type: ['noul'] } },
							},
							{
								displayName: 'Describe Yes',
								name: 'noulTrue',
								type: 'string',
								default: '',
								displayOptions: { show: { type: ['noul'] } },
							},
							{
								displayName: 'Instructions',
								name: 'instructions',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								required: true,
								description: 'Tell Jev what to decide for this question',
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								description: 'Key used for this answer in the output',
							},
							{
								displayName: 'Options',
								name: 'choiceCriteria',
								type: 'fixedCollection',
								typeOptions: { multipleValues: true, sortable: true },
								default: {},
								placeholder: 'Add Option',
								displayOptions: { show: { type: ['choice'] } },
								options: [
									{
										displayName: 'Option',
										name: 'options',
										values: [
											{
												displayName: 'Description',
												name: 'description',
												type: 'string',
												default: '',
											},
											{
												displayName: 'Label',
												name: 'label',
												type: 'string',
												default: '',
												required: true,
											},
										],
									},
								],
							},
							{
								displayName: 'Rubric Levels',
								name: 'scoreCriteria',
								type: 'string',
								typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Level', rows: 2 },
								default: [],
								displayOptions: { show: { type: ['score'] } },
								description: 'Add 2 to 10 ordered rubric levels, lowest first',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								default: 'choice',
								options: [
									{ name: 'Choice', value: 'choice' },
									{ name: 'Score', value: 'score' },
									{ name: 'Yes/No', value: 'noul' },
								],
							},
						],
					},
				],
			},
			{
				displayName: 'Questions',
				name: 'questionsJson',
				type: 'json',
				default:
					'{\n  "is_urgent": {\n    "type": "noul",\n    "instructions": "Does this convey urgency?"\n  }\n}',
				required: true,
				displayOptions: { show: { operation: ['evaluate'], questionInput: ['json'] } },
				description:
					'A non-empty object of TypeSafe questions. Use this mode for structured instructions and criteria.',
			},
			{
				displayName: 'Decision Type',
				name: 'decisionType',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Choice', value: 'choice' },
					{ name: 'Score', value: 'score' },
					{ name: 'Yes/No', value: 'noul' },
				],
				default: 'choice',
				displayOptions: { show: { operation: ['route'] } },
				description: 'Choose the output shape used for routing',
			},
			{
				displayName: 'Instructions',
				name: 'routeInstructions',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['route'] } },
				description: 'The decision Jev should make',
			},
			{
				displayName: 'Routes',
				name: 'choiceRoutes',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				default: {},
				placeholder: 'Add Route',
				displayOptions: { show: { operation: ['route'], decisionType: ['choice'] } },
				options: [
					{
						displayName: 'Route',
						name: 'routes',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								noDataExpression: true,
							},
							{
								displayName: 'Use When',
								name: 'description',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Yes Means',
				name: 'routeTrueCriteria',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['route'], decisionType: ['noul'] } },
			},
			{
				displayName: 'No Means',
				name: 'routeFalseCriteria',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['route'], decisionType: ['noul'] } },
			},
			{
				displayName: 'Score Levels',
				name: 'scoreLevels',
				type: 'string',
				typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Level', rows: 2 },
				default: [],
				displayOptions: { show: { operation: ['route'], decisionType: ['score'] } },
				description: 'Ordered rubric levels, lowest first',
			},
			{
				displayName: 'Pass From Score',
				name: 'scorePassThreshold',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 0 },
				displayOptions: { show: { operation: ['route'], decisionType: ['score'] } },
				description: 'Scores at or above this value go to Pass',
			},
			{
				displayName: 'Low Confidence Handling',
				name: 'reviewHandling',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Send to Best Decision', value: 'bestDecision' },
					{ name: 'Send to Review Output', value: 'review' },
				],
				default: 'review',
				displayOptions: { show: { operation: ['route'] } },
				description: 'Choose whether low-confidence decisions use the Review output or their best-matching output',
			},
			{
				displayName: 'Confidence Threshold',
				name: 'confidenceThreshold',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.8,
				displayOptions: { show: { operation: ['route'], reviewHandling: ['review'] } },
				description: 'Decisions below this confidence go to Review',
			},
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Answers Only', value: 'answersOnly' },
					{ name: 'Append to Item', value: 'append' },
					{ name: 'Response Only', value: 'responseOnly' },
				],
				default: 'append',
				displayOptions: { show: { operation: ['evaluate'] } },
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['evaluate'] } },
				description: "Whether to return only each answer's primary value",
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Request ID',
						name: 'includeRequestId',
						type: 'boolean',
						default: false,
						description: 'Whether to include the TypeSafe request ID in the output for support and troubleshooting',
					},
					{
						displayName: 'Output Field Name',
						name: 'outputField',
						type: 'string',
						default: 'typesafeJev',
						description: 'Field name used when appending results to the input item',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						type: 'number',
						typeOptions: { minValue: 1000 },
						default: 60000,
						description: 'Maximum time to wait for TypeSafe before the item fails',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { data } = await typeSafeRequest<
					Array<{ name: string; description?: string }> | {
						models: Array<{ name: string; description?: string }>;
					}
				>(this, 'GET', '/v1/models');
				const models = Array.isArray(data) ? data : data.models;
				return models.map((model) => ({
					name: model.name,
					value: model.name,
					description: model.description,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const node = this.getNode();
		const operation = this.getNodeParameter('operation', 0, 'evaluate') as 'evaluate' | 'route';
		const decisionType = this.getNodeParameter('decisionType', 0, 'choice') as
			| 'choice'
			| 'noul'
			| 'score';
		const choiceRoutes =
			operation === 'route' && decisionType === 'choice'
				? (this.getNodeParameter('choiceRoutes.routes', 0, []) as Array<{
						name?: string;
						description?: string;
					}>)
				: [];
		const routeNames =
			decisionType === 'choice'
				? choiceRoutes.map((route) => route.name?.trim() ?? '')
				: ['Pass', 'Fail'];
		const review = operation === 'route' && this.getNodeParameter('reviewHandling', 0, 'review') === 'review';
		const outputCount = operation === 'route' ? routeNames.length + 1 : 1;
		const returnData: INodeExecutionData[][] = Array.from(
			{ length: Math.max(outputCount, 1) },
			() => [],
		);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const stateInput = this.getNodeParameter('stateInput', itemIndex, 'inputItem') as
					| 'inputItem'
					| 'text'
					| 'json';
				const state =
					stateInput === 'inputItem'
						? items[itemIndex].json
						: stateInput === 'text'
							? this.getNodeParameter('stateText', itemIndex)
							: parseJson(node, this.getNodeParameter('stateJson', itemIndex), 'State');
				if (stateInput === 'json' && (typeof state !== 'object' || state === null)) {
					throw new NodeOperationError(node, 'JSON state must be an object or array');
				}

				let questions: IDataObject;
				if (operation === 'route') {
					const itemRoutes =
						decisionType === 'choice'
							? (this.getNodeParameter('choiceRoutes.routes', itemIndex, []) as Array<{
									name?: string;
									description?: string;
								}>)
							: [];
					questions = {
						decision: buildRouteQuestion(
							node,
							decisionType,
							this.getNodeParameter('routeInstructions', itemIndex) as string,
							{
								routes: itemRoutes,
								trueCriteria: this.getNodeParameter('routeTrueCriteria', itemIndex, '') as string,
								falseCriteria: this.getNodeParameter('routeFalseCriteria', itemIndex, '') as string,
								scoreLevels: this.getNodeParameter('scoreLevels', itemIndex, []) as string[],
							},
						),
					};
				} else {
					const questionInput = this.getNodeParameter('questionInput', itemIndex) as
						| 'guided'
						| 'json';
					questions =
						questionInput === 'guided'
							? buildGuidedQuestions(
									node,
									this.getNodeParameter('questions', itemIndex, {}) as GuidedQuestions,
								)
							: validateRawQuestions(
									node,
									this.getNodeParameter('questionsJson', itemIndex),
								);
				}

				const model = (this.getNodeParameter('model', itemIndex) as string).trim();
				if (!model) throw new NodeOperationError(node, 'Model cannot be empty');
				const options = this.getNodeParameter('options', itemIndex, {}) as {
					includeRequestId?: boolean;
					outputField?: string;
					timeout?: number;
				};
				const { data, requestId } = await typeSafeRequest<SystemOneResponse>(
					this,
					'POST',
					'/v1/systemone',
					{
						body: { state, model, questions } as IDataObject,
						timeout: options.timeout,
						itemIndex,
					},
				);
				validateSystemOneResponse(node, data, questions);

				const outputField = options.outputField?.trim() || 'typesafeJev';
				if (operation === 'route') {
					const answer = data.answers.decision;
					if (!answer || answer.type !== decisionType) {
						throw new NodeOperationError(node, 'TypeSafe returned an unexpected routing answer');
					}
					const decision = routeDecision(
						node,
						decisionType,
						answer,
						routeNames,
						this.getNodeParameter('confidenceThreshold', itemIndex, 0.8) as number,
						review,
						this.getNodeParameter('scorePassThreshold', itemIndex, 1) as number,
					);
					const result: IDataObject = {
						...decision.result,
						response: data as unknown as IDataObject,
						...(options.includeRequestId && requestId ? { requestId } : {}),
					};
					returnData[decision.outputIndex].push({
						json: { ...items[itemIndex].json, [outputField]: result },
						binary: items[itemIndex].binary,
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				const simplify = this.getNodeParameter('simplify', itemIndex, false) as boolean;
				const answers = simplify ? simplifyAnswers(data.answers) : (data.answers as IDataObject);
				const output = this.getNodeParameter('output', itemIndex, 'responseOnly') as string;
				let payload: IDataObject =
					output === 'answersOnly'
						? answers
						: { model: data.model, answers, usage: data.usage };
				if (options.includeRequestId && requestId) payload = { ...payload, requestId };
				returnData[0].push({
					json:
						output === 'append'
							? { ...items[itemIndex].json, [outputField]: payload }
							: payload,
					binary: output === 'append' ? items[itemIndex].binary : undefined,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					const outputField = (
						this.getNodeParameter('options', itemIndex, {}) as { outputField?: string }
					).outputField?.trim() || 'typesafeJev';
					const errorOutput = operation === 'route' ? routeNames.length : 0;
					returnData[errorOutput].push({
						json: {
							...items[itemIndex].json,
							[errorField(items[itemIndex].json, outputField)]: { error: errorDetails(error) },
						},
						binary: items[itemIndex].binary,
						pairedItem: items[itemIndex].pairedItem ?? { item: itemIndex },
					});
					continue;
				}
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(node, error as Error, { itemIndex });
			}
		}

		return returnData;
	}
}
