import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { ICreateUserDto } from '../types/user';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.userService.getAllUsers();
      res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.getUserById(req.params.id);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userData: ICreateUserDto = req.body;
      const newUser = await this.userService.createUser(userData);
      res.status(201).json({ success: true, data: newUser });
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updatedUser = await this.userService.updateUser(req.params.id, req.body);
      res.json({ success: true, data: updatedUser });
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.userService.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
} 