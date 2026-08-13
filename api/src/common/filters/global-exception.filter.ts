import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
        error = (res.error as string) ?? exception.name;
      }
    } else if (exception instanceof QueryFailedError) {
      statusCode = HttpStatus.CONFLICT;
      const pgError = exception as QueryFailedError & { code?: string; detail?: string };
      if (pgError.code === '23505') {
        message = pgError.detail ?? 'Duplicate entry';
        error = 'Conflict';
      } else if (pgError.code === '23503') {
        message = 'Impossible de supprimer cet élément : il est référencé par d\'autres données (réservations, paiements…).';
        error = 'Conflict';
      } else {
        message = 'Database error';
        error = 'Database Error';
        // Log full PG error details for debugging
        this.logger.error(
          `PG error code=${pgError.code} detail=${pgError.detail} query=${(exception as any).query ?? ''}`,
        );
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `${request.method} ${request.url} → ${statusCode}: ${Array.isArray(message) ? message.join(', ') : message}`,
    );

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
