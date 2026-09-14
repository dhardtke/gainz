import type { EditSetDto, LiftSetDto } from '../../../../shared/dto/index.ts';
import type { LiftSetId } from '../../../../shared/flavors.ts';
import { patch, remove } from '../../../http/http.ts';

export class SetApi {
  update(id: LiftSetId, dto: EditSetDto): Promise<LiftSetDto> {
    return patch(`/sets/${id}`, dto);
  }

  delete(id: LiftSetId): Promise<null> {
    return remove(`/sets/${id}`);
  }
}
