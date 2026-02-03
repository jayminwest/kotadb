/**
 * Fixture with major syntax error: unclosed brace
 * Tests partial recovery with incomplete block
 */

export function validFunction(): string {
	return "This function is valid";
}

export class ValidClass {
	method(): void {
		// This method is valid
	}
}

export function brokenFunction(): number {
	if (true) {
		return 42;
	// Missing closing brace for if block and function

export function afterBroken(): void {
	// This function comes after broken code
	// Parser may or may not recover to find this
}

export const validConst = "after error";
