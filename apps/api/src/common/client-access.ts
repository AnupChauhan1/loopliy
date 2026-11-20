import { SetMetadata } from '@nestjs/common';

export const CLIENT_ACCESS_KEY = 'clientAccess';
export const ClientAccess = () => SetMetadata(CLIENT_ACCESS_KEY, true);
