/**
 * In-memory storage adapter for testing and standalone use.
 *
 * Stores all data in Map structures in memory. Data is lost when
 * the process exits. Ideal for testing and quick prototyping.
 */

import type { StorageAdapter } from "../types/storage.js";
import type { Symbol } from "../types/symbol.js";
import type { Reference } from "../types/reference.js";
import type { DependencyEdge } from "../types/dependency.js";

/**
 * In-memory storage adapter.
 *
 * Uses Map structures to store symbols, references, and dependencies.
 * All data is stored in memory and cleared when the adapter is destroyed.
 */
export class MemoryStorageAdapter implements StorageAdapter {
	private symbols: Map<string, Array<Symbol & { id: string; fileId: string }>>;
	private references: Map<
		string,
		Array<Reference & { id: string; fileId: string }>
	>;
	private dependencies: Array<DependencyEdge & { id: string }>;

	constructor() {
		this.symbols = new Map();
		this.references = new Map();
		this.dependencies = [];
	}

	async storeSymbol(fileId: string, symbol: Symbol): Promise<string> {
		const id = crypto.randomUUID();
		const stored = { ...symbol, id, fileId };

		if (!this.symbols.has(fileId)) {
			this.symbols.set(fileId, []);
		}
		this.symbols.get(fileId)!.push(stored);

		return id;
	}

	async storeReference(fileId: string, reference: Reference): Promise<string> {
		const id = crypto.randomUUID();
		const stored = { ...reference, id, fileId };

		if (!this.references.has(fileId)) {
			this.references.set(fileId, []);
		}
		this.references.get(fileId)!.push(stored);

		return id;
	}

	async storeDependency(dependency: DependencyEdge): Promise<string> {
		const id = crypto.randomUUID();
		const stored = { ...dependency, id };

		this.dependencies.push(stored);

		return id;
	}

	async getSymbolsByFile(fileId: string): Promise<Symbol[]> {
		const fileSymbols = this.symbols.get(fileId) || [];
		// Remove id and fileId before returning
		return fileSymbols.map(({ id, fileId, ...symbol }) => symbol);
	}

	async getReferencesByFile(fileId: string): Promise<Reference[]> {
		const fileReferences = this.references.get(fileId) || [];
		// Remove id and fileId before returning
		return fileReferences.map(({ id, fileId, ...reference }) => reference);
	}

	async getDependenciesByFile(fileId: string): Promise<DependencyEdge[]> {
		const fileDeps = this.dependencies.filter(
			(dep) => dep.fromFileId === fileId || dep.toFileId === fileId,
		);
		// Remove id before returning
		return fileDeps.map(({ id, ...dependency }) => dependency);
	}

	async clear(): Promise<void> {
		this.symbols.clear();
		this.references.clear();
		this.dependencies = [];
	}
}
