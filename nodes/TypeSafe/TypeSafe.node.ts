import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type GuidedQuestion = {
	id: string;
	instructions: string;
	criteria?: unknown;
	trueCriteria?: string;
	falseCriteria?: string;
};

type GuidedQuestions = {
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
			!isStructuredValue(question.instructions)
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
				criteria.some((entry) => !isStructuredValue(entry))
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
				Object.values(criteria).some((entry) => !isStructuredValue(entry))
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

export class TypeSafe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TypeSafe AI',
		name: 'typeSafe',
		icon: { light: 'file:typesafe.svg', dark: 'file:typesafe.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: 'Evaluate State with Jev',
		description: "Make structured decisions with TypeSafe AI's Jev model",
		defaults: {
			name: 'TypeSafe AI',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'typeSafeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName:
					'Jev makes fast, structured decisions. It does not generate text or perform reliable arithmetic.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'jev-latest',
				required: true,
				description:
					'The Jev alias or version to use. Pin a version if thresholds depend on model behavior.',
			},
			{
				displayName: 'State Input',
				name: 'stateInput',
				type: 'options',
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'text',
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
			},
			{
				displayName: 'Questions',
				name: 'questions',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				default: {},
				placeholder: 'Add Question',
				displayOptions: { show: { questionInput: ['guided'] } },
				options: [
					{
						displayName: 'Choice',
						name: 'choice',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								required: true,
								description: 'Key used for this answer in the output',
							},
							{
								displayName: 'Instructions',
								name: 'instructions',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								required: true,
							},
							{
								displayName: 'Criteria',
								name: 'criteria',
								type: 'json',
								default: '{\n  "option_a": null,\n  "option_b": null\n}',
								required: true,
								description: 'JSON object mapping each option to its description or null',
							},
						],
					},
					{
						displayName: 'Score',
						name: 'score',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								required: true,
								description: 'Key used for this answer in the output',
							},
							{
								displayName: 'Instructions',
								name: 'instructions',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								required: true,
							},
							{
								displayName: 'Criteria',
								name: 'criteria',
								type: 'json',
								default: '[\n  "Low",\n  "High"\n]',
								required: true,
								description: 'Ordered JSON array containing between 2 and 10 levels',
							},
						],
					},
					{
						displayName: 'Noul',
						name: 'noul',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								required: true,
								description: 'Key used for this answer in the output',
							},
							{
								displayName: 'Instructions',
								name: 'instructions',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								required: true,
							},
							{
								displayName: 'Yes Means',
								name: 'trueCriteria',
								type: 'string',
								default: '',
								description: 'Optional clarification for a value near 1',
							},
							{
								displayName: 'No Means',
								name: 'falseCriteria',
								type: 'string',
								default: '',
								description: 'Optional clarification for a value near 0',
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
				displayOptions: { show: { questionInput: ['json'] } },
				description:
					'A non-empty object of TypeSafe questions. Use this mode for structured instructions and criteria.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const node = this.getNode();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const stateInput = this.getNodeParameter('stateInput', itemIndex) as 'text' | 'json';
				const questionInput = this.getNodeParameter('questionInput', itemIndex) as
					| 'guided'
					| 'json';
				const state =
					stateInput === 'text'
						? this.getNodeParameter('stateText', itemIndex)
						: parseJson(node, this.getNodeParameter('stateJson', itemIndex), 'State');
				if (
					stateInput === 'json' &&
					(typeof state !== 'object' || state === null)
				) {
					throw new NodeOperationError(node, 'JSON state must be an object or array');
				}
				const questions =
					questionInput === 'guided'
						? buildGuidedQuestions(
								node,
								this.getNodeParameter('questions', itemIndex, {}) as GuidedQuestions,
							)
						: validateRawQuestions(
								node,
								this.getNodeParameter('questionsJson', itemIndex),
							);

				const model = (this.getNodeParameter('model', itemIndex) as string).trim();
				if (!model) throw new NodeOperationError(node, 'Model cannot be empty');

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: 'https://api.typesafe.ai/v1/systemone',
					body: {
						state,
						model,
						questions,
					},
					json: true,
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'typeSafeApi',
					options,
				);
				returnData.push(...this.helpers.returnJsonArray(response as IDataObject).map((item) => ({
					...item,
					pairedItem: { item: itemIndex },
				})));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				throw new NodeOperationError(node, error, { itemIndex });
			}
		}

		return [returnData];
	}
}
