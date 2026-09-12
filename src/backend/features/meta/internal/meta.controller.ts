import type { HealthDto } from '../../../../shared/dto';
import { errorResponse, notFound } from '../../../http/errors.ts';
import { json } from '../../../http/http.ts';

export class MetaController {
  health(): Response {
    const body: HealthDto = { status: 'ok', app: 'gainz' };
    return json(body);
  }

  endpointNotFound(): Response {
    return errorResponse(notFound('Endpoint'));
  }
}
