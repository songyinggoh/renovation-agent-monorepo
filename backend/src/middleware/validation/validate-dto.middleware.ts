import { plainToInstance, ClassConstructor } from "class-transformer";
import { validate } from "class-validator";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors.js";

export function validateDto<T extends object>(dtoClass: ClassConstructor<T>) {
	return async (req: Request, res: Response, next: NextFunction) => {
		const dtoObject = plainToInstance(dtoClass, req.body, {
			excludeExtraneousValues: true,
		});
		const errors = await validate(dtoObject);

		if (errors.length > 0) {
			const errorMessages = errors
				.map((error) => Object.values(error.constraints || {}))
				.flat();
			return next(
				new AppError(`Validation failed: ${errorMessages.join(", ")}`, 400)
			);
		}

		req.body = dtoObject;
		next();
	};
}
