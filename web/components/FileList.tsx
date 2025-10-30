'use client'

import type { SearchResult } from '@shared/types/api'

interface FileListProps {
  files: SearchResult[]
  emptyMessage?: string
}

export default function FileList({ files, emptyMessage = 'No files found' }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600 dark:text-gray-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {files.map((file, index) => (
        <div
          key={file.id || `${file.path}-${index}`}
<<<<<<< HEAD
          className="glass-light dark:glass-dark rounded-lg p-4 hover:shadow-lg hover:scale-[1.01] transition-all"
=======
          className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
>>>>>>> origin/main
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 break-all">
                {file.path}
              </h3>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <span>Repository: {file.projectRoot}</span>
                {file.indexedAt && (
                  <span>
                    Indexed: {new Date(file.indexedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {file.snippet && (
            <div className="mt-3">
<<<<<<< HEAD
              <pre className="glass-light dark:glass-dark p-3 rounded text-sm overflow-x-auto">
=======
              <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm overflow-x-auto">
>>>>>>> origin/main
                <code className="text-gray-800 dark:text-gray-200">
                  {file.snippet}
                </code>
              </pre>
            </div>
          )}

          {file.dependencies && file.dependencies.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Dependencies:
              </div>
              <div className="flex flex-wrap gap-2">
                {file.dependencies.map((dep, depIndex) => (
                  <span
                    key={`${dep}-${depIndex}`}
<<<<<<< HEAD
                    className="px-2 py-1 glass-light dark:glass-dark bg-blue-100/50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded text-xs font-medium"
=======
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium"
>>>>>>> origin/main
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
