import { Role } from '../../../common/enums';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: Role;
}
