/**
 * Entry point for simple fixture
 * Demonstrates imports and re-exports
 */

import { Calculator, createCalculator } from "./calculator";
import type { Product, Result, Status, User } from "./types";
import { doubleNumber, err, formatUserName, isValidEmail, ok } from "./utils";

// Re-export commonly used items
export { Calculator, createCalculator };
export { formatUserName, isValidEmail };
export type { User, Product };

/**
 * Main function demonstrating usage
 */
export function main(): void {
	const calc = createCalculator();
	const result = calc.add(5, 3);
	console.log(`5 + 3 = ${result}`);

	const doubled = doubleNumber(result);
	console.log(`Doubled: ${doubled}`);

	const user: User = {
		id: "1",
		name: "John Doe",
		email: "john@example.com",
	};

	console.log(formatUserName(user));
	console.log(`Valid email: ${isValidEmail(user.email)}`);
}

/**
 * Example of destructuring in function params
 */
export function processUser({ name, email }: User): Result<string> {
	if (!isValidEmail(email)) {
		return err("Invalid email address");
	}
	return ok(`Processed user: ${name}`);
}

/**
 * Anonymous function assigned to const
 */
const helper = (x: number): number => x * x;

/**
 * Export the helper
 */
export { helper as squareNumber };
