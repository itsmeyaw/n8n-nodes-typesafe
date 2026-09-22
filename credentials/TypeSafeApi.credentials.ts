import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class TypeSafeApi implements ICredentialType {
	name = 'typeSafeApi';

	displayName = 'TypeSafe AI API';

	icon: Icon = {
		light: 'file:../nodes/TypeSafe/typesafe.svg',
		dark: 'file:../nodes/TypeSafe/typesafe.dark.svg',
	};

	documentationUrl = 'https://docs.typesafe.ai/introduction/quickstart';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			validateType: 'url',
			default: 'https://api.typesafe.ai',
			description:
				'HTTPS URL for a TypeSafe proxy or dedicated deployment. Workflow requests reject HTTP URLs to protect your API key.',
			hint: 'Must start with https://',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials.baseUrl?.toLowerCase().startsWith("https://") ? $credentials.baseUrl.replace(/\\/+$/, "") : "https://invalid.invalid"}}',
			url: '/v1/models',
			method: 'GET',
		},
	};
}
