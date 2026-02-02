/**
 * Fixture with minor syntax error: missing semicolon
 * This should be recoverable via error-tolerant parsing
 */

export function greet(name: string): string {
	return `Hello, ${name}!`
}

// Missing semicolon on const declaration
export const PI = 3.14159

export function add(a: number, b: number): number {
	return a + b;
}

export class Calculator {
	value: number = 0

	add(n: number): this {
		this.value += n
		return this
	}
}
