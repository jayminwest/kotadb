'use client'

const tools = [
  {
    name: 'search_code',
    description: 'Search indexed code files for specific keywords or patterns. Returns matching files with context snippets.',
    params: 'term (required), repository (optional), limit (optional)'
  },
  {
    name: 'index_repository',
    description: 'Queue a repository for indexing. Supports GitHub URLs or local paths. Returns a run ID to track progress.',
    params: 'repository (required), ref (optional), localPath (optional)'
  },
  {
    name: 'list_recent_files',
    description: 'List recently indexed files ordered by indexing timestamp. Useful for seeing what code is available.',
    params: 'limit (optional)'
  },
  {
    name: 'search_dependencies',
    description: 'Search the dependency graph to find files that depend on or are depended on by a target file. Useful for impact analysis.',
    params: 'file_path (required), repository (optional), direction (optional), depth (optional)'
  }
]

export default function ToolReference() {
  return (
    <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Available MCP Tools
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Once configured, you can use these tools in Claude Code to interact with KotaDB:
      </p>
      <div className="space-y-4">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="p-4 glass-light dark:glass-dark rounded-md border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-500 mt-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{tool.name}</code>
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {tool.description}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  <strong>Parameters:</strong> {tool.params}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
          Example Usage
        </h3>
        <code className="block text-xs text-blue-700 dark:text-blue-300 font-mono whitespace-pre-wrap">
          {`# In Claude Code, you can ask:
"Search for authentication functions in my codebase"
"Index this repository: https://github.com/user/repo"
"Show me recent files that were indexed"
"Find all files that depend on src/auth/middleware.ts"`}
        </code>
      </div>
    </div>
  )
}
