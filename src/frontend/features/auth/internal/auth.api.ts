import type { AuthStatusDto, LoginRequestDto } from '../../../../shared/dto/auth.ts';
import { get, post } from '../../../http/http.ts';

export class AuthApi {
  status(): Promise<AuthStatusDto> {
    return get<AuthStatusDto>('/auth/status');
  }

  async login(password: string): Promise<void> {
    const body: LoginRequestDto = { password };
    await post('/auth/login', body);
  }

  async logout(): Promise<void> {
    await post('/auth/logout');
  }
}
