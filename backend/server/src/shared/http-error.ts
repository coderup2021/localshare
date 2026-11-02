export type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 416 | 429 | 503

export class HttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: HttpErrorStatus,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
