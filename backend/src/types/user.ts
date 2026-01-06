export type UserRole = 'admin' | 'user';

export interface IUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: UserRole;
} 