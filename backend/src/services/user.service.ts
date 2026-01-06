import { User } from '../models/user.model';
import { UserRepository } from '../repository/user.repository';
import { ICreateUserDto } from '../types/user';
import { AppError } from '../middleware/errorHandler';

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }

  async createUser(userData: ICreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new AppError(400, 'User with this email already exists');
    }

    return this.userRepository.create(userData);
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const updatedUser = await this.userRepository.update(id, userData);
    if (!updatedUser) {
      throw new AppError(404, 'User not found');
    }
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const deleted = await this.userRepository.delete(id);
    if (!deleted) {
      throw new AppError(404, 'User not found');
    }
  }
} 