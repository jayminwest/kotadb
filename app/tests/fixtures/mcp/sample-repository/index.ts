/**
 * Sample TypeScript file for MCP indexing tests
 */

export interface User {
	id: string;
	name: string;
	email: string;
}

export class UserService {
	private users: Map<string, User> = new Map();

	constructor() {
		this.users = new Map();
	}

	async findUser(id: string): Promise<User | null> {
		return this.users.get(id) || null;
	}

	async createUser(user: User): Promise<void> {
		this.users.set(user.id, user);
	}

	async deleteUser(id: string): Promise<boolean> {
		return this.users.delete(id);
	}
}

export const defaultUserService = new UserService();
