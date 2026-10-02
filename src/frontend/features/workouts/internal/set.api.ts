import type { EditSetDto, LiftSetDto, MoveSetDto } from '../../../../shared/dto/set.ts';
import type { LiftSetId } from '../../../../shared/flavors.ts';
import { patch, post, remove } from '../../../http/http.ts';

export class SetApi {
  update(id: LiftSetId, dto: EditSetDto): Promise<LiftSetDto> {
    return patch(`/sets/${id}`, dto);
  }

  move(id: LiftSetId, dto: MoveSetDto): Promise<LiftSetDto[]> {
    return post(`/sets/${id}/move`, dto);
  }

  delete(id: LiftSetId): Promise<null> {
    return remove(`/sets/${id}`);
  }
}
