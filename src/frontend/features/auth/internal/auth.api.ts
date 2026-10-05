import type { LoginRequestDto } from '../../../../shared/dto/auth.ts';
import { post } from '../../../http/http.ts';

export class AuthApi {
  async login(password: string): Promise<void> {
    const body: LoginRequestDto = { password };
    await post('/auth/login', body);
  }

  async logout(): Promise<void> {
    await post('/auth/logout');
  }
}
