import { IUser, UserRole } from '../types/user.js';

export class User implements IUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  private password!: string;

  constructor(data: Partial<IUser>) {
    this.id = data.id || '';
    this.email = data.email || '';
    this.firstName = data.firstName || '';
    this.lastName = data.lastName || '';
    this.role = data.role || 'user';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  public setPassword(password: string): void {
    // In a real application, you would hash the password here
    this.password = password;
  }

  public getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
} 