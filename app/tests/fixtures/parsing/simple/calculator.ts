/**
 * Calculator class demonstrating class symbol extraction
 */
export class Calculator {
	private history: number[] = [];

	/**
	 * Adds two numbers
	 * @param a - First number
	 * @param b - Second number
	 * @returns Sum of a and b
	 */
	add(a: number, b: number): number {
		const result = a + b;
		this.history.push(result);
		return result;
	}

	/**
	 * Subtracts b from a
	 * @param a - First number
	 * @param b - Second number
	 * @returns Difference of a and b
	 */
	subtract(a: number, b: number): number {
		const result = a - b;
		this.history.push(result);
		return result;
	}

	/**
	 * Multiplies two numbers
	 */
	multiply(a: number, b: number): number {
		const result = a * b;
		this.history.push(result);
		return result;
	}

	/**
	 * Divides a by b
	 * @throws Error if b is zero
	 */
	divide(a: number, b: number): number {
		if (b === 0) {
			throw new Error("Division by zero");
		}
		const result = a / b;
		this.history.push(result);
		return result;
	}

	/**
	 * Gets calculation history
	 */
	getHistory(): number[] {
		return [...this.history];
	}

	/**
	 * Clears calculation history
	 */
	clearHistory(): void {
		this.history = [];
	}
}

/**
 * Factory function for creating calculator instances
 */
export function createCalculator(): Calculator {
	return new Calculator();
}
