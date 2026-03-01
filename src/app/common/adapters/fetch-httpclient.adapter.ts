import type {
  HttpClient,
  HttpRequest,
  HttpResponse,
} from '../interfaces/http-client'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

export class FetchHttpClientAdapter implements HttpClient {
  private defaultHeaders = {
    'Content-Type': 'application/json',
  }

  private async request<TResponse, TBody = unknown>(
    method: Method,
    url: string,
    body?: TBody,
    options?: Omit<HttpRequest<TBody>, 'url' | 'method' | 'body'>,
  ): Promise<HttpResponse<TResponse>> {
    const response = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    })

    const contentType = response.headers.get('content-type')
    const isJson = contentType?.includes('application/json')

    const responseBody = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      const error = responseBody as unknown as { message: string }
      throw new Error(error.message)
    }

    return {
      data: responseBody as TResponse,
      status: response.status,
    }
  }

  get<TResponse = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>,
  ) {
    return this.request<TResponse>('GET', url, undefined, options)
  }

  post<TResponse = unknown, TBody = unknown>(
    url: string,
    body: TBody,
    options?: Omit<HttpRequest<TBody>, 'url' | 'method' | 'body'>,
  ) {
    return this.request<TResponse, TBody>('POST', url, body, options)
  }

  put<TResponse = unknown, TBody = unknown>(
    url: string,
    body: TBody,
    options?: Omit<HttpRequest<TBody>, 'url' | 'method' | 'body'>,
  ) {
    return this.request<TResponse, TBody>('PUT', url, body, options)
  }

  delete<TResponse = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>,
  ) {
    return this.request<TResponse>('DELETE', url, undefined, options)
  }
}
