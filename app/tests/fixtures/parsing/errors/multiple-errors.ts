/**
 * Fixture with multiple syntax errors
 * Tests extraction from code with mixed valid/invalid sections
 */

// Valid section at start
export function validStart(): string {
	return "valid";
}

export interface ValidInterface {
	name: string;
	value: number;
}

// Invalid section - syntax error
export function broken1( {
	return "broken";
}

// Another valid section
export const CONSTANT = 42;

export class AnotherValidClass {
	prop: string = "hello";
	
	method(): void {}
}

// Another invalid section
export function broken2(): void
	// Missing brace
	return;
}

// More valid code after errors
export type ValidType = string | number;

export const anotherValid = () => {
	return true;
};
