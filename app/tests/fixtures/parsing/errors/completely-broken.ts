/**
 * Fixture that is completely unparseable
 * Tests regex fallback when AST parsing completely fails
 */

{{{{
	export function shouldNotParse(): void {
}}}

@@@ invalid syntax @@@

export function hiddenFunction(param: string): number {
	return param.length;
}

export class HiddenClass {
	constructor() {}
	
	method(): void {
		// Method body
	}
}

export const HIDDEN_CONST = "value";

export interface HiddenInterface {
	field: string;
}

!!! more garbage !!!
