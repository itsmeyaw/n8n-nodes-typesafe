import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

type FullResponse = {
	body: unknown;
	headers?: Record<string, string | string[] | undefined>;
};

type FailureResponse = {
	status?: number;
	statusCode?: number;
	body?: unknown;
	data?: unknown;
	headers?: Record<string, string | string[] | undefined>;
};

type HttpFailure = {
	statusCode?: number;
	httpCode?: string | number;
	errorResponse?: unknown;
	response?: FailureResponse;
	cause?: { response?: FailureResponse };
};

const REQUEST_ID_HEADER = 'x-typesafe-request-id';
const DEFAULT_BASE_URL = 'https://api.typesafe.ai';

function secureBaseUrl(context: Context, value: unknown): string {
	let url: URL;
	try {
		url = new URL(String(value || DEFAULT_BASE_URL));
	} catch {
		throw new NodeOperationError(context.getNode(), 'Base URL must be a valid HTTPS URL');
	}

	if (url.protocol !== 'https:') {
		throw new NodeOperationError(context.getNode(), 'Base URL must use HTTPS to protect your API key');
	}

	return url.toString().replace(/\/+$/, '');
}

function readHeader(
	headers: Record<string, string | string[] | undefined> | undefined,
	name: string,
): string | undefined {
	const value = Object.entries(headers ?? {}).find(
		([key]) => key.toLowerCase() === name.toLowerCase(),
	)?.[1];
	return Array.isArray(value) ? value[0] : value;
}

function readErrorMessage(body: unknown): string | undefined {
	if (typeof body === 'string') return body.trim() || undefined;
	if (typeof body !== 'object' || body === null) return undefined;
	const value = body as {
		detail?: string | { message?: string };
		error?: string | { message?: string };
		message?: string;
	};
	if (typeof value.detail === 'string') return value.detail;
	if (typeof value.detail?.message === 'string') return value.detail.message;
	if (typeof value.error === 'string') return value.error;
	if (typeof value.error?.message === 'string') return value.error.message;
	return value.message;
}

function toApiError(context: Context, error: unknown, itemIndex?: number): NodeApiError {
	const rawError = typeof error === 'object' && error !== null ? error : { message: String(error) };
	const failure = rawError as HttpFailure;
	const response = failure.response ?? failure.cause?.response;
	const status = failure.statusCode ?? response?.status ?? response?.statusCode ?? Number(failure.httpCode);
	const requestId = readHeader(response?.headers, REQUEST_ID_HEADER);
	const message =
		readErrorMessage(response?.body) ??
		readErrorMessage(response?.data) ??
		readErrorMessage(failure.errorResponse);
	const description = [message?.trim().replace(/\.\s*$/, ''), requestId && `TypeSafe request ID: ${requestId}`]
		.filter(Boolean)
		.join('. ');

	return new NodeApiError(context.getNode(), rawError as JsonObject, {
		message: Number.isFinite(status) ? `TypeSafe API returned ${status}` : 'TypeSafe API request failed',
		description: description || undefined,
		httpCode: Number.isFinite(status) ? String(status) : undefined,
		itemIndex,
	});
}

export async function typeSafeRequest<T>(
	context: Context,
	method: IHttpRequestMethods,
	path: string,
	options: { body?: IDataObject; timeout?: number; itemIndex?: number } = {},
): Promise<{ data: T; requestId?: string }> {
	const credentials = await context.getCredentials('typeSafeApi');
	const baseUrl = secureBaseUrl(context, credentials.baseUrl);
	const request: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		body: options.body,
		json: true,
		timeout: options.timeout,
		returnFullResponse: true,
		headers: { Accept: 'application/json', 'User-Agent': '@itsmeyaw/n8n-nodes-typesafe' },
	};

	try {
		const response = (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'typeSafeApi',
			request,
		)) as FullResponse | T;
		if (typeof response === 'object' && response !== null && 'body' in response) {
			return {
				data: response.body as T,
				requestId: readHeader(response.headers, REQUEST_ID_HEADER),
			};
		}
		return { data: response as T };
	} catch (error) {
		throw toApiError(context, error, options.itemIndex);
	}
}
