export interface HealthDto {
  status: 'ok';
  app: 'gainz';
  /** Whether the API asks for a login, which is whether `GAINZ_PASSWORD_HASH` is set. */
  auth: boolean;
}
