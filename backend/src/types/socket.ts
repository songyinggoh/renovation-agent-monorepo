import { Socket } from 'socket.io';
import { User } from '@supabase/supabase-js';

export interface AuthenticatedSocket extends Socket {
  user?: User;
}